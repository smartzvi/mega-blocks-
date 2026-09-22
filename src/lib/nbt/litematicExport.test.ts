import { describe, expect, it } from 'vitest';
import * as prismarineNbt from 'prismarine-nbt';
import { exportLitematic } from './litematicExport';
import { DATA_VERSION } from '../blockstate/dataVersion';
import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid, setVoxel } from '../voxel/voxelGrid';
import { bitsPerEntryFor, unpackLongArray } from './bitpack';
import { ungzipBytes } from './gzip';
import { readNbt } from './nbtReader';
import type { NbtTag } from '../../types/nbt';

function tinyGrid(): VoxelGrid {
  const grid = createVoxelGrid(2, 2, 2);
  // (0,0,0) stays air.
  setVoxel(grid, 0, 0, 1, 'minecraft:obsidian');
  setVoxel(grid, 0, 1, 0, 'minecraft:stone');
  setVoxel(grid, 0, 1, 1, 'minecraft:obsidian');
  setVoxel(grid, 1, 0, 0, 'minecraft:stone');
  // (1,0,1) stays air.
  setVoxel(grid, 1, 1, 0, 'minecraft:obsidian');
  setVoxel(grid, 1, 1, 1, 'minecraft:stone');
  return grid;
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
    const grid = createVoxelGrid(2, 4, 2);
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 2; z++) setVoxel(grid, x, y, z, 'minecraft:oak_planks');
      }
    }

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
    const grid = createVoxelGrid(2, 2, 4);
    for (let x = 0; x < 2; x++) {
      for (let y = 0; y < 2; y++) {
        for (let z = 0; z < 4; z++) setVoxel(grid, x, y, z, 'minecraft:red_wool');
      }
    }

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

describe('exportLitematic — big builds', () => {
  it('exports a huge, mostly-empty bounding box that used to throw "Invalid array length"', () => {
    // 700 x 300 x 700 = 147M cells, the size where the old dense array failed.
    const grid = createVoxelGrid(700, 300, 700);
    setVoxel(grid, 0, 0, 0, 'minecraft:stone');
    setVoxel(grid, 699, 299, 699, 'minecraft:oak_planks');
    expect(() => exportLitematic(grid, 'Big')).not.toThrow();
  });

  it('splits a grid over 256 on a side into regions, skips empty ones, and every block reads back in place', async () => {
    const grid = createVoxelGrid(600, 10, 300);
    const placed: [number, number, number, string][] = [
      [0, 0, 0, 'minecraft:stone'],
      [255, 9, 255, 'minecraft:stone'], // last cell of the first region
      [256, 0, 0, 'minecraft:oak_planks'], // first cell of the next region along x
      [599, 5, 299, 'minecraft:red_wool'],
      [300, 3, 260, 'minecraft:oak_planks'],
    ];
    for (const [x, y, z, id] of placed) setVoxel(grid, x, y, z, id);

    const { parsed } = await prismarineNbt.parse(Buffer.from(exportLitematic(grid, 'Split')), 'big');
    const simplified = prismarineNbt.simplify(parsed) as {
      Metadata: { RegionCount: number; TotalBlocks: number; EnclosingSize: { x: number; y: number; z: number } };
      Regions: Record<string, { Position: { x: number; y: number; z: number }; Size: { x: number; y: number; z: number } }>;
    };

    expect(simplified.Metadata.TotalBlocks).toBe(5);
    expect(simplified.Metadata.EnclosingSize).toEqual({ x: 600, y: 10, z: 300 });
    // Regions x-tiles 0,1,2 and z-tiles 0,1 exist; only the four holding blocks are written.
    expect(Object.keys(simplified.Regions).sort()).toEqual(['Region_0_0_0', 'Region_1_0_0', 'Region_1_0_1', 'Region_2_0_1']);
    expect(simplified.Metadata.RegionCount).toBe(4);
    expect(simplified.Regions.Region_2_0_1.Position).toEqual({ x: 512, y: 0, z: 256 });
    expect(simplified.Regions.Region_2_0_1.Size).toEqual({ x: 88, y: 10, z: 44 }); // clipped to the grid

    // Decode every region with the app's own reader + unpacker and check each block sits at its
    // original absolute position (and nowhere else).
    const decoded = new Map<string, string>();
    const root = readNbt(ungzipBytes(exportLitematic(grid, 'Split'))) as Extract<NbtTag, { type: 'compound' }>;
    const regions = (root.value.Regions as Extract<NbtTag, { type: 'compound' }>).value;
    for (const region of Object.values(regions)) {
      const r = (region as Extract<NbtTag, { type: 'compound' }>).value;
      const vec = (tag: NbtTag) => (tag as Extract<NbtTag, { type: 'compound' }>).value as Record<string, { value: number }>;
      const pos = vec(r.Position);
      const size = vec(r.Size);
      const names = (r.BlockStatePalette as Extract<NbtTag, { type: 'list' }>).value.map(
        (t) => ((t as Extract<NbtTag, { type: 'compound' }>).value.Name as { value: string }).value
      );
      const volume = size.x.value * size.y.value * size.z.value;
      const indices = unpackLongArray((r.BlockStates as { value: BigInt64Array }).value, bitsPerEntryFor(names.length), volume);
      let i = 0;
      for (let y = 0; y < size.y.value; y++)
        for (let z = 0; z < size.z.value; z++)
          for (let x = 0; x < size.x.value; x++) {
            const name = names[indices[i++]];
            if (name !== 'minecraft:air') decoded.set(`${pos.x.value + x},${pos.y.value + y},${pos.z.value + z}`, name);
          }
    }
    expect(decoded.size).toBe(5);
    for (const [x, y, z, id] of placed) expect(decoded.get(`${x},${y},${z}`)).toBe(id);
  });
});

describe('exportLitematic — progress', () => {
  it('reports write progress rising to 1 and then compress progress rising to 1, in order', () => {
    const grid = createVoxelGrid(40, 40, 40);
    let n = 0;
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) for (let z = 0; z < 40; z++) setVoxel(grid, x, y, z, n++ % 2 === 0 ? 'minecraft:stone' : 'minecraft:oak_planks');

    const events: { stage: string; fraction: number }[] = [];
    exportLitematic(grid, 'Progress', (p) => events.push(p));

    expect(events.length).toBeGreaterThan(0);
    const writeEvents = events.filter((e) => e.stage === 'write');
    const compressEvents = events.filter((e) => e.stage === 'compress');
    expect(writeEvents.length).toBeGreaterThan(0);
    expect(compressEvents).toEqual([
      { stage: 'compress', fraction: 0 },
      { stage: 'compress', fraction: 1 },
    ]);
    // write fractions never decrease, end at 1, and every compress event comes after every write one.
    for (let i = 1; i < writeEvents.length; i++) expect(writeEvents[i].fraction).toBeGreaterThanOrEqual(writeEvents[i - 1].fraction);
    expect(writeEvents[writeEvents.length - 1].fraction).toBe(1);
    expect(events.indexOf(compressEvents[0])).toBeGreaterThan(events.indexOf(writeEvents[writeEvents.length - 1]));
  });

  it('still finishes (and reports fraction 1) for an empty grid, with no division by zero', () => {
    const grid = createVoxelGrid(2, 2, 2);
    const events: { stage: string; fraction: number }[] = [];
    expect(() => exportLitematic(grid, 'Empty', (p) => events.push(p))).not.toThrow();
    expect(events).toContainEqual({ stage: 'compress', fraction: 1 });
  });
});
