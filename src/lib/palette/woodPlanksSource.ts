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
 * texture's darker grain-line pixels than any actual plank is. A plain cube spreads this evenly
 * across all 6 faces so it's easy to miss, but a stair's silhouette exposes far more side-wall
 * surface on its tall back half than its low tread — turning an even blend into a visible seam
 * between "clean plank tread" and "blotchy bark-striped back." Confirmed the fix directly: with
 * logs excluded, all 6 faces of oak_planks match identically (812 oak_planks + 212 spruce_planks
 * each), eliminating the split entirely. Real logs have a genuine end-grain surface that makes
 * them a reasonable filler for *other* builds' side faces (that's what `endGrainTopBottom` exists
 * for) — but a plank has no bark or end-grain concept anywhere on it, so this is the one source
 * family that should never reach for a log's own bark texture at all, on any face.
 */
export function filterPaletteForPlanksSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (!isPlanksFamilySource(sourceName)) return palette;
  const restricted = palette.filter((entry) => !entry.endGrainTopBottom);
  return restricted.length > 0 ? restricted : palette;
}
