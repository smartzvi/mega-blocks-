import { describe, expect, it } from 'vitest';
import { filterPaletteForPlanksSource, isPlanksFamilySource } from './woodPlanksSource';
import type { PaletteEntry } from '../../types/minecraft';

function fakeEntry(id: string, endGrainTopBottom?: boolean): PaletteEntry {
  return {
    id,
    textureBase: id,
    tint: null,
    family: 'wood_earth',
    textures: {} as PaletteEntry['textures'],
    avgLab: {} as PaletteEntry['avgLab'],
    avgHsv: {} as PaletteEntry['avgHsv'],
    endGrainTopBottom,
  };
}

describe('isPlanksFamilySource', () => {
  it('recognizes every real planks block, regardless of minecraft: prefix or case', () => {
    expect(isPlanksFamilySource('oak_planks')).toBe(true);
    expect(isPlanksFamilySource('minecraft:spruce_planks')).toBe(true);
    expect(isPlanksFamilySource('Crimson_Planks')).toBe(true);
  });

  it('rejects unrelated blocks, including the logs this filter excludes', () => {
    expect(isPlanksFamilySource('oak_log')).toBe(false);
    expect(isPlanksFamilySource('stripped_oak_log')).toBe(false);
    expect(isPlanksFamilySource('stone')).toBe(false);
  });
});

describe('filterPaletteForPlanksSource', () => {
  const oakPlanks = fakeEntry('minecraft:oak_planks');
  const sprucePlanks = fakeEntry('minecraft:spruce_planks');
  const oakLog = fakeEntry('minecraft:oak_log', true);
  const strippedOakLog = fakeEntry('minecraft:stripped_oak_log', true);
  const palette = [oakPlanks, sprucePlanks, oakLog, strippedOakLog];

  it('strips endGrainTopBottom (log/stem) entries for a planks source, on every face — not just top/bottom', () => {
    expect(filterPaletteForPlanksSource(palette, 'oak_planks')).toEqual([oakPlanks, sprucePlanks]);
    expect(filterPaletteForPlanksSource(palette, 'minecraft:spruce_planks')).toEqual([oakPlanks, sprucePlanks]);
  });

  it('leaves the palette untouched for non-planks sources, including the logs themselves', () => {
    expect(filterPaletteForPlanksSource(palette, 'oak_log')).toEqual(palette);
    expect(filterPaletteForPlanksSource(palette, 'stone')).toEqual(palette);
  });

  it('falls back to the full palette rather than an empty list when every entry is endGrainTopBottom', () => {
    const allLogs = [oakLog, strippedOakLog];
    expect(filterPaletteForPlanksSource(allLogs, 'oak_planks')).toEqual(allLogs);
  });
});
