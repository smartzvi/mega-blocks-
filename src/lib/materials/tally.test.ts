import { describe, expect, it } from 'vitest';
import { computeMaterialSummary, computeMaterialTally, formatMaterialListText } from './tally';
import type { VoxelGrid } from '../../types/minecraft';

function gridFromCounts(counts: Record<string, number>): VoxelGrid {
  // Flattens the requested per-block counts into a 1D run of cells, then reshapes into a
  // voxels[x][y][z] cube just large enough to hold them (padding the rest with null/air).
  const cells: (string | null)[] = [];
  for (const [id, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) cells.push(id);
  }
  const size = Math.ceil(Math.cbrt(cells.length)) || 1;
  while (cells.length < size ** 3) cells.push(null);

  const voxels: (string | null)[][][] = [];
  let idx = 0;
  for (let x = 0; x < size; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < size; y++) {
      const column: (string | null)[] = [];
      for (let z = 0; z < size; z++) column.push(cells[idx++]);
      plane.push(column);
    }
    voxels.push(plane);
  }
  return { sizeX: size, sizeY: size, sizeZ: size, voxels };
}

describe('computeMaterialTally', () => {
  it('counts each block type and ignores air', () => {
    const grid = gridFromCounts({ 'minecraft:oak_planks': 5, 'minecraft:stone': 3 });
    const entries = computeMaterialTally(grid);
    const byId = Object.fromEntries(entries.map((e) => [e.blockId, e.count]));
    expect(byId['minecraft:oak_planks']).toBe(5);
    expect(byId['minecraft:stone']).toBe(3);
  });

  it('sorts by count descending', () => {
    const grid = gridFromCounts({ 'minecraft:a': 2, 'minecraft:b': 10, 'minecraft:c': 5 });
    const entries = computeMaterialTally(grid);
    expect(entries.map((e) => e.blockId)).toEqual(['minecraft:b', 'minecraft:c', 'minecraft:a']);
  });

  it('computes exact shulker/stack/item breakdowns for known counts', () => {
    const grid = gridFromCounts({
      'minecraft:exact_shulker': 1728, // 1 SB, 0 stacks, 0 items
      'minecraft:one_stack_extra': 100, // 0 SB, 1 stack, 36 items
      'minecraft:mixed': 1728 + 64 * 3 + 10, // 1 SB, 3 stacks, 10 items
    });
    const entries = computeMaterialTally(grid);
    const byId = Object.fromEntries(entries.map((e) => [e.blockId, e]));

    expect(byId['minecraft:exact_shulker']).toMatchObject({ shulkers: 1, stacks: 0, items: 0 });
    expect(byId['minecraft:one_stack_extra']).toMatchObject({ shulkers: 0, stacks: 1, items: 36 });
    expect(byId['minecraft:mixed']).toMatchObject({ shulkers: 1, stacks: 3, items: 10 });
  });
});

describe('computeMaterialSummary', () => {
  it('sums totals and estimates mixed-slot shulker count correctly', () => {
    // Two materials each needing 1 stack-slot (100 and 50 items both round up to 1 slot each)
    // -> 2 slots total -> ceil(2/27) = 1 shulker needed if types can share a box.
    const grid = gridFromCounts({ 'minecraft:x': 100, 'minecraft:y': 50 });
    const entries = computeMaterialTally(grid);
    const summary = computeMaterialSummary(entries);
    expect(summary.totalBlocks).toBe(150);
    expect(summary.totalDistinctBlocks).toBe(2);
    expect(summary.estimatedShulkersMixed).toBe(1);
  });

  it('requires a second shulker once slot count exceeds 27', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 28; i++) counts[`minecraft:block_${i}`] = 1; // 28 distinct 1-item materials = 28 slots
    const grid = gridFromCounts(counts);
    const summary = computeMaterialSummary(computeMaterialTally(grid));
    expect(summary.estimatedShulkersMixed).toBe(2); // ceil(28/27)
  });
});

describe('formatMaterialListText', () => {
  it('includes the summary and every entry', () => {
    const grid = gridFromCounts({ 'minecraft:oak_planks': 5 });
    const entries = computeMaterialTally(grid);
    const summary = computeMaterialSummary(entries);
    const text = formatMaterialListText(entries, summary);
    expect(text).toContain('1 block types');
    expect(text).toContain('5 blocks total');
    expect(text).toContain('minecraft:oak_planks: 5');
  });
});
