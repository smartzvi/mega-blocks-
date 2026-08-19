import { describe, expect, it } from 'vitest';
import { nbt } from '../../types/nbt';
import { parseVanillaStructure } from './parseVanillaStructure';

describe('parseVanillaStructure', () => {
  it('parses a small structure into a dense VoxelGrid with the right blocks at the right positions', () => {
    const root = nbt.compound({
      DataVersion: nbt.int(3955),
      size: nbt.list('int', [nbt.int(2), nbt.int(2), nbt.int(2)]),
      entities: nbt.list('compound', []),
      palette: nbt.list('compound', [
        nbt.compound({ Name: nbt.string('minecraft:oak_planks') }),
        nbt.compound({ Name: nbt.string('minecraft:stone') }),
      ]),
      blocks: nbt.list('compound', [
        nbt.compound({ state: nbt.int(0), pos: nbt.list('int', [nbt.int(0), nbt.int(0), nbt.int(0)]) }),
        nbt.compound({ state: nbt.int(1), pos: nbt.list('int', [nbt.int(1), nbt.int(1), nbt.int(1)]) }),
      ]),
    });

    const { grid, blockIds } = parseVanillaStructure(root);
    expect(grid.sizeX).toBe(2);
    expect(grid.sizeY).toBe(2);
    expect(grid.sizeZ).toBe(2);
    expect(grid.voxels[0][0][0]).toBe('minecraft:oak_planks');
    expect(grid.voxels[1][1][1]).toBe('minecraft:stone');
    // Unlisted positions default to air (null), not left undefined.
    expect(grid.voxels[0][1][0]).toBeNull();
    expect(blockIds).toEqual(new Set(['minecraft:oak_planks', 'minecraft:stone']));
  });

  it('normalizes air-like palette entries to null even when explicitly listed in blocks', () => {
    // Real structures sometimes list every position, including air, rather than omitting it.
    const root = nbt.compound({
      size: nbt.list('int', [nbt.int(1), nbt.int(1), nbt.int(1)]),
      palette: nbt.list('compound', [nbt.compound({ Name: nbt.string('minecraft:cave_air') })]),
      blocks: nbt.list('compound', [
        nbt.compound({ state: nbt.int(0), pos: nbt.list('int', [nbt.int(0), nbt.int(0), nbt.int(0)]) }),
      ]),
    });

    const { grid, blockIds } = parseVanillaStructure(root);
    expect(grid.voxels[0][0][0]).toBeNull();
    expect(blockIds.size).toBe(0);
  });

  it('folds a palette entry\'s Properties into the cell\'s blockstate key, sorted alphabetically', () => {
    const root = nbt.compound({
      size: nbt.list('int', [nbt.int(1), nbt.int(1), nbt.int(1)]),
      palette: nbt.list('compound', [
        nbt.compound({
          Name: nbt.string('minecraft:oak_stairs'),
          Properties: nbt.compound({
            shape: nbt.string('straight'),
            facing: nbt.string('east'),
            half: nbt.string('bottom'),
          }),
        }),
      ]),
      blocks: nbt.list('compound', [
        nbt.compound({ state: nbt.int(0), pos: nbt.list('int', [nbt.int(0), nbt.int(0), nbt.int(0)]) }),
      ]),
    });

    const { grid, blockIds } = parseVanillaStructure(root);
    expect(grid.voxels[0][0][0]).toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]');
    expect(blockIds).toEqual(new Set(['minecraft:oak_stairs[facing=east,half=bottom,shape=straight]']));
  });

  it('throws a clear error for an out-of-range palette index', () => {
    const root = nbt.compound({
      size: nbt.list('int', [nbt.int(1), nbt.int(1), nbt.int(1)]),
      palette: nbt.list('compound', [nbt.compound({ Name: nbt.string('minecraft:stone') })]),
      blocks: nbt.list('compound', [
        nbt.compound({ state: nbt.int(5), pos: nbt.list('int', [nbt.int(0), nbt.int(0), nbt.int(0)]) }),
      ]),
    });

    expect(() => parseVanillaStructure(root)).toThrow(/palette index 5/);
  });
});
