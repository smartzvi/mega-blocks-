import { describe, expect, it } from 'vitest';
import * as prismarineNbt from 'prismarine-nbt';
import { exportVanillaStructureNbt } from './vanillaStructureExport';
import { DATA_VERSION } from '../blockstate/dataVersion';
import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid, setVoxel } from '../voxel/voxelGrid';

function tinyGrid(): VoxelGrid {
  // A 2x2x2 grid, fully populated with two alternating block ids (small but exercises
  // multi-entry palette + block list without needing a full 16^3 shell).
  const grid = createVoxelGrid(2, 2, 2);
  for (let x = 0; x < 2; x++) {
    for (let y = 0; y < 2; y++) {
      for (let z = 0; z < 2; z++) {
        setVoxel(grid, x, y, z, (x + y + z) % 2 === 0 ? 'minecraft:obsidian' : 'minecraft:stone');
      }
    }
  }
  return grid;
}

describe('exportVanillaStructureNbt', () => {
  it('produces bytes that an independent NBT parser (prismarine-nbt) can read back correctly', async () => {
    const grid = tinyGrid();
    const gzipped = exportVanillaStructureNbt(grid);

    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as {
      DataVersion: number;
      size: number[];
      entities: unknown[];
      blocks: { state: number; pos: number[] }[];
      palette: { Name: string }[];
    };

    expect(simplified.DataVersion).toBe(DATA_VERSION);
    expect(simplified.size).toEqual([2, 2, 2]);
    expect(simplified.entities).toEqual([]);
    expect(simplified.blocks).toHaveLength(8); // fully populated 2^3
    expect(simplified.palette.map((p) => p.Name).sort()).toEqual(['minecraft:obsidian', 'minecraft:stone']);

    // Spot-check one block's position/state resolves back to the right palette entry.
    const originBlock = simplified.blocks.find((b) => b.pos.every((c) => c === 0));
    expect(originBlock).toBeDefined();
    expect(simplified.palette[originBlock!.state].Name).toBe('minecraft:obsidian');
  });

  it('leaves air voxels (null) out of the blocks list entirely', async () => {
    const grid = createVoxelGrid(2, 2, 2);
    setVoxel(grid, 0, 0, 1, 'minecraft:dirt');
    const gzipped = exportVanillaStructureNbt(grid);
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as { blocks: unknown[]; palette: { Name: string }[] };
    expect(simplified.blocks).toHaveLength(1);
    expect(simplified.palette).toEqual([{ Name: 'minecraft:dirt' }]);
  });

  it('reports a distinct per-axis size for a genuinely non-cubic grid (e.g. a 2-block-tall door)', async () => {
    const grid = createVoxelGrid(2, 4, 2);
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 2; z++) setVoxel(grid, x, y, z, 'minecraft:oak_planks');
      }
    }

    const gzipped = exportVanillaStructureNbt(grid);
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as { size: number[]; blocks: unknown[] };

    expect(simplified.size).toEqual([2, 4, 2]);
    expect(simplified.blocks).toHaveLength(16);
  });

  it('reports a distinct per-axis size for a genuinely non-cubic grid extended in Z (e.g. a 2-block-long bed)', async () => {
    const grid = createVoxelGrid(2, 2, 4);
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) setVoxel(grid, x, y, z, 'minecraft:red_wool');
      }
    }

    const gzipped = exportVanillaStructureNbt(grid);
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as { size: number[]; blocks: unknown[] };

    expect(simplified.size).toEqual([2, 2, 4]);
    expect(simplified.blocks).toHaveLength(16);
  });
});
