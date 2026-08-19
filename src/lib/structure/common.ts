import type { NbtTag } from '../../types/nbt';
import type { VoxelGrid } from '../../types/minecraft';

/** The result every structure-format parser produces, before culling/upscaling. `grid`'s cell
 *  values (and `blockIds`) are blockstate keys (see blockstateKey.ts), not bare block names — a
 *  block's real stored Properties (facing, half, shape, axis, ...) are folded into the string so
 *  two differently-oriented instances of the same block are treated as genuinely distinct for
 *  voxelization. */
export interface ParsedStructure {
  grid: VoxelGrid;
  blockIds: Set<string>;
}

/** Real structures sometimes list these explicitly in their block/palette data instead of simply
 *  omitting the position — must be normalized to `null` (air) before culling or palette-building
 *  ever sees them, or culling would treat "air" as a real solid neighbor and palette-building
 *  would try to texture it. */
export const AIR_LIKE_BLOCKS = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void',
]);

export function normalizeBlockName(name: string): string | null {
  return AIR_LIKE_BLOCKS.has(name) ? null : name;
}

export function createEmptyGrid(sizeX: number, sizeY: number, sizeZ: number): VoxelGrid {
  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < sizeX; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < sizeY; y++) {
      plane.push(new Array<string | null>(sizeZ).fill(null));
    }
    voxels.push(plane);
  }
  return { sizeX, sizeY, sizeZ, voxels };
}

// --- Small typed NBT tag accessors, shared by both structure-format parsers. Each throws a
// clear, specific error naming the field and what was found instead of a generic type error,
// since a malformed/unexpected structure file should fail with a message a user can act on. ---

export function asCompound(tag: NbtTag | undefined, field: string): Record<string, NbtTag> {
  if (!tag || tag.type !== 'compound') {
    throw new Error(`Expected "${field}" to be an NBT compound, got ${tag?.type ?? 'nothing'} — is this a valid structure file?`);
  }
  return tag.value;
}

export function asList(tag: NbtTag | undefined, field: string): NbtTag[] {
  if (!tag || tag.type !== 'list') {
    throw new Error(`Expected "${field}" to be an NBT list, got ${tag?.type ?? 'nothing'} — is this a valid structure file?`);
  }
  return tag.value;
}

export function asIntLike(tag: NbtTag | undefined, field: string): number {
  if (!tag || (tag.type !== 'int' && tag.type !== 'short' && tag.type !== 'byte')) {
    throw new Error(`Expected "${field}" to be an integer NBT tag, got ${tag?.type ?? 'nothing'} — is this a valid structure file?`);
  }
  return tag.value;
}

export function asString(tag: NbtTag | undefined, field: string): string {
  if (!tag || tag.type !== 'string') {
    throw new Error(`Expected "${field}" to be an NBT string, got ${tag?.type ?? 'nothing'} — is this a valid structure file?`);
  }
  return tag.value;
}

/** A palette entry's optional `Properties` compound (both the vanilla structure and litematic
 *  formats nest it identically: `{Name, Properties?: {facing: "east", half: "bottom", ...}}`,
 *  every value a plain NBT string) — returns undefined when absent, so a block with no stored
 *  properties encodes to a bare name (see blockstateKey.ts) exactly as before this existed. */
export function parsePaletteEntryProperties(entry: Record<string, NbtTag>, field: string): Record<string, string> | undefined {
  const propsTag = entry.Properties;
  if (!propsTag) return undefined;
  const propsCompound = asCompound(propsTag, `${field}.Properties`);
  const properties: Record<string, string> = {};
  for (const [key, tag] of Object.entries(propsCompound)) {
    properties[key] = asString(tag, `${field}.Properties.${key}`);
  }
  return properties;
}
