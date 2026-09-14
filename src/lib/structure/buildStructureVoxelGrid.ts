import type { PaletteEntry, VoxelGrid } from '../../types/minecraft';
import type { TextureDecoder } from '../models/buildItemVoxelGrid';
import { buildStructureBlockStamp } from './buildStructureBlockStamp';
import { cullComposedInterior } from './cullComposedInterior';
import { MAX_FINAL_VOXELS, checkVolume } from './safetyLimits';

type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;

/**
 * Composes the final megablock grid by voxelizing every unique block once (buildStructureBlockStamp.ts
 * — the real per-block engine, computed only per distinct ID rather than per occurrence, since a
 * structure typically reuses the same handful of block types thousands of times) into a
 * `resolution`^3 stamp, then copying that stamp into every position the block occupies in the
 * culled source grid. `resolution` is voxels-per-source-block directly (16/32/48/64), the same
 * meaning it has in block/item mode — not a multiplier on top of an already-built grid, which is
 * what the old (buggy) `upscaleStructure.ts` treated it as.
 *
 * Checks the FULL output dense array size (sizeX*sizeY*sizeZ), not just the solid-cell count,
 * against the cap before allocating it — a sparse-but-large bounding box would pass a
 * solid-count-only check easily while still requiring a dense (string|null)[][][] array far
 * larger than the cap intends.
 *
 * Finishes with cullComposedInterior.ts — each block's stamp is voxelized independently, with no
 * knowledge of its real neighbors, so two touching blocks each draw their own wall right up
 * against the other's, doubling the wall thickness at every seam. This final pass merges those
 * into a single true outer skin wherever a voxel turns out to be fully surrounded by real
 * (not just assumed) neighbors, without changing anything visible from outside.
 */
export async function buildStructureVoxelGrid(
  culled: VoxelGrid,
  blockIds: Set<string>,
  palette: PaletteEntry[],
  decodeTexture: TextureDecoder,
  blockStateFiles: FileLoaderMap,
  modelFiles: FileLoaderMap,
  resolution: number
): Promise<VoxelGrid> {
  const sizeX = culled.sizeX * resolution;
  const sizeY = culled.sizeY * resolution;
  const sizeZ = culled.sizeZ * resolution;
  checkVolume(sizeX * sizeY * sizeZ, MAX_FINAL_VOXELS, 'This structure at this resolution');

  const stamps = new Map<string, VoxelGrid>();
  for (const id of blockIds) {
    stamps.set(id, await buildStructureBlockStamp(id, blockStateFiles, modelFiles, decodeTexture, palette, resolution));
  }

  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < sizeX; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < sizeY; y++) {
      plane.push(new Array<string | null>(sizeZ).fill(null));
    }
    voxels.push(plane);
  }

  for (let sx = 0; sx < culled.sizeX; sx++) {
    for (let sy = 0; sy < culled.sizeY; sy++) {
      for (let sz = 0; sz < culled.sizeZ; sz++) {
        const blockId = culled.voxels[sx][sy][sz];
        if (!blockId) continue;
        const stamp = stamps.get(blockId)!;
        const ox = sx * resolution;
        const oy = sy * resolution;
        const oz = sz * resolution;
        for (let x = 0; x < resolution; x++) {
          for (let y = 0; y < resolution; y++) {
            for (let z = 0; z < resolution; z++) {
              const v = stamp.voxels[x][y][z];
              if (v) voxels[ox + x][oy + y][oz + z] = v;
            }
          }
        }
      }
    }
  }

  return cullComposedInterior({ sizeX, sizeY, sizeZ, voxels });
}
