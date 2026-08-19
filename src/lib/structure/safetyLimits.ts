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
 * 2. MAX_FINAL_VOXELS — checked after the cheap source-grid cull pass, before allocating the
 *    upscaled grid. Deliberately independent of the renderer: parsing/culling/upscaling into JS
 *    arrays costs real memory/CPU regardless of how the result is drawn, and culling reduces
 *    render/instance cost but does NOT reduce the base VoxelGrid's dense-array footprint (culled
 *    cells become `null` entries, not fewer array cells).
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
