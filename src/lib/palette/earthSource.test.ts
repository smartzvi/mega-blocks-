import { describe, expect, it } from 'vitest';
import { isEarthFamilySource } from './earthSource';
import { filterPaletteForSource } from './glassSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string, flags: Partial<Pick<PaletteEntry, 'glassOnly' | 'earthOnly'>> = {}): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'wood_earth',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
    ...flags,
  };
}

describe('isEarthFamilySource', () => {
  it('recognizes dirt- and grass-family sources, with or without the namespace or case', () => {
    for (const name of ['grass_block', 'dirt', 'coarse_dirt', 'podzol', 'mycelium', 'rooted_dirt', 'farmland', 'dirt_path']) {
      expect(isEarthFamilySource(name)).toBe(true);
    }
    expect(isEarthFamilySource('minecraft:Grass_Block')).toBe(true);
  });

  it('rejects unrelated sources, including other brown ones', () => {
    expect(isEarthFamilySource('mud')).toBe(false);
    expect(isEarthFamilySource('brown_terracotta')).toBe(false);
    expect(isEarthFamilySource('oak_planks')).toBe(false);
    expect(isEarthFamilySource('short_grass')).toBe(false);
  });
});

describe('filterPaletteForSource with earthOnly entries', () => {
  const palette = [
    fakeEntry('minecraft:stone'),
    fakeEntry('minecraft:glass', { glassOnly: true }),
    fakeEntry('minecraft:dirt', { earthOnly: true }),
    fakeEntry('minecraft:coarse_dirt', { earthOnly: true }),
  ];

  it('offers dirt to earth-family sources but not glass', () => {
    expect(filterPaletteForSource(palette, 'grass_block').map((e) => e.id)).toEqual(['minecraft:stone', 'minecraft:dirt', 'minecraft:coarse_dirt']);
  });

  it('keeps dirt out of every unrelated source', () => {
    expect(filterPaletteForSource(palette, 'oak_planks').map((e) => e.id)).toEqual(['minecraft:stone']);
  });

  it('drops wood planks, logs and stems for earth-family sources only — soil matched to wood looked wrong', () => {
    const withWood = [
      fakeEntry('minecraft:dirt', { earthOnly: true }),
      fakeEntry('minecraft:brown_terracotta'),
      fakeEntry('minecraft:mud'),
      fakeEntry('minecraft:jungle_planks'),
      fakeEntry('minecraft:spruce_log'),
      fakeEntry('minecraft:stripped_crimson_stem'),
    ];
    expect(filterPaletteForSource(withWood, 'grass_block').map((e) => e.id)).toEqual(['minecraft:dirt', 'minecraft:brown_terracotta', 'minecraft:mud']);
    expect(filterPaletteForSource(withWood, 'oak_planks').map((e) => e.id)).toEqual(['minecraft:brown_terracotta', 'minecraft:mud', 'minecraft:jungle_planks', 'minecraft:spruce_log', 'minecraft:stripped_crimson_stem']);
  });

  it('still offers glass to glass sources without leaking dirt', () => {
    expect(filterPaletteForSource(palette, 'glass').map((e) => e.id)).toEqual(['minecraft:stone', 'minecraft:glass']);
  });
});
