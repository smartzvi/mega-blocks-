const EARTH_SOURCES = new Set([
  'grass_block',
  'dirt',
  'coarse_dirt',
  'podzol',
  'mycelium',
  'rooted_dirt',
  'farmland',
  'dirt_path',
]);

/**
 * Whether a source block name is itself dirt- or grass-family — the only builds that may use the
 * palette's `earthOnly` entries (real dirt). Name-based on purpose, the same shape
 * `isGlassFamilySource` (glassSource.ts) uses: the blocks whose real texture literally is soil.
 */
export function isEarthFamilySource(sourceName: string): boolean {
  return EARTH_SOURCES.has(sourceName.toLowerCase().replace(/^minecraft:/, ''));
}
