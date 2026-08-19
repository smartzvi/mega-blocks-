/**
 * Defense-in-depth deny-list of creative/technical/non-survival block ids. The real gate
 * restricting the palette is the curated allow-list in fullCubeBlocks.ts — this list exists
 * as an explicit safety net and as documentation of what must never appear in the palette.
 */
export const BLOCK_EXCLUSIONS = new Set<string>([
  'minecraft:barrier',
  'minecraft:structure_void',
  'minecraft:structure_block',
  'minecraft:jigsaw',
  'minecraft:light',
  'minecraft:command_block',
  'minecraft:chain_command_block',
  'minecraft:repeating_command_block',
  'minecraft:piston_head',
  'minecraft:moving_piston',
  'minecraft:bedrock', // not survival-obtainable
  'minecraft:reinforced_deepslate', // not survival-obtainable
  'minecraft:debug_stick',
  'minecraft:knowledge_book',
  'minecraft:spawner',
  'minecraft:trial_spawner',
  'minecraft:vault',
]);

export function isExcluded(blockId: string): boolean {
  return BLOCK_EXCLUSIONS.has(blockId);
}
