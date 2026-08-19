import { describe, expect, it } from 'vitest';
import * as prismarineNbt from 'prismarine-nbt';
import { exportLitematic } from './litematicExport';
import { DATA_VERSION } from '../blockstate/dataVersion';
import type { VoxelGrid } from '../../types/minecraft';

function tinyGrid(): VoxelGrid {
  return {
    sizeX: 2,
    sizeY: 2,
    sizeZ: 2,
    voxels: [
      [
        [null, 'minecraft:obsidian'],
        ['minecraft:stone', 'minecraft:obsidian'],
      ],
      [
        ['minecraft:stone', null],
        ['minecraft:obsidian', 'minecraft:stone'],
      ],
    ],
  };
}

describe('exportLitematic', () => {
  it('produces a correct NBT tag tree, verified against an independent parser and a hand-computed BlockStates value', async () => {
    const grid = tinyGrid();
    const gzipped = exportLitematic(grid, 'TestCube');

    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as {
      Version: number;
      SubVersion: number;
      MinecraftDataVersion: number;
      Metadata: { Name: string; TotalBlocks: number; TotalVolume: number; EnclosingSize: { x: number; y: number; z: number } };
      Regions: { Main: { Position: { x: number; y: number; z: number }; Size: { x: number; y: number; z: number }; BlockStatePalette: { Name: string }[] } };
    };

    expect(simplified.Version).toBe(6);
    expect(simplified.SubVersion).toBe(1);
    expect(simplified.MinecraftDataVersion).toBe(DATA_VERSION);
    expect(simplified.Metadata.Name).toBe('TestCube');
    // Grid has 2 air voxels (out of 8) -> 6 non-air blocks.
    expect(simplified.Metadata.TotalBlocks).toBe(6);
    expect(simplified.Metadata.TotalVolume).toBe(8);
    expect(simplified.Metadata.EnclosingSize).toEqual({ x: 2, y: 2, z: 2 });
    expect(simplified.Regions.Main.Position).toEqual({ x: 0, y: 0, z: 0 });
    expect(simplified.Regions.Main.Size).toEqual({ x: 2, y: 2, z: 2 });
    // Air must be palette index 0 (litematica's BlockStates is dense over the whole volume).
    expect(simplified.Regions.Main.BlockStatePalette.map((p) => p.Name)).toEqual([
      'minecraft:air',
      'minecraft:stone',
      'minecraft:obsidian',
    ]);

    // Hand-computed expected packed value: iterating y,z,x (x fastest) over this grid gives
    // palette indices [0,1,2,0,1,2,2,1] at 2 bits/entry (palette size 3 -> max(2,ceil(log2(3)))=2).
    // Packed continuously: 0 | (1<<2) | (2<<4) | (0<<6) | (1<<8) | (2<<10) | (2<<12) | (1<<14) = 26916.
    const region = (parsed as { value: Record<string, unknown> }).value.Regions as {
      value: { Main: { value: { BlockStates: { value: [number, number][] } } } };
    };
    const blockStates = region.value.Main.value.BlockStates.value;
    expect(blockStates).toHaveLength(1);
    const [high, low] = blockStates[0];
    expect(high).toBe(0);
    expect(low).toBe(26916);
  });

  it('reports distinct per-axis Size/EnclosingSize for a genuinely non-cubic grid (e.g. a 2-block-tall door)', async () => {
    // sizeX=sizeZ=2, sizeY=4 — a 2x4x2 grid, fully solid, standing in for a real door's
    // size×(2×size)×size shape at a tiny scale.
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

    const gzipped = exportLitematic(grid, 'TestDoor');
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as {
      Metadata: { TotalBlocks: number; TotalVolume: number; EnclosingSize: { x: number; y: number; z: number } };
      Regions: { Main: { Size: { x: number; y: number; z: number } } };
    };

    expect(simplified.Metadata.TotalBlocks).toBe(16);
    expect(simplified.Metadata.TotalVolume).toBe(16);
    expect(simplified.Metadata.EnclosingSize).toEqual({ x: 2, y: 4, z: 2 });
    expect(simplified.Regions.Main.Size).toEqual({ x: 2, y: 4, z: 2 });
  });

  it('reports distinct per-axis Size/EnclosingSize for a genuinely non-cubic grid extended in Z (e.g. a 2-block-long bed)', async () => {
    // sizeX=sizeY=2, sizeZ=4 — a 2x2x4 grid, fully solid, standing in for a real bed's
    // size×size×(2×size) shape at a tiny scale.
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

    const gzipped = exportLitematic(grid, 'TestBed');
    const { parsed } = await prismarineNbt.parse(Buffer.from(gzipped), 'big');
    const simplified = prismarineNbt.simplify(parsed) as {
      Metadata: { TotalBlocks: number; TotalVolume: number; EnclosingSize: { x: number; y: number; z: number } };
      Regions: { Main: { Size: { x: number; y: number; z: number } } };
    };

    expect(simplified.Metadata.TotalBlocks).toBe(16);
    expect(simplified.Metadata.TotalVolume).toBe(16);
    expect(simplified.Metadata.EnclosingSize).toEqual({ x: 2, y: 2, z: 4 });
    expect(simplified.Regions.Main.Size).toEqual({ x: 2, y: 2, z: 4 });
  });
});
