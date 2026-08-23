import { describe, expect, it } from 'vitest';
import { filterLightSourcesForSource, isBedFamilySource, isDiamondFamilySource, isDirtFamilySource, isWoodFamilySource } from './lightSourceExclusion';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string, lightSource?: boolean): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'neutrals_concrete',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
    lightSource,
  };
}

describe('isDiamondFamilySource', () => {
  it('recognizes every real diamond_* block, regardless of minecraft: prefix or case', () => {
    expect(isDiamondFamilySource('diamond_block')).toBe(true);
    expect(isDiamondFamilySource('minecraft:diamond_ore')).toBe(true);
    expect(isDiamondFamilySource('Deepslate_Diamond_Ore')).toBe(true);
  });

  it('rejects unrelated blocks', () => {
    expect(isDiamondFamilySource('emerald_block')).toBe(false);
    expect(isDiamondFamilySource('quartz_block')).toBe(false);
    expect(isDiamondFamilySource('sea_lantern')).toBe(false);
  });
});

describe('isWoodFamilySource', () => {
  it('recognizes planks, logs, stripped logs, and nether stems, regardless of prefix or case', () => {
    expect(isWoodFamilySource('birch_log')).toBe(true);
    expect(isWoodFamilySource('minecraft:oak_planks')).toBe(true);
    expect(isWoodFamilySource('Stripped_Dark_Oak_Log')).toBe(true);
    expect(isWoodFamilySource('crimson_stem')).toBe(true);
    expect(isWoodFamilySource('stripped_warped_stem')).toBe(true);
    expect(isWoodFamilySource('bamboo_block')).toBe(true);
    expect(isWoodFamilySource('stripped_bamboo_block')).toBe(true);
    expect(isWoodFamilySource('bamboo_planks')).toBe(true);
  });

  it('rejects unrelated blocks, including other stem-suffixed crop blocks', () => {
    expect(isWoodFamilySource('pumpkin_stem')).toBe(false);
    expect(isWoodFamilySource('melon_stem')).toBe(false);
    expect(isWoodFamilySource('stone')).toBe(false);
    expect(isWoodFamilySource('mud')).toBe(false);
  });
});

describe('isDirtFamilySource', () => {
  it('recognizes every real dirt-block variant, regardless of minecraft: prefix or case', () => {
    expect(isDirtFamilySource('dirt')).toBe(true);
    expect(isDirtFamilySource('minecraft:coarse_dirt')).toBe(true);
    expect(isDirtFamilySource('Rooted_Dirt')).toBe(true);
  });

  it('rejects unrelated blocks', () => {
    expect(isDirtFamilySource('grass_block')).toBe(false);
    expect(isDirtFamilySource('podzol')).toBe(false);
    expect(isDirtFamilySource('mud')).toBe(false);
  });
});

describe('isBedFamilySource', () => {
  it('recognizes every dyed bed variant, regardless of minecraft: prefix or case', () => {
    expect(isBedFamilySource('red_bed')).toBe(true);
    expect(isBedFamilySource('minecraft:white_bed')).toBe(true);
    expect(isBedFamilySource('Light_Blue_Bed')).toBe(true);
  });

  it('rejects unrelated blocks', () => {
    expect(isBedFamilySource('bedrock')).toBe(false);
    expect(isBedFamilySource('red_concrete')).toBe(false);
  });
});

describe('filterLightSourcesForSource', () => {
  const seaLantern = fakeEntry('minecraft:sea_lantern', true);
  const stone = fakeEntry('minecraft:stone', false);
  const palette = [seaLantern, stone];

  it('strips lightSource entries for a diamond-family source', () => {
    expect(filterLightSourcesForSource(palette, 'diamond_block')).toEqual([stone]);
  });

  it('strips lightSource entries for a wood-family source', () => {
    expect(filterLightSourcesForSource(palette, 'birch_log')).toEqual([stone]);
  });

  it('strips lightSource entries for a dirt-family source (e.g. glowstone no longer used in dirt builds)', () => {
    expect(filterLightSourcesForSource(palette, 'dirt')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'minecraft:coarse_dirt')).toEqual([stone]);
  });

  it('strips lightSource entries for sheep, bee, and wolf specifically (exact-name exclusion, not a family)', () => {
    expect(filterLightSourcesForSource(palette, 'sheep')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'minecraft:sheep')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'bee')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'minecraft:bee')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'wolf')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'minecraft:wolf')).toEqual([stone]);
  });

  it('strips lightSource entries for a bed-family source (e.g. froglight no longer used in bed pillows/blankets)', () => {
    expect(filterLightSourcesForSource(palette, 'red_bed')).toEqual([stone]);
    expect(filterLightSourcesForSource(palette, 'minecraft:white_bed')).toEqual([stone]);
  });

  it('keeps lightSource entries for any other source, including other mobs', () => {
    expect(filterLightSourcesForSource(palette, 'resin_block')).toEqual(palette);
    expect(filterLightSourcesForSource(palette, 'pig')).toEqual(palette);
  });
});
