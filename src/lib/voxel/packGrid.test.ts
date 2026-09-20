import { describe, expect, it } from 'vitest';
import { packVoxelGrid, transferListOf, unpackVoxelGrid } from './packGrid';
import { countVoxels, createVoxelGrid, forEachVoxel, getVoxel, setVoxel } from './voxelGrid';

function sampleGrid() {
  const grid = createVoxelGrid(50, 60, 70);
  setVoxel(grid, 0, 0, 0, 'minecraft:stone');
  setVoxel(grid, 49, 59, 69, 'minecraft:oak_planks[axis=y]');
  setVoxel(grid, 10, 20, 30, 'minecraft:stone');
  setVoxel(grid, 11, 20, 30, 'minecraft:stone');
  return grid;
}

describe('packVoxelGrid / unpackVoxelGrid', () => {
  it('round-trips every cell, the sizes, and block ids exactly', async () => {
    const original = sampleGrid();
    const restored = await unpackVoxelGrid(packVoxelGrid(original));
    expect([restored.sizeX, restored.sizeY, restored.sizeZ]).toEqual([50, 60, 70]);
    expect(countVoxels(restored)).toBe(4);
    for (const [x, y, z] of [[0, 0, 0], [49, 59, 69], [10, 20, 30], [11, 20, 30]]) {
      expect(getVoxel(restored, x, y, z)).toBe(getVoxel(original, x, y, z));
    }
    expect(getVoxel(restored, 1, 1, 1)).toBeNull();
  });

  it('stores each distinct block id once, however many cells use it', () => {
    const packed = packVoxelGrid(sampleGrid());
    expect(packed.table.sort()).toEqual(['minecraft:oak_planks[axis=y]', 'minecraft:stone']);
    expect(packed.keys).toHaveLength(4);
    expect(packed.ids).toHaveLength(4);
  });

  it('packs an empty grid and restores it empty', async () => {
    const restored = await unpackVoxelGrid(packVoxelGrid(createVoxelGrid(3, 3, 3)));
    expect(countVoxels(restored)).toBe(0);
    expect(restored.sizeY).toBe(3);
  });

  it('lists both typed-array buffers for transfer, so nothing is copied', () => {
    const packed = packVoxelGrid(sampleGrid());
    const list = transferListOf(packed);
    expect(list).toHaveLength(2);
    expect(list).toContain(packed.keys.buffer);
    expect(list).toContain(packed.ids.buffer);
  });

  it('rebuilds in slices, yielding to the browser between them, and reports rising progress ending at 1', async () => {
    const grid = createVoxelGrid(100, 100, 100);
    for (let i = 0; i < 25; i++) setVoxel(grid, i, 0, 0, 'minecraft:stone');
    let yields = 0;
    const progress: number[] = [];
    const restored = await unpackVoxelGrid(packVoxelGrid(grid), {
      chunkSize: 10,
      yieldToBrowser: async () => {
        yields++;
      },
      onProgress: (f) => progress.push(f),
    });
    expect(countVoxels(restored)).toBe(25);
    expect(yields).toBe(2); // 25 cells in slices of 10 -> 3 slices, yield between them
    expect(progress).toEqual([10 / 25, 20 / 25, 1]);
  });

  it('keeps the packed cells decodable through forEachVoxel, the way every consumer reads a grid', async () => {
    const restored = await unpackVoxelGrid(packVoxelGrid(sampleGrid()));
    const seen: string[] = [];
    forEachVoxel(restored, (x, y, z, id) => seen.push(`${x},${y},${z},${id}`));
    expect(seen.sort()).toEqual(
      ['0,0,0,minecraft:stone', '10,20,30,minecraft:stone', '11,20,30,minecraft:stone', '49,59,69,minecraft:oak_planks[axis=y]'].sort()
    );
  });
});
