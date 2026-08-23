import type { PaletteEntry } from '../../types/minecraft';

/**
 * Whether a source block/item name is a diamond variant (diamond_block, diamond_ore,
 * deepslate_diamond_ore — the only vanilla "diamond_*" blocks) — confirmed against the real jar
 * to be exactly where light-source palette entries look bad: sea_lantern + verdant_froglight +
 * pearlescent_froglight together ate ~70% of a diamond_block build's pixels, drowning out the
 * actual diamond blue in a wash of unrelated glowing colors.
 */
export function isDiamondFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  return bare.includes('diamond');
}

/**
 * Whether a source block/item name is a dirt-block variant (dirt, coarse_dirt, rooted_dirt — every
 * real vanilla block literally named as a version of "dirt"), matched by substring the same way
 * `isDiamondFamilySource` is, since no other real block name contains "dirt". Per user feedback,
 * glowstone's bright yellow glow reads as visibly out of place against dirt's muted, flat brown —
 * the same "light source clashes with a plain, low-saturation material" pattern already found for
 * diamond (blue) and wood (pale bark tones).
 */
export function isDirtFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  return bare.includes('dirt');
}

/**
 * Whether a source item name is one of the 16 dyed bed variants (`red_bed`, `white_bed`, ...) —
 * matched by suffix since no other real vanilla item name ends in `_bed`. Found while widening the
 * bed template's pillow top-face UV rect to include its real symmetric gray-to-white border detail
 * (handAuthoredTemplates.ts's `bedModel`): the newly-included pale, slightly-blue-tinted rows
 * pulled in `pearlescent_froglight` (a real light source, but its pink glow reads as visibly wrong
 * against a plain white/gray pillow) — the same "pale surface reads as a light-source glow"
 * pattern already found for sheep's wool and bee's wings.
 */
export function isBedFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  return bare.endsWith('_bed');
}

// Every real vanilla wood species with a plank/log (or nether stem) full-cube block — mirrors the
// species lists in fullCubeBlocks.ts's wood section exactly, so this stays a precise "is this one
// of the wood-family blocks this app curates" check rather than a loose substring match (a loose
// `includes('log')`/`includes('stem')` check would also catch unrelated blocks like
// pumpkin_stem/melon_stem).
const WOOD_SPECIES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'bamboo'];
const NETHER_STEMS = ['crimson', 'warped'];

/**
 * Whether a source block/item name is a plank, log, or nether stem block (any of the species this
 * app's own palette curates — see WOOD_SPECIES/NETHER_STEMS above). Confirmed against the real
 * jar to be exactly where light-source entries can look bad: `birch_log` — which is excluded from
 * the *candidate* palette entirely per earlier user feedback — pulled in 118/1352 pixels of
 * `pearlescent_froglight` as a stand-in for its own pale bark once it could no longer match
 * itself, visibly odd pinkish-white blotches in an otherwise wood-toned build.
 */
export function isWoodFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  if (bare === 'bamboo_block' || bare === 'stripped_bamboo_block') return true;
  const suffixes = ['_planks', '_log', '_stem'];
  return [...WOOD_SPECIES, ...NETHER_STEMS].some((species) =>
    suffixes.some((suffix) => bare === `${species}${suffix}` || bare === `stripped_${species}${suffix}`)
  );
}

// Individual sources (not whole families) confirmed to look bad with light-source entries.
// `sheep`: its wool is predominantly near-white, and `pearlescent_froglight` kept winning a large
// share of those pixels (1421/1608 at res 32) — a real light source, but its pale pinkish glow
// reads as an odd blotch against plain white wool, per direct user feedback on a real build.
// `bee`: its wings' pale color pulled in a real chunk of froglight/sea_lantern (confirmed ~8% of a
// built bee's voxels at res 16) — the same "pale surface reads as a light-source glow" pattern.
// `wolf`: its coat is predominantly light gray/white, and `pearlescent_froglight` won 20 voxels in
// a real build (res 32) — small, but the same pattern, caught during initial real-jar verification
// rather than from user feedback this time.
const LIGHT_SOURCE_EXCLUDED_EXACT_NAMES = new Set(['sheep', 'bee', 'wolf']);

function isExactNameExcluded(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  return LIGHT_SOURCE_EXCLUDED_EXACT_NAMES.has(bare);
}

/**
 * Strips every `lightSource` palette entry (see FullCubeBlockDef's doc — glowstone, sea_lantern,
 * the froglights) for a source confirmed to look bad with them: diamond variants
 * (`isDiamondFamilySource`), wood planks/logs/stems (`isWoodFamilySource`), dirt-block variants
 * (`isDirtFamilySource`), dyed bed variants (`isBedFamilySource`), or an individual exact-name
 * exclusion (`LIGHT_SOURCE_EXCLUDED_EXACT_NAMES`). Unlike `filterPaletteForSource` (glassSource.ts),
 * light sources are eligible by default and only excluded for specific flagged sources, not
 * restricted to an allow-list.
 */
export function filterLightSourcesForSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (
    !isDiamondFamilySource(sourceName) &&
    !isWoodFamilySource(sourceName) &&
    !isDirtFamilySource(sourceName) &&
    !isBedFamilySource(sourceName) &&
    !isExactNameExcluded(sourceName)
  ) {
    return palette;
  }
  return palette.filter((entry) => !entry.lightSource);
}
