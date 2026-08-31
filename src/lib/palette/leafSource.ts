import type { PaletteEntry } from '../../types/minecraft';

/**
 * Whether a source block/item name is a leaves or vine block that's genuinely supposed to be
 * green — every real vanilla leaf type plus vine, EXCEPT `cherry_leaves`: its real texture is
 * already baked-in pink (confirmed by direct pixel sampling — see tint.ts's own `UNTINTED_LEAVES`
 * doc), and the general palette already has real pink/magenta candidates (`magenta_terracotta`,
 * `pink_concrete`) that are a genuinely better match than forcing it into the green/lime family
 * here would be. Matched by suffix/exact-name the same way `isBedFamilySource`
 * (lightSourceExclusion.ts) matches `_bed`.
 */
export function isLeafFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  if (bare === 'cherry_leaves') return false;
  return bare.endsWith('_leaves') || bare === 'vine';
}

// The only real green-family fill materials this app curates (fullCubeBlocks.ts's DYE_COLORS
// sweep) — every leaf type's real color, tinted or baked-in, lands somewhere in this green/lime
// range (confirmed by direct real-jar sampling: oak/birch/spruce/azalea/cherry's own average
// tinted RGB all fall in green or pink hue territory, never anything stone/wood/gray-adjacent).
const LEAF_PALETTE_IDS = new Set([
  'minecraft:green_wool',
  'minecraft:lime_wool',
  'minecraft:green_concrete',
  'minecraft:lime_concrete',
  'minecraft:green_terracotta',
  'minecraft:lime_terracotta',
]);

/**
 * Restricts the palette to the green/lime family for a leaves/vine source (`isLeafFamilySource`).
 * Without this, a leaf texture's real dark shadow pixels — genuinely desaturated once tinted
 * (spruce's fixed tint in particular, Lab-wise not far from a neutral gray) — can raw-Lab-match to
 * an unrelated stone block instead: confirmed via real-jar verification, `spruce_leaves` matched
 * 253 of its 881 colored voxels (at resolution 16) to `deepslate_tiles`, since matchPixel's hue/
 * family guards only ever apply to *chromatic* candidates (a gray stone candidate's own average
 * color reads as non-chromatic, so it's exempt from both the hue-mismatch and family-affinity
 * penalties regardless of how far off-theme it is) — the same "matched but mismatched-looking"
 * class of problem `elementPaletteRestrictions` fixes for hand-authored templates (sheep's legs,
 * beacon's crystal, chest's knob, skull's grayscale ladder), just needed here for a *generically*
 * resolved block instead, which has no per-element restriction mechanism — an allow-list keyed on
 * the whole source name, the same shape `filterPaletteForSource` (glassSource.ts) already uses,
 * is the equivalent tool for that case. `cherry_leaves` is deliberately exempt — see
 * `isLeafFamilySource`'s own doc — so it keeps matching against the full palette instead.
 */
export function filterPaletteForLeafSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (!isLeafFamilySource(sourceName)) return palette;
  const restricted = palette.filter((entry) => LEAF_PALETTE_IDS.has(entry.id));
  return restricted.length > 0 ? restricted : palette;
}
