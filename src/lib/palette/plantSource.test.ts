import { describe, expect, it } from 'vitest';
import { isPlantSource } from './plantSource';
import { filterPaletteForSource } from './glassSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'wood_earth',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
  };
}

describe('isPlantSource', () => {
  it('recognizes leaf litter and every melon/pumpkin stem block, with or without the namespace', () => {
    for (const name of ['leaf_litter', 'melon_stem', 'pumpkin_stem', 'attached_melon_stem', 'attached_pumpkin_stem', 'minecraft:leaf_litter']) {
      expect(isPlantSource(name)).toBe(true);
    }
  });

  it('rejects everything else', () => {
    expect(isPlantSource('oak_leaves')).toBe(false);
    expect(isPlantSource('melon')).toBe(false);
    expect(isPlantSource('oak_planks')).toBe(false);
  });
});

describe('filterPaletteForSource for plant sources', () => {
  const palette = ['minecraft:brown_terracotta', 'minecraft:brown_wool', 'minecraft:spruce_planks', 'minecraft:jungle_log', 'minecraft:bamboo_block'].map(fakeEntry);

  it('drops wood for leaf litter and stems, keeping the non-wood browns', () => {
    for (const name of ['leaf_litter', 'melon_stem', 'attached_pumpkin_stem']) {
      expect(filterPaletteForSource(palette, name).map((e) => e.id)).toEqual(['minecraft:brown_terracotta', 'minecraft:brown_wool']);
    }
  });

  it('leaves wood available to every other source', () => {
    expect(filterPaletteForSource(palette, 'oak_planks')).toHaveLength(5);
  });
});
