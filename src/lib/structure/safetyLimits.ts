/**
 * Two checkpoints, deliberately separate and checked at different points in the pipeline:
 *
 * 1. MAX_SOURCE_VOLUME — checked immediately after a parser reads a structure's declared
 *    size/region bounds, before iterating any block list. This is the only real defense against
 *    a corrupt or mistaken custom upload claiming an absurd size, since the block-list iteration
 *    itself is O(volume) and shouldn't even start on a bogus file. Vanilla's real structure block
 *    caps structures at 48x48x48 (110,592 cells) — this cap is set well above that, since it
 *    mainly needs to guard custom-uploaded .litematic files, which aren't bound by that limit.
 *
 * 2. MAX_FINAL_VOXELS — checked in buildStructureVoxelGrid.ts against the real solid-voxel count
 *    the composed grid is about to hold (VoxelGrid's `voxels` is a sparse map — see its own doc —
 *    so this is genuine memory/CPU cost, not a bounding-box estimate). This is deliberately NOT a
 *    bounding-box check: a shape that's mostly air relative to its bounding box (a tree's rounded
 *    canopy, a thin fence line) shouldn't be capped for empty space it no longer pays to store.
 */
export const MAX_SOURCE_VOLUME = 1_000_000;
export const MAX_FINAL_VOXELS = 4_000_000;

export function checkVolume(volume: number, cap: number, context: string): void {
  if (volume > cap) {
    throw new Error(
      `${context} would require ${volume.toLocaleString()} voxels, over the ${cap.toLocaleString()} limit. ` +
        `Pick a smaller structure or a lower resolution.`
    );
  }
}
