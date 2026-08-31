import { describe, expect, it } from 'vitest';
import { filterPaletteForLeafSource, isLeafFamilySource } from './leafSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'neutrals_concrete',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
  };
}

describe('isLeafFamilySource', () => {
  it('recognizes every real leaf type and vine, regardless of minecraft: prefix or case', () => {
    expect(isLeafFamilySource('oak_leaves')).toBe(true);
    expect(isLeafFamilySource('minecraft:spruce_leaves')).toBe(true);
    expect(isLeafFamilySource('Azalea_Leaves')).toBe(true);
    expect(isLeafFamilySource('vine')).toBe(true);
    expect(isLeafFamilySource('minecraft:vine')).toBe(true);
  });

  it('excludes cherry_leaves — its real texture is already baked-in pink, not tinted green', () => {
    expect(isLeafFamilySource('cherry_leaves')).toBe(false);
    expect(isLeafFamilySource('minecraft:cherry_leaves')).toBe(false);
  });

  it('rejects unrelated blocks', () => {
    expect(isLeafFamilySource('oak_planks')).toBe(false);
    expect(isLeafFamilySource('green_wool')).toBe(false);
    expect(isLeafFamilySource('leaves')).toBe(false); // not a real block name
  });
});

describe('filterPaletteForLeafSource', () => {
  const stone = fakeEntry('minecraft:deepslate_tiles');
  const greenWool = fakeEntry('minecraft:green_wool');
  const limeConcrete = fakeEntry('minecraft:lime_concrete');
  const palette = [stone, greenWool, limeConcrete];

  it('restricts a leaves/vine source to the green/lime family, dropping unrelated entries', () => {
    expect(filterPaletteForLeafSource(palette, 'spruce_leaves')).toEqual([greenWool, limeConcrete]);
    expect(filterPaletteForLeafSource(palette, 'vine')).toEqual([greenWool, limeConcrete]);
  });

  it('leaves the palette untouched for cherry_leaves and every non-leaf source', () => {
    expect(filterPaletteForLeafSource(palette, 'cherry_leaves')).toEqual(palette);
    expect(filterPaletteForLeafSource(palette, 'oak_planks')).toEqual(palette);
  });

  it('falls back to the full palette rather than an empty list when it has no green/lime entries at all', () => {
    const noGreenPalette = [stone];
    expect(filterPaletteForLeafSource(noGreenPalette, 'oak_leaves')).toEqual(noGreenPalette);
  });
});
