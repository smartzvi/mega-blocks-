import { describe, expect, it } from 'vitest';
import { filterNeutralStoneForWoodSource } from './neutralStoneExclusion';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';

function solidTexture(r: number, g: number, b: number): FaceTexture {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width: 16, height: 16, data };
}

function fakeEntry(id: string, r: number, g: number, b: number, family: MaterialFamily): PaletteEntry {
  const tex = solidTexture(r, g, b);
  const lab = averageColorLab(tex);
  const hsv = averageColorHsv(tex);
  return {
    id,
    textureBase: id,
    tint: null,
    family,
    textures: { top: tex, bottom: tex, north: tex, south: tex, east: tex, west: tex },
    avgLab: { top: lab, bottom: lab, north: lab, south: lab, east: lab, west: lab },
    avgHsv: { top: hsv, bottom: hsv, north: hsv, south: hsv, east: hsv, west: hsv },
  };
}

describe('filterNeutralStoneForWoodSource', () => {
  // Genuinely gray (r=g=b, saturation 0) — the real acacia_log bug: this kind of entry was
  // winning ~29% of acacia_log's bark pixels through the family-penalty's own "near-neutral
  // candidates are exempt" carve-out.
  const grayConcrete = fakeEntry('minecraft:light_gray_concrete', 150, 150, 150, 'neutrals_concrete');
  const polishedDeepslate = fakeEntry('minecraft:polished_deepslate', 90, 90, 92, 'stone_deepslate');
  // Muted but still has real hue (earthy brown) — the harmless cases (spruce/jungle/dark_oak
  // pulling in brown_concrete) that shouldn't be touched.
  const brownConcrete = fakeEntry('minecraft:brown_concrete', 100, 70, 45, 'neutrals_concrete');
  const acaciaLog = fakeEntry('minecraft:acacia_log', 90, 70, 60, 'wood_earth');
  const palette = [grayConcrete, polishedDeepslate, brownConcrete, acaciaLog];

  it('strips genuinely-neutral (hueless) stone/concrete entries for a wood-family source', () => {
    const result = filterNeutralStoneForWoodSource(palette, 'acacia_log');
    expect(result).toEqual([brownConcrete, acaciaLog]);
  });

  it('keeps a same-hue-family concrete entry (muted, not hueless)', () => {
    const result = filterNeutralStoneForWoodSource(palette, 'acacia_log');
    expect(result).toContainEqual(brownConcrete);
  });

  it('does nothing for a non-wood source', () => {
    expect(filterNeutralStoneForWoodSource(palette, 'stone')).toEqual(palette);
  });

  it('recognizes wood-family sources regardless of minecraft: prefix or case', () => {
    expect(filterNeutralStoneForWoodSource(palette, 'minecraft:acacia_log')).toEqual([brownConcrete, acaciaLog]);
    expect(filterNeutralStoneForWoodSource(palette, 'Stripped_Acacia_Log')).toEqual([brownConcrete, acaciaLog]);
  });
});
