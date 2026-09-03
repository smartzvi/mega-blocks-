import type { PaletteEntry } from '../../types/minecraft';

/**
 * Whether a source block/item name is a real vanilla planks block — every plank type ends in
 * `_planks`, matched by suffix the same way `isBedFamilySource` (lightSourceExclusion.ts) matches
 * `_bed`.
 */
export function isPlanksFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  return bare.endsWith('_planks');
}

/**
 * Strips every `endGrainTopBottom`-flagged palette entry (real logs/stems — see
 * FullCubeBlockDef's doc) for a planks source, on ALL faces, not just top/bottom.
 *
 * Found via a real-jar investigation of an explicit user report ("stairs don't blend, weird
 * frame separating them") with before/after reference images: an `oak_planks` stair's tread
 * (top-face matched data, mostly clean `oak_planks`/`spruce_planks`) and its taller back portion
 * (side-face matched data) looked like two different materials, because `endGrainTopBottom` only
 * excludes logs from the top/bottom faces — real bark textures (`oak_log`, `stripped_oak_log`,
 * ...) stay fully eligible on the 4 side faces, and confirmed via direct matchAllFaces output,
 * they win the *majority* of oak_planks' own side-face pixels (`stripped_oak_log` alone: 552/1024
 * at resolution 32) since their own average color happens to be closer to some of the plank
 * texture's darker grain-line pixels than any actual plank is.
 *
 * **Only meant to be applied for non-`full_cube` shapes** — a plain cube spreads this same bark
 * mixing evenly across all 6 faces, which per direct follow-up user feedback reads as pleasant
 * wood-grain texture detail, not a mismatch (removing it there made a plain plank cube look
 * "empty"/flatter than before, a real regression from an earlier version of this fix that applied
 * it unconditionally). It's specifically the stair/slab/door cutout that creates the visible seam,
 * by putting a top-face-matched region (the tread) directly next to a side-face-matched region
 * (the tall back wall) within one shape — nothing else does that. `BlockSearch.tsx` is the only
 * call site, and applies this conditionally on `state.shape !== 'full_cube'`; it is deliberately
 * NOT applied in `buildItemVoxelGrid.ts` (Item mode has no shape concept — an item-mode `_planks`
 * selection is always a plain full cube, so it should always keep the richer, unrestricted look).
 */
export function filterPaletteForPlanksSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (!isPlanksFamilySource(sourceName)) return palette;
  const restricted = palette.filter((entry) => !entry.endGrainTopBottom);
  return restricted.length > 0 ? restricted : palette;
}
