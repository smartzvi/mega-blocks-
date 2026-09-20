import type { FaceName, PaletteEntry, VoxelGrid } from '../../types/minecraft';
import type { TextureDecoder } from '../models/buildItemVoxelGrid';
import { buildStructureBlockStamp } from './buildStructureBlockStamp';
import { throttledProgress, type BuildProgressCallback } from './buildProgress';
import { cullComposedInterior } from './cullComposedInterior';
import { MAX_FINAL_VOXELS, checkVolume } from './safetyLimits';
import { createVoxelGrid, forEachVoxel, getVoxel, setVoxel } from '../voxel/voxelGrid';

type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;

const NEIGHBOR_DIRECTIONS: ReadonlyArray<readonly [FaceName, number, number, number]> = [
  ['top', 0, 1, 0],
  ['bottom', 0, -1, 0],
  ['north', 0, 0, -1],
  ['south', 0, 0, 1],
  ['east', 1, 0, 0],
  ['west', -1, 0, 0],
];

const NO_SUPPRESSED_FACES: ReadonlySet<FaceName> = new Set();

/** True for any stair blockstate key, regardless of facing/shape/half — checked against the bare
 *  name (blockstateKey.ts's `Name[prop=val,...]` format), same technique cullInteriorVoxels.ts's
 *  isNonOccluding uses. Stairs are deliberately never suppressed and never counted as a
 *  same-block neighbor for suppression purposes, per explicit instruction not to touch the
 *  already-tuned stair rendering/seam behavior while fixing this unrelated same-block-adjacency
 *  seam. */
function isStairsBlock(blockId: string): boolean {
  return blockId.split('[')[0].replace('minecraft:', '').includes('stairs');
}

/** Which world-direction faces of this solid source cell should be excluded from winning an edge
 *  voxel's color in its stamp (see rasterizeItemModel.ts's own doc on `suppressedFaces`) — exactly
 *  the directions where the real neighboring source cell is this same exact block (same name,
 *  same properties, so its rotated model genuinely continues the same texture/orientation across
 *  that boundary). Stairs are excluded entirely (never suppressed, regardless of neighbors) so
 *  their already-verified rendering never changes. */
function suppressedFacesFor(culled: VoxelGrid, sx: number, sy: number, sz: number, blockId: string): ReadonlySet<FaceName> {
  if (isStairsBlock(blockId)) return NO_SUPPRESSED_FACES;
  const suppressed = new Set<FaceName>();
  for (const [face, dx, dy, dz] of NEIGHBOR_DIRECTIONS) {
    if (getVoxel(culled, sx + dx, sy + dy, sz + dz) === blockId) suppressed.add(face);
  }
  return suppressed;
}

function stampCacheKey(blockId: string, suppressedFaces: ReadonlySet<FaceName>): string {
  return suppressedFaces.size === 0 ? blockId : `${blockId}::${[...suppressedFaces].sort().join(',')}`;
}

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
 *
 * A stamp still can't see its real neighbors *while being built*, though — cullComposedInterior
 * only removes voxels that end up fully buried, but an axis-oriented block (a log, a pillar) has
 * edge voxels that stay genuinely visible (the trunk's own outer rim) whose COLOR was decided as
 * if this stamp were standalone, always letting a real top/bottom face win there. Stack two
 * identical logs and each one's own top/bottom rim renders in end-grain color right up against the
 * other's — a visible ring exactly at the seam, even though that boundary is fully interior in
 * real Minecraft. `suppressedFacesFor` (above) computes, per solid source cell, which world
 * directions have a real neighbor that's this exact same block (same properties — so its rotated
 * model genuinely continues the same way across that boundary); rasterizeItemModel.ts then lets
 * the side texture carry through there instead of end-capping. Stamps are cached per distinct
 * (blockId, suppressed-face-set) combination rather than per blockId alone, so a run of N identical
 * logs still only builds a handful of stamp variants (isolated / capped-one-end / fully-continuous),
 * not one per position. Stairs are deliberately excluded (see isStairsBlock) — their own seam
 * behavior was separately investigated and tuned, and must not change here.
 */
export async function buildStructureVoxelGrid(
  culled: VoxelGrid,
  blockIds: Set<string>,
  palette: PaletteEntry[],
  decodeTexture: TextureDecoder,
  blockStateFiles: FileLoaderMap,
  modelFiles: FileLoaderMap,
  resolution: number,
  onProgress?: BuildProgressCallback
): Promise<VoxelGrid> {
  const sizeX = culled.sizeX * resolution;
  const sizeY = culled.sizeY * resolution;
  const sizeZ = culled.sizeZ * resolution;

  const reportStamps = throttledProgress('stamps', onProgress);
  const reportPlace = throttledProgress('place', onProgress);
  const reportTrim = throttledProgress('trim', onProgress);

  const stamps = new Map<string, VoxelGrid>();
  async function getStamp(blockId: string, suppressedFaces: ReadonlySet<FaceName>): Promise<VoxelGrid> {
    const key = stampCacheKey(blockId, suppressedFaces);
    let stamp = stamps.get(key);
    if (!stamp) {
      stamp = await buildStructureBlockStamp(blockId, blockStateFiles, modelFiles, decodeTexture, palette, resolution, suppressedFaces);
      stamps.set(key, stamp);
    }
    return stamp;
  }

  // Build the plain (no-suppression) stamp for every registered id up front, same as before —
  // guarantees one exists even for an id that's registered (e.g. by knownStructureFixes.ts) but
  // not actually present in `culled`.
  let stampsDone = 0;
  for (const id of blockIds) {
    await getStamp(id, NO_SUPPRESSED_FACES);
    reportStamps(++stampsDone / (blockIds.size + culled.voxels.size));
  }

  const solidCellPositions: Array<readonly [number, number, number, string]> = [];
  forEachVoxel(culled, (sx, sy, sz, blockId) => solidCellPositions.push([sx, sy, sz, blockId]));

  const cells: Array<{ ox: number; oy: number; oz: number; stamp: VoxelGrid }> = [];
  let solidVoxelCount = 0;
  for (const [sx, sy, sz, blockId] of solidCellPositions) {
    const stamp = await getStamp(blockId, suppressedFacesFor(culled, sx, sy, sz, blockId));
    solidVoxelCount += stamp.voxels.size;
    cells.push({ ox: sx * resolution, oy: sy * resolution, oz: sz * resolution, stamp });
    reportStamps(++stampsDone / (blockIds.size + solidCellPositions.length));
  }
  checkVolume(solidVoxelCount, MAX_FINAL_VOXELS, 'This structure at this resolution');
  reportStamps(1);

  const grid = createVoxelGrid(sizeX, sizeY, sizeZ);
  let placed = 0;
  for (const { ox, oy, oz, stamp } of cells) {
    forEachVoxel(stamp, (x, y, z, v) => {
      setVoxel(grid, ox + x, oy + y, oz + z, v);
    });
    reportPlace(++placed / cells.length);
  }
  reportPlace(1);

  const trimmed = cullComposedInterior(grid, reportTrim);
  reportTrim(1);
  return trimmed;
}
