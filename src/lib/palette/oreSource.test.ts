import { describe, expect, it } from 'vitest';
import { filterPaletteForOreSource, isOreFamilySource } from './oreSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string, family: PaletteEntry['family'] = 'stone_deepslate'): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family,
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
  };
}

describe('isOreFamilySource', () => {
  it('recognizes every real ore block, regardless of minecraft: prefix or case', () => {
    expect(isOreFamilySource('iron_ore')).toBe(true);
    expect(isOreFamilySource('minecraft:deepslate_iron_ore')).toBe(true);
    expect(isOreFamilySource('Nether_Gold_Ore')).toBe(true);
    expect(isOreFamilySource('copper_ore')).toBe(true);
  });

  it('recognizes ancient_debris as its own exact-name exception (does not end in _ore)', () => {
    expect(isOreFamilySource('ancient_debris')).toBe(true);
    expect(isOreFamilySource('minecraft:ancient_debris')).toBe(true);
  });

  it('rejects unrelated blocks', () => {
    expect(isOreFamilySource('stone')).toBe(false);
    expect(isOreFamilySource('iron_block')).toBe(false);
    expect(isOreFamilySource('core')).toBe(false); // contains "ore" but doesn't end with "_ore"
  });
});

describe('filterPaletteForOreSource', () => {
  const stone = fakeEntry('minecraft:stone', 'stone_deepslate');
  const junglePlanks = fakeEntry('minecraft:jungle_planks', 'wood_earth');
  const whiteTerracotta = fakeEntry('minecraft:white_terracotta', 'sand_clay');
  const palette = [stone, junglePlanks, whiteTerracotta];

  it('strips wood_earth entries for an ore source, keeping every other family', () => {
    expect(filterPaletteForOreSource(palette, 'iron_ore')).toEqual([stone, whiteTerracotta]);
    expect(filterPaletteForOreSource(palette, 'deepslate_copper_ore')).toEqual([stone, whiteTerracotta]);
    expect(filterPaletteForOreSource(palette, 'ancient_debris')).toEqual([stone, whiteTerracotta]);
  });

  it('leaves the palette untouched for non-ore sources', () => {
    expect(filterPaletteForOreSource(palette, 'oak_planks')).toEqual(palette);
    expect(filterPaletteForOreSource(palette, 'stone')).toEqual(palette);
  });

  it('falls back to the full palette rather than an empty list when every entry is wood_earth', () => {
    const allWood = [junglePlanks];
    expect(filterPaletteForOreSource(allWood, 'iron_ore')).toEqual(allWood);
  });
});
