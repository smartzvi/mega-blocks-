import type { PaletteEntry } from '../../types/minecraft';

/**
 * Whether a source block/item name is a real ore block — every vanilla ore ends in `_ore`
 * (`iron_ore`, `deepslate_iron_ore`, `nether_gold_ore`, ...) except `ancient_debris`, checked as
 * its own exact name. Matched by suffix the same way `isBedFamilySource`
 * (lightSourceExclusion.ts) matches `_bed`.
 */
export function isOreFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  return bare.endsWith('_ore') || bare === 'ancient_debris';
}

/**
 * Strips `wood_earth`-family palette entries for an ore source (`isOreFamilySource`). Found via a
 * real-jar sweep prompted by explicit user feedback that a built `iron_ore` "doesn't look like
 * iron ore": its real ore-speckle pixels (a light tan/cream tone) were raw-Lab-matching to
 * `jungle_planks`/`packed_mud` (234/1536 voxels, res 16) — a real but wrong-*material* match, the
 * same "matched but mismatched-looking" class of problem `leafSource.ts`/`elementPaletteRestrictions`
 * fix elsewhere: visible wood grain and mud texture reading as an obviously out-of-place patch
 * inside what should look like ore embedded in stone, not raw color being wrong. Checking every
 * other ore confirmed this is systemic, not an `iron_ore`-only quirk: `deepslate_copper_ore` lost
 * 498/1536 voxels (~32%) to wood_earth, `copper_ore` 216, `diamond_ore` 128, `redstone_ore` 126,
 * `ancient_debris` 76, and both `deepslate_coal_ore`/`deepslate_gold_ore` over 200 each — while
 * `coal_ore`/`gold_ore`/`emerald_ore`/`lapis_ore` happened to have zero (no reason to think that
 * holds for a different resource pack's ore textures, so the exclusion still applies to them).
 * `nether_gold_ore`/`nether_quartz_ore` are sprite-on-netherrack blocks whose warm base color was
 * *mostly* wood_earth (1320/1202 of 1536) — losing that access still leaves real close matches in
 * `sand_clay` (netherrack's own warm reddish-brown tone has plenty of real terracotta candidates),
 * so this isn't a case of removing the only viable family.
 */
export function filterPaletteForOreSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (!isOreFamilySource(sourceName)) return palette;
  const restricted = palette.filter((entry) => entry.family !== 'wood_earth');
  return restricted.length > 0 ? restricted : palette;
}
