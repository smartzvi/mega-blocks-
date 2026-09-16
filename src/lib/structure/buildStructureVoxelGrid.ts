import type { PaletteEntry, VoxelGrid } from '../../types/minecraft';
import type { TextureDecoder } from '../models/buildItemVoxelGrid';
import { buildStructureBlockStamp } from './buildStructureBlockStamp';
import { cullComposedInterior } from './cullComposedInterior';
import { MAX_FINAL_VOXELS, checkVolume } from './safetyLimits';
import { createVoxelGrid, forEachVoxel, setVoxel } from '../voxel/voxelGrid';

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
 * Checks the actual solid-voxel count against the cap — not the bounding box (sizeX*sizeY*sizeZ)
 * — before allocating the composed grid: the grid is a sparse map now (VoxelGrid's own doc), so a
 * bounding-box check would reject a real, cheap shape (a tree's rounded canopy, a thin fence line)
 * purely for the empty space around it, which is exactly the padding sparse storage exists to stop
 * paying for. The count is cheap to get up front: `culled` is already sparse and each unique
 * block's stamp is built (and its own `.voxels.size`, i.e. its real solid count) before this loop
 * runs, so summing `stamp.size` per solid source cell is exactly the number of entries about to be
 * written below, with no extra pass over the (potentially huge) final grid needed.
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

  const stamps = new Map<string, VoxelGrid>();
  for (const id of blockIds) {
    stamps.set(id, await buildStructureBlockStamp(id, blockStateFiles, modelFiles, decodeTexture, palette, resolution));
  }

  let solidVoxelCount = 0;
  forEachVoxel(culled, (_x, _y, _z, blockId) => {
    solidVoxelCount += stamps.get(blockId)!.voxels.size;
  });
  checkVolume(solidVoxelCount, MAX_FINAL_VOXELS, 'This structure at this resolution');

  const grid = createVoxelGrid(sizeX, sizeY, sizeZ);
  forEachVoxel(culled, (sx, sy, sz, blockId) => {
    const stamp = stamps.get(blockId)!;
    const ox = sx * resolution;
    const oy = sy * resolution;
    const oz = sz * resolution;
    forEachVoxel(stamp, (x, y, z, v) => {
      setVoxel(grid, ox + x, oy + y, oz + z, v);
    });
  });

  return cullComposedInterior(grid);
}
