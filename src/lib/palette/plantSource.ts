const PLANT_SOURCES = new Set(['leaf_litter', 'melon_stem', 'pumpkin_stem', 'attached_melon_stem', 'attached_pumpkin_stem']);

/**
 * Whether a source block is one of the small tinted plants whose color is yellow-brown (dry leaf
 * litter, and melon/pumpkin stems at their mature stage). Tinting gives them the right hue, but the
 * nearest palette blocks to a yellow-brown were wood planks and logs (leaf litter came out
 * spruce log / stripped spruce / jungle log; a mature stem came out bamboo planks and jungle log),
 * which is the wrong material for a leaf or a vine — `filterPaletteForSource` (glassSource.ts) drops
 * wood for these, the same fix earth-family sources got.
 */
export function isPlantSource(sourceName: string): boolean {
  return PLANT_SOURCES.has(sourceName.toLowerCase().replace(/^minecraft:/, ''));
}
