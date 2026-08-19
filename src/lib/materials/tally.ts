import type { VoxelGrid } from '../../types/minecraft';

export const STACK_SIZE = 64;
export const SLOTS_PER_SHULKER = 27;
export const SHULKER_SIZE = STACK_SIZE * SLOTS_PER_SHULKER; // 1728

export interface MaterialEntry {
  blockId: string;
  count: number;
  shulkers: number;
  stacks: number;
  items: number;
}

export interface MaterialSummary {
  totalBlocks: number;
  totalDistinctBlocks: number;
  /** ceil(sum of per-material stack-slots needed / 27) — assumes shulker slots can be mixed
   *  across different block types, which is how you'd actually pack for a build in practice. */
  estimatedShulkersMixed: number;
}

/** Tallies every non-air block in the grid, sorted by count descending (most-needed first). */
export function computeMaterialTally(grid: VoxelGrid): MaterialEntry[] {
  const counts = new Map<string, number>();

  for (const plane of grid.voxels) {
    for (const column of plane) {
      for (const id of column) {
        if (id === null) continue;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }

  const entries: MaterialEntry[] = [];
  for (const [blockId, count] of counts) {
    const shulkers = Math.floor(count / SHULKER_SIZE);
    const afterShulkers = count % SHULKER_SIZE;
    const stacks = Math.floor(afterShulkers / STACK_SIZE);
    const items = afterShulkers % STACK_SIZE;
    entries.push({ blockId, count, shulkers, stacks, items });
  }

  entries.sort((a, b) => b.count - a.count);
  return entries;
}

export function computeMaterialSummary(entries: MaterialEntry[]): MaterialSummary {
  const totalBlocks = entries.reduce((sum, e) => sum + e.count, 0);
  const totalSlotsNeeded = entries.reduce((sum, e) => sum + Math.ceil(e.count / STACK_SIZE), 0);
  const estimatedShulkersMixed = Math.ceil(totalSlotsNeeded / SLOTS_PER_SHULKER);
  return { totalBlocks, totalDistinctBlocks: entries.length, estimatedShulkersMixed };
}

export function formatMaterialListText(entries: MaterialEntry[], summary: MaterialSummary): string {
  const lines: string[] = [
    `Material List — ${summary.totalDistinctBlocks} block types, ${summary.totalBlocks.toLocaleString()} blocks total`,
    `Estimated shulker boxes needed (mixed types): ${summary.estimatedShulkersMixed}`,
    '',
  ];
  for (const e of entries) {
    lines.push(`${e.blockId}: ${e.count.toLocaleString()}  (${e.shulkers} SB + ${e.stacks} stacks + ${e.items})`);
  }
  return lines.join('\n');
}
