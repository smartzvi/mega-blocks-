import { describe, expect, it } from 'vitest';
import { nbt } from '../../types/nbt';
import { bitsPerEntryFor, packLongArray } from '../nbt/bitpack';
import { parseLitematic } from './parseLitematic';

/** Builds a Regions.<name> compound from a flat (x,y,z)->name function, packing indices in the
 *  same y-outer/z-middle/x-inner order the real writer/reader both use. */
function regionTag(
  position: [number, number, number],
  size: [number, number, number],
  paletteNames: string[],
  blockAt: (x: number, y: number, z: number) => number, // palette index
  paletteProperties: Record<number, Record<string, string>> = {}
) {
  const [sizeX, sizeY, sizeZ] = size.map(Math.abs) as [number, number, number];
  const indices: number[] = [];
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        indices.push(blockAt(x, y, z));
      }
    }
  }
  const bitsPerEntry = bitsPerEntryFor(paletteNames.length);
  const blockStates = packLongArray(indices, bitsPerEntry);

  return nbt.compound({
    Position: nbt.compound({ x: nbt.int(position[0]), y: nbt.int(position[1]), z: nbt.int(position[2]) }),
    Size: nbt.compound({ x: nbt.int(size[0]), y: nbt.int(size[1]), z: nbt.int(size[2]) }),
    BlockStatePalette: nbt.list(
      'compound',
      paletteNames.map((name, i) => {
        const properties = paletteProperties[i];
        const fields: Record<string, ReturnType<typeof nbt.string>> = { Name: nbt.string(name) };
        if (properties) {
          fields.Properties = nbt.compound(Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, nbt.string(v)])));
        }
        return nbt.compound(fields);
      })
    ),
    BlockStates: nbt.longArray(blockStates),
  });
}

describe('parseLitematic', () => {
  it('parses a single positive-size region into a dense VoxelGrid', () => {
    const palette = ['minecraft:air', 'minecraft:stone'];
    const root = nbt.compound({
      Version: nbt.int(6),
      Regions: nbt.compound({
        Main: regionTag([0, 0, 0], [2, 2, 2], palette, (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0)),
      }),
    });

    const { grid, blockIds } = parseLitematic(root);
    expect(grid.sizeX).toBe(2);
    expect(grid.sizeY).toBe(2);
    expect(grid.sizeZ).toBe(2);
    expect(grid.voxels[0][0][0]).toBe('minecraft:stone');
    expect(grid.voxels[1][0][0]).toBeNull();
    expect(blockIds).toEqual(new Set(['minecraft:stone']));
  });

  it('normalizes a negative-size region to its true min-corner + positive size', () => {
    // Position (10,10,10), Size (-3,-3,-3) -> real bounding box is x/y/z in [8,10], i.e. min-corner
    // (8,8,8), size 3x3x3. The single solid block is at region-local (2,2,2) = world (10,10,10).
    const palette = ['minecraft:air', 'minecraft:oak_planks'];
    const root = nbt.compound({
      Version: nbt.int(6),
      Regions: nbt.compound({
        Main: regionTag([10, 10, 10], [-3, -3, -3], palette, (x, y, z) => (x === 2 && y === 2 && z === 2 ? 1 : 0)),
      }),
    });

    const { grid } = parseLitematic(root);
    expect(grid.sizeX).toBe(3);
    expect(grid.sizeY).toBe(3);
    expect(grid.sizeZ).toBe(3);
    // World (10,10,10) maps to grid-local (2,2,2) once offset by the min-corner (8,8,8).
    expect(grid.voxels[2][2][2]).toBe('minecraft:oak_planks');
    expect(grid.voxels[0][0][0]).toBeNull();
  });

  it('composites multiple regions into their union bounding box, with each region resolving its own palette', () => {
    const paletteA = ['minecraft:air', 'minecraft:stone'];
    const paletteB = ['minecraft:air', 'minecraft:oak_log']; // different palette order/content than region A
    const root = nbt.compound({
      Version: nbt.int(6),
      Regions: nbt.compound({
        A: regionTag([0, 0, 0], [2, 2, 2], paletteA, (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0)),
        B: regionTag([3, 0, 0], [2, 2, 2], paletteB, (x, y, z) => (x === 0 && y === 0 && z === 0 ? 1 : 0)),
      }),
    });

    const { grid, blockIds } = parseLitematic(root);
    // Union bounding box: A spans x[0,2), B spans x[3,5) -> combined x[0,5).
    expect(grid.sizeX).toBe(5);
    expect(grid.voxels[0][0][0]).toBe('minecraft:stone'); // region A's own palette resolved correctly
    expect(grid.voxels[3][0][0]).toBe('minecraft:oak_log'); // region B's own palette resolved correctly, not A's
    expect(blockIds).toEqual(new Set(['minecraft:stone', 'minecraft:oak_log']));
  });

  it('resolves overlapping regions with the later region (file/object order) winning', () => {
    const paletteA = ['minecraft:air', 'minecraft:stone'];
    const paletteB = ['minecraft:air', 'minecraft:glass'];
    const root = nbt.compound({
      Version: nbt.int(6),
      Regions: nbt.compound({
        A: regionTag([0, 0, 0], [1, 1, 1], paletteA, () => 1), // solid stone
        B: regionTag([0, 0, 0], [1, 1, 1], paletteB, () => 1), // same cell, solid glass, declared after A
      }),
    });

    const { grid } = parseLitematic(root);
    expect(grid.voxels[0][0][0]).toBe('minecraft:glass');
  });

  it('folds a palette entry\'s Properties into the cell\'s blockstate key', () => {
    const palette = ['minecraft:air', 'minecraft:oak_log'];
    const root = nbt.compound({
      Version: nbt.int(6),
      Regions: nbt.compound({
        Main: regionTag([0, 0, 0], [1, 1, 1], palette, () => 1, { 1: { axis: 'x' } }),
      }),
    });

    const { grid, blockIds } = parseLitematic(root);
    expect(grid.voxels[0][0][0]).toBe('minecraft:oak_log[axis=x]');
    expect(blockIds).toEqual(new Set(['minecraft:oak_log[axis=x]']));
  });

  it('throws a clear error when the file has no regions', () => {
    const root = nbt.compound({ Version: nbt.int(6), Regions: nbt.compound({}) });
    expect(() => parseLitematic(root)).toThrow(/no regions/i);
  });
});
