import type { NbtTag } from '../../types/nbt';
import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid } from '../voxel/voxelGrid';

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
 *  would try to texture it. `jigsaw`/`structure_block` aren't air at all — they're real solid
 *  blocks — but they're structure-*generation* machinery (marking where separate structure pieces
 *  connect), never part of the finished building; confirmed directly via a real bundled village
 *  house structure, whose raw NBT genuinely contains a literal `minecraft:jigsaw` block that has
 *  no business being visible in the finished render (per explicit user feedback: "a weird block at
 *  the start" — its own real texture is a high-contrast technical arrow/cross icon, not a building
 *  material, so it stood out sharply once matched/rendered). Treated the same as air here rather
 *  than only at render time, so culling/palette-building never has to special-case them either. */
export const AIR_LIKE_BLOCKS = new Set([
  'minecraft:air',
  'minecraft:cave_air',
  'minecraft:void_air',
  'minecraft:structure_void',
  'minecraft:jigsaw',
  'minecraft:structure_block',
]);

/** Loose furnishings stripped from a structure when voxelizing it as a megablock — currently just
 *  beds, per explicit user request. Glass panes were also stripped at first, then restored per a
 *  follow-up request (they're part of the shell's windows). Matched by substring against the bare
 *  block name (same technique cullInteriorVoxels.ts's NON_OCCLUDING_PATTERNS uses), so every dye
 *  color variant is covered without listing all 16. Deliberately narrow — a chest, crafting table,
 *  or furnace is a real functional fixture a user might actually want represented. */
const NON_STRUCTURAL_FURNISHING_PATTERNS = ['bed'];

function isNonStructuralFurnishing(name: string): boolean {
  const bareName = name.replace('minecraft:', '');
  return NON_STRUCTURAL_FURNISHING_PATTERNS.some((pattern) => bareName.includes(pattern));
}

export function normalizeBlockName(name: string): string | null {
  return AIR_LIKE_BLOCKS.has(name) || isNonStructuralFurnishing(name) ? null : name;
}

export function createEmptyGrid(sizeX: number, sizeY: number, sizeZ: number): VoxelGrid {
  return createVoxelGrid(sizeX, sizeY, sizeZ);
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
