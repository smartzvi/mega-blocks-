import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { FaceName, FaceTexture, PaletteEntry, VoxelGrid } from '../types/minecraft';

// THREE.BoxGeometry material group order is [+x, -x, +y, -y, +z, -z].
const BOX_FACE_ORDER: FaceName[] = ['east', 'west', 'top', 'bottom', 'south', 'north'];

/** A palette entry's texture is usually a decoded 16x16 tile, but hand-authored templates
 *  (chest/shulker/bed/sign — see handAuthoredTemplates.ts) reference native-resolution entity
 *  atlases instead (e.g. a 64x64 chest atlas) — sizing the canvas from the texture's own
 *  width/height, not a hardcoded 16, is required or `new ImageData` throws
 *  (`IndexSizeError: input data length is not equal to 4 * width * height`) the moment one of
 *  those blocks is voxelized. */
function textureFromFace(texture: FaceTexture): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = texture.width;
  canvas.height = texture.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(texture.data), texture.width, texture.height), 0, 0);
  const canvasTexture = new THREE.CanvasTexture(canvas);
  canvasTexture.magFilter = THREE.NearestFilter;
  canvasTexture.minFilter = THREE.NearestFilter;
  canvasTexture.colorSpace = THREE.SRGBColorSpace;
  return canvasTexture;
}

/** Builds (and caches) one 6-entry MeshBasicMaterial array per palette block, reused across every
 *  voxel instance of that block. */
function useBlockMaterials(palette: PaletteEntry[]): Map<string, THREE.MeshBasicMaterial[]> {
  return useMemo(() => {
    const cache = new Map<string, THREE.MeshBasicMaterial[]>();
    for (const entry of palette) {
      const materials = BOX_FACE_ORDER.map((face) => {
        const texture = textureFromFace(entry.textures[face]);
        return new THREE.MeshBasicMaterial({ map: texture });
      });
      cache.set(entry.id, materials);
    }
    return cache;
  }, [palette]);
}

/** One InstancedMesh for every voxel of a single block ID, sharing one geometry and one 6-entry
 *  material array (multi-material InstancedMesh requires every instance in a batch to share the
 *  exact same materials — which two distinct real blocks essentially never do, since they'd need
 *  identical textures on all 6 faces). Positions are written imperatively via setMatrixAt rather
 *  than through props, since InstancedMesh's per-instance transforms aren't a React-managed
 *  property. computeBoundingSphere() is required after setting matrices — InstancedMesh's default
 *  bounding sphere is based on the base geometry alone and doesn't account for instance
 *  transforms, which would otherwise cause incorrect frustum culling (instances near the edges of
 *  a large structure vanishing even though they're on-screen). */
function InstancedBlockGroup({
  geometry,
  materials,
  positions,
}: {
  geometry: THREE.BoxGeometry;
  materials: THREE.MeshBasicMaterial[];
  positions: [number, number, number][];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    positions.forEach(([x, y, z], i) => {
      matrix.setPosition(x, y, z);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions]);

  return <instancedMesh ref={ref} args={[geometry, materials, positions.length]} />;
}

export function VoxelMesh({ grid, palette }: { grid: VoxelGrid; palette: PaletteEntry[] }) {
  const materialsByBlock = useBlockMaterials(palette);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  // Each axis gets its own centering offset so a non-cubic structure (a 2-block-tall door, a
  // 2-block-long bed) is centered on its own real extent, not squashed to match the others.
  const offsetX = (grid.sizeX - 1) / 2;
  const offsetY = (grid.sizeY - 1) / 2;
  const offsetZ = (grid.sizeZ - 1) / 2;

  // Group solid voxels by block ID: draw call count becomes "distinct block types present"
  // (typically tens) instead of "total solid voxel count" (up to millions for a real structure),
  // which is what actually makes large structures renderable — previously this rendered one
  // React <mesh> element per solid voxel.
  const groups = useMemo(() => {
    const byBlock = new Map<string, [number, number, number][]>();
    for (let x = 0; x < grid.sizeX; x++) {
      for (let y = 0; y < grid.sizeY; y++) {
        for (let z = 0; z < grid.sizeZ; z++) {
          const blockId = grid.voxels[x][y][z];
          if (!blockId || !materialsByBlock.has(blockId)) continue;
          let list = byBlock.get(blockId);
          if (!list) {
            list = [];
            byBlock.set(blockId, list);
          }
          list.push([x - offsetX, y - offsetY, z - offsetZ]);
        }
      }
    }
    return [...byBlock.entries()].map(([blockId, positions]) => ({ blockId, positions }));
  }, [grid, materialsByBlock, offsetX, offsetY, offsetZ]);

  return (
    <group>
      {groups.map(({ blockId, positions }) => (
        <InstancedBlockGroup key={blockId} geometry={geometry} materials={materialsByBlock.get(blockId)!} positions={positions} />
      ))}
    </group>
  );
}
