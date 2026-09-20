import { describe, expect, it } from 'vitest';
import { filterPaletteForRedstoneSource, isRedstoneWireSource } from './redstoneSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'stone_deepslate',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
  };
}

describe('isRedstoneWireSource', () => {
  it('matches only redstone_wire, with or without the namespace', () => {
    expect(isRedstoneWireSource('redstone_wire')).toBe(true);
    expect(isRedstoneWireSource('minecraft:redstone_wire')).toBe(true);
    expect(isRedstoneWireSource('redstone_lamp')).toBe(false);
    expect(isRedstoneWireSource('redstone_block')).toBe(false);
  });
});

describe('filterPaletteForRedstoneSource', () => {
  const palette = ['minecraft:red_concrete', 'minecraft:red_wool', 'minecraft:red_terracotta', 'minecraft:orange_concrete', 'minecraft:stripped_mangrove_log'].map(fakeEntry);

  it('keeps only the red blocks for redstone wire', () => {
    expect(filterPaletteForRedstoneSource(palette, 'redstone_wire').map((e) => e.id)).toEqual([
      'minecraft:red_concrete',
      'minecraft:red_wool',
      'minecraft:red_terracotta',
    ]);
  });

  it('leaves every other source untouched', () => {
    expect(filterPaletteForRedstoneSource(palette, 'oak_planks')).toBe(palette);
  });

  it('falls back to the full palette when none of the red blocks exist (custom resource pack)', () => {
    const noRed = [fakeEntry('minecraft:stone')];
    expect(filterPaletteForRedstoneSource(noRed, 'redstone_wire')).toBe(noRed);
  });
});
