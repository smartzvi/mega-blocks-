import { describe, expect, it } from 'vitest';
import * as prismarineNbt from 'prismarine-nbt';
import { exportVanillaStructureNbt } from './vanillaStructureExport';
import { DATA_VERSION } from '../blockstate/dataVersion';
import type { VoxelGrid } from '../../types/minecraft';

function tinyGrid(): VoxelGrid {
  // A 2x2x2 grid, fully populated with two alternating block ids (small but exercises
  // multi-entry palette + block list without needing a full 16^3 shell).
  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < 2; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < 2; y++) {
      const column: (string | null)[] = [];
      for (let z = 0; z < 2; z++) {
        column.push((x + y + z) % 2 === 0 ? 'minecraft:obsidian' : 'minecraft:stone');
      }
      plane.push(column);
    }
    voxels.push(plane);
  }
  return { sizeX: 2, sizeY: 2, sizeZ: 2, voxels };
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
    const grid: VoxelGrid = {
      sizeX: 2,
      sizeY: 2,
      sizeZ: 2,
      voxels: [
        [
          [null, 'minecraft:dirt'],
          [null, null],
        ],
        [
          [null, null],
          [null, null],
        ],
      ],
    };
    const gzipped = exportVanillaStructureNbt(grid);
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as { blocks: unknown[]; palette: { Name: string }[] };
    expect(simplified.blocks).toHaveLength(1);
    expect(simplified.palette).toEqual([{ Name: 'minecraft:dirt' }]);
  });

  it('reports a distinct per-axis size for a genuinely non-cubic grid (e.g. a 2-block-tall door)', async () => {
    const voxels: (string | null)[][][] = [];
    for (let x = 0; x < 2; x++) {
      const plane: (string | null)[][] = [];
      for (let y = 0; y < 4; y++) {
        const column: (string | null)[] = [];
        for (let z = 0; z < 2; z++) column.push('minecraft:oak_planks');
        plane.push(column);
      }
      voxels.push(plane);
    }
    const grid: VoxelGrid = { sizeX: 2, sizeY: 4, sizeZ: 2, voxels };

    const gzipped = exportVanillaStructureNbt(grid);
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as { size: number[]; blocks: unknown[] };

    expect(simplified.size).toEqual([2, 4, 2]);
    expect(simplified.blocks).toHaveLength(16);
  });

  it('reports a distinct per-axis size for a genuinely non-cubic grid extended in Z (e.g. a 2-block-long bed)', async () => {
    const voxels: (string | null)[][][] = [];
    for (let x = 0; x < 2; x++) {
      const plane: (string | null)[][] = [];
      for (let y = 0; y < 2; y++) {
        const column: (string | null)[] = [];
        for (let z = 0; z < 4; z++) column.push('minecraft:red_wool');
        plane.push(column);
      }
      voxels.push(plane);
    }
    const grid: VoxelGrid = { sizeX: 2, sizeY: 2, sizeZ: 4, voxels };

    const gzipped = exportVanillaStructureNbt(grid);
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as { size: number[]; blocks: unknown[] };

    expect(simplified.size).toEqual([2, 2, 4]);
    expect(simplified.blocks).toHaveLength(16);
  });
});
