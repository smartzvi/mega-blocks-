import { describe, expect, it } from 'vitest';
import { filterPaletteForSource, isGlassFamilySource } from './glassSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string, glassOnly?: boolean): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'neutrals_concrete',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
    glassOnly,
  };
}

describe('isGlassFamilySource', () => {
  it('recognizes plain, stained, and tinted glass regardless of minecraft: prefix or case', () => {
    expect(isGlassFamilySource('glass')).toBe(true);
    expect(isGlassFamilySource('minecraft:white_stained_glass')).toBe(true);
    expect(isGlassFamilySource('Tinted_Glass')).toBe(true);
    expect(isGlassFamilySource('glass_pane')).toBe(true);
    expect(isGlassFamilySource('light_blue_stained_glass_pane')).toBe(true);
  });

  it('recognizes beacon and end_crystal', () => {
    expect(isGlassFamilySource('beacon')).toBe(true);
    expect(isGlassFamilySource('minecraft:end_crystal')).toBe(true);
  });

  it('rejects unrelated blocks, including other pale/white ones', () => {
    expect(isGlassFamilySource('white_wool')).toBe(false);
    expect(isGlassFamilySource('quartz_block')).toBe(false);
    expect(isGlassFamilySource('sea_lantern')).toBe(false);
    expect(isGlassFamilySource('diamond_block')).toBe(false);
  });
});

describe('filterPaletteForSource', () => {
  const glass = fakeEntry('minecraft:glass', true);
  const wool = fakeEntry('minecraft:white_wool', false);
  const palette = [glass, wool];

  it('keeps glassOnly entries when the source is glass-family', () => {
    expect(filterPaletteForSource(palette, 'white_stained_glass')).toEqual(palette);
    expect(filterPaletteForSource(palette, 'beacon')).toEqual(palette);
  });

  it('strips glassOnly entries when the source is not glass-family', () => {
    expect(filterPaletteForSource(palette, 'quartz_block')).toEqual([wool]);
  });
});
