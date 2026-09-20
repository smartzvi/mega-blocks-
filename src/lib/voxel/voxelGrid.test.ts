import { describe, expect, it } from 'vitest';
import { cellKey, cloneVoxelGrid, countVoxels, createVoxelGrid, forEachVoxel, getVoxel, setVoxel } from './voxelGrid';

function collect(grid: ReturnType<typeof createVoxelGrid>): Array<[number, number, number, string]> {
  const out: Array<[number, number, number, string]> = [];
  forEachVoxel(grid, (x, y, z, id) => out.push([x, y, z, id]));
  return out;
}

describe('voxel grid accessors', () => {
  it('reads back what was written, and treats anything unset or out of bounds as air', () => {
    const grid = createVoxelGrid(4, 4, 4);
    setVoxel(grid, 1, 2, 3, 'minecraft:stone');
    expect(getVoxel(grid, 1, 2, 3)).toBe('minecraft:stone');
    expect(getVoxel(grid, 0, 0, 0)).toBeNull();
    expect(getVoxel(grid, 4, 0, 0)).toBeNull();
    expect(getVoxel(grid, -1, 0, 0)).toBeNull();
  });

  it('clears a cell with null instead of storing a null entry, so the count stays exact', () => {
    const grid = createVoxelGrid(4, 4, 4);
    setVoxel(grid, 1, 1, 1, 'minecraft:stone');
    setVoxel(grid, 2, 2, 2, 'minecraft:dirt');
    expect(countVoxels(grid)).toBe(2);
    setVoxel(grid, 1, 1, 1, null);
    expect(countVoxels(grid)).toBe(1);
    expect(getVoxel(grid, 1, 1, 1)).toBeNull();
  });

  it('iterates every solid cell back with its exact coordinates, across the largest real grid sizes', () => {
    // A structure at 64 voxels per block can be a few thousand cells across on an axis.
    const grid = createVoxelGrid(3200, 3200, 3200);
    const cells: Array<[number, number, number, string]> = [
      [0, 0, 0, 'a'],
      [3199, 0, 0, 'b'],
      [0, 3199, 0, 'c'],
      [0, 0, 3199, 'd'],
      [3199, 3199, 3199, 'e'],
      [1, 2, 3, 'f'],
      [1234, 2345, 3000, 'g'],
    ];
    for (const [x, y, z, id] of cells) setVoxel(grid, x, y, z, id);
    expect(collect(grid).sort()).toEqual([...cells].sort());
  });

  it('gives every cell a distinct key — no two of a dense block of cells, or of neighbors on different axes, collide', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 20; x++) for (let y = 0; y < 20; y++) for (let z = 0; z < 20; z++) seen.add(cellKey(x, y, z));
    expect(seen.size).toBe(20 * 20 * 20);
    // The axis strides must not let a step on one axis land on another's key.
    expect(cellKey(1, 0, 0)).not.toBe(cellKey(0, 1, 0));
    expect(cellKey(0, 1, 0)).not.toBe(cellKey(0, 0, 1));
    expect(cellKey(0, 0, 131071 - 4096)).not.toBe(cellKey(0, 1, 0));
  });

  it('keeps keys exact integers at the far end of the supported range', () => {
    const key = cellKey(126975, 126975, 126975);
    expect(Number.isSafeInteger(key)).toBe(true);
  });

  it('cloning gives an independent copy', () => {
    const grid = createVoxelGrid(4, 4, 4);
    setVoxel(grid, 1, 1, 1, 'minecraft:stone');
    const copy = cloneVoxelGrid(grid);
    setVoxel(copy, 2, 2, 2, 'minecraft:dirt');
    setVoxel(copy, 1, 1, 1, null);
    expect(getVoxel(grid, 1, 1, 1)).toBe('minecraft:stone');
    expect(getVoxel(grid, 2, 2, 2)).toBeNull();
  });
});
