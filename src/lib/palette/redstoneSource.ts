import type { PaletteEntry } from '../../types/minecraft';

// The only red-family blocks in the curated palette (checked against buildPalette's real output).
const RED_WIRE_BLOCKS = new Set(['minecraft:red_concrete', 'minecraft:red_wool', 'minecraft:red_terracotta']);

export function isRedstoneWireSource(sourceName: string): boolean {
  return sourceName.toLowerCase().replace(/^minecraft:/, '') === 'redstone_wire';
}

/**
 * Restricts redstone wire to red blocks. Tinting the near-white wire textures (tint.ts) gives the
 * right color, but matching that color to the *nearest* palette block wasn't reliably red: the
 * fully powered tint (255,51,0) landed on `orange_concrete` and the dark unpowered one (77,0,0) on
 * `stripped_mangrove_log`, a wood block. Same "matched but wrong-looking" class of fix as
 * oreSource.ts and leafSource.ts. Falls back to the full palette if a custom resource pack has none
 * of these blocks.
 */
export function filterPaletteForRedstoneSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (!isRedstoneWireSource(sourceName)) return palette;
  const restricted = palette.filter((entry) => RED_WIRE_BLOCKS.has(entry.id));
  return restricted.length > 0 ? restricted : palette;
}
