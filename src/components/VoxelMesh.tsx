import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PaletteEntry, VoxelGrid } from '../types/minecraft';
import { packVoxelGrid } from '../lib/voxel/packGrid';
import type { VoxelMeshChunk } from '../lib/render/voxelMesher';
import { meshVoxelsAsync } from '../lib/render/meshClient';
import { buildTextureAtlas, faceTilesFor } from '../lib/render/textureAtlas';

/** One material for the whole preview: the palette's atlas, shaded per face by vertex colour. */
function useAtlasMaterial(palette: PaletteEntry[]) {
  return useMemo(() => {
    const atlas = buildTextureAtlas(palette);
    const texture = new THREE.CanvasTexture(atlas.canvas);
    texture.flipY = false;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, vertexColors: true });
    return { atlas, material };
  }, [palette]);
}

function chunkGeometry(chunk: VoxelMeshChunk): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(chunk.positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(chunk.uvs, 2, true));
  geometry.setAttribute('color', new THREE.BufferAttribute(chunk.shades, 3, true));
  geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

interface ChunkMesh {
  geometry: THREE.BufferGeometry;
  position: [number, number, number];
}

/**
 * The build, as merged chunk meshes with only the faces that touch air (see voxelMesher.ts for why
 * this replaced one instanced cube per voxel), meshed in a background worker so a big build doesn't
 * freeze the page. The previous build stays on screen until the new one is ready. Voxel (x, y, z)
 * spans the unit box centred on (x - offsetX, y - offsetY, z - offsetZ), so the build is centred on
 * the origin.
 */
export function VoxelMesh({ grid, palette, onBusyChange }: { grid: VoxelGrid; palette: PaletteEntry[]; onBusyChange?: (busy: boolean) => void }) {
  const { atlas, material } = useAtlasMaterial(palette);
  const invalidate = useThree((s) => s.invalidate);
  const [meshes, setMeshes] = useState<ChunkMesh[]>([]);

  useEffect(() => {
    let cancelled = false;
    onBusyChange?.(true);
    const packed = packVoxelGrid(grid);
    const offsetX = (grid.sizeX - 1) / 2 + 0.5;
    const offsetY = (grid.sizeY - 1) / 2 + 0.5;
    const offsetZ = (grid.sizeZ - 1) / 2 + 0.5;

    meshVoxelsAsync({ keys: packed.keys, ids: packed.ids, faceTiles: faceTilesFor(packed.table, atlas), tileUvs: atlas.tileUvs })
      .then((chunks) => {
        if (cancelled) return;
        setMeshes(
          chunks.map((chunk) => ({
            geometry: chunkGeometry(chunk),
            position: [chunk.origin[0] - offsetX, chunk.origin[1] - offsetY, chunk.origin[2] - offsetZ],
          }))
        );
      })
      .catch((error) => console.error('Preview meshing failed:', error))
      .finally(() => {
        if (!cancelled) onBusyChange?.(false);
      });

    return () => {
      cancelled = true;
    };
  }, [grid, atlas, onBusyChange]);

  // The canvas only redraws on demand in orbit view, so ask for a frame once the new meshes are
  // actually in the scene (after this commit), not when they're set, or the frame shows the old ones.
  useEffect(() => {
    invalidate();
    return () => meshes.forEach((m) => m.geometry.dispose());
  }, [meshes, invalidate]);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material]
  );

  return (
    <group>
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={material} position={m.position} />
      ))}
    </group>
  );
}
