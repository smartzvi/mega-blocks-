import { describe, expect, it } from 'vitest';
import type { VoxelGrid } from '../../types/minecraft';
import { applyKnownStructureFixes } from './knownStructureFixes';

function smallGrid(): VoxelGrid {
  const size = 7;
  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < size; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < size; y++) plane.push(new Array<string | null>(size).fill(null));
    voxels.push(plane);
  }
  // The real, wrong stored value at (4,6,4) in plains_small_house_3.
  voxels[4][6][4] = 'minecraft:oak_stairs[facing=west,half=bottom,shape=outer_right,waterlogged=false]';
  return { sizeX: size, sizeY: size, sizeZ: size, voxels };
}

describe('applyKnownStructureFixes', () => {
  it("corrects plains_small_house_3's back-right roof-peak corner to mirror its three correct siblings", () => {
    const grid = smallGrid();
    const blockIds = new Set(['minecraft:oak_stairs[facing=west,half=bottom,shape=outer_right,waterlogged=false]']);

    applyKnownStructureFixes('village/plains/houses/plains_small_house_3', grid, blockIds);

    expect(grid.voxels[4][6][4]).toBe('minecraft:oak_stairs[facing=north,half=bottom,shape=outer_left,waterlogged=false]');
    // The new key must be registered so buildStructureVoxelGrid.ts actually builds a stamp for it.
    expect(blockIds.has('minecraft:oak_stairs[facing=north,half=bottom,shape=outer_left,waterlogged=false]')).toBe(true);
  });

  it('is a no-op for any other structure', () => {
    const grid = smallGrid();
    const blockIds = new Set<string>();
    const before = grid.voxels[4][6][4];

    applyKnownStructureFixes('village/plains/houses/plains_small_house_1', grid, blockIds);

    expect(grid.voxels[4][6][4]).toBe(before);
    expect(blockIds.size).toBe(0);
  });

  it('skips a fix position outside the grid bounds instead of throwing', () => {
    const size = 2;
    const voxels: (string | null)[][][] = [];
    for (let x = 0; x < size; x++) {
      const plane: (string | null)[][] = [];
      for (let y = 0; y < size; y++) plane.push(new Array<string | null>(size).fill(null));
      voxels.push(plane);
    }
    const grid: VoxelGrid = { sizeX: size, sizeY: size, sizeZ: size, voxels };
    const blockIds = new Set<string>();

    expect(() => applyKnownStructureFixes('village/plains/houses/plains_small_house_3', grid, blockIds)).not.toThrow();
  });
});
