import type { PaletteEntry } from '../../types/minecraft';
import { isEarthFamilySource } from './earthSource';
import { isPlantSource } from './plantSource';
import { isWoodFamilySource } from './lightSourceExclusion';

/**
 * Whether a source block/item name is itself glass-related — a colored/plain/tinted glass block,
 * or a block whose real model genuinely incorporates glass as a visible part (beacon's glass
 * pyramid, end crystal's glass shell). This is deliberately name-based rather than inspecting the
 * resolved model's textures: it's simple, and it matches the user's own framing ("blocks that use
 * glass") — a build for an unrelated block should never end up using glass just because a few of
 * its pixels happen to be pale/translucent-reading in color.
 */
export function isGlassFamilySource(sourceName: string): boolean {
  const bare = sourceName.toLowerCase().replace(/^minecraft:/, '');
  // `bee` is not itself glass-related, but its wings are explicitly restricted to
  // `white_stained_glass` (handAuthoredMobTemplates.ts's `BEE_WING_PALETTE`) per direct user
  // request for a translucent wing look — safe to make the whole bee build glass-eligible since
  // every other bee element already has its own tight, non-glass color restriction, so only the
  // wings can actually reach it.
  // `water`'s surface layer is pinned to blue_stained_glass (handAuthoredTemplates.ts).
  return bare.includes('glass') || bare === 'beacon' || bare === 'end_crystal' || bare === 'bee' || bare === 'water';
}

/**
 * Strips every `glassOnly` palette entry (real glass blocks — see the doc on FullCubeBlockDef's
 * `glassOnly` field) unless the given source is glass-family per `isGlassFamilySource`, and every
 * `earthOnly` entry (real dirt) unless it is dirt/grass-family per `isEarthFamilySource`. Every
 * call site that runs the palette through matchAllFaces/matchPixel for a specific known source
 * must filter through this first, or glass and dirt leak into builds they were never meant for.
 */
export function filterPaletteForSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  const allowGlass = isGlassFamilySource(sourceName);
  const allowEarth = isEarthFamilySource(sourceName);
  const allowResin = sourceName.toLowerCase().replace(/^minecraft:/, '') === 'lava';
  if (!allowGlass || !allowEarth || !allowResin) {
    palette = palette.filter((entry) => (allowGlass || !entry.glassOnly) && (allowEarth || !entry.earthOnly) && (allowResin || !entry.resinOnly));
  }
  // A soil texture is brown noise, and the nearest palette blocks to it by raw color are wood
  // planks and logs — confirmed against the real jar: `dirt` came out ~45% jungle/spruce wood. For
  // earth-family sources wood is the wrong material, so it's dropped (as wood_earth is for ores).
  // The same goes for the yellow-brown plant sources (leaf litter, mature stems — plantSource.ts).
  return allowEarth || isPlantSource(sourceName) ? palette.filter((entry) => !isWoodFamilySource(entry.id)) : palette;
}
