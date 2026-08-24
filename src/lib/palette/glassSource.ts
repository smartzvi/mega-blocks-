import type { PaletteEntry } from '../../types/minecraft';

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
  return bare.includes('glass') || bare === 'beacon' || bare === 'end_crystal' || bare === 'bee';
}

/**
 * Strips every `glassOnly` palette entry (real glass blocks — see the doc on FullCubeBlockDef's
 * `glassOnly` field) unless the given source is glass-family per `isGlassFamilySource`. Every
 * call site that runs the palette through matchAllFaces/matchPixel for a specific known source
 * must filter through this first, or glass leaks into builds it was never meant for.
 */
export function filterPaletteForSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (isGlassFamilySource(sourceName)) return palette;
  return palette.filter((entry) => !entry.glassOnly);
}
