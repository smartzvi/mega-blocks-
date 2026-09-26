import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { resolveHandAuthoredTemplate } from './handAuthoredTemplates';
import { forEachVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { filterPaletteForSource } from '../palette/glassSource';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';

describe('fluid surface templates', () => {
  it('only build for a bare item-mode pick — a structure\'s water/lava carries a real level property and keeps its flat-cube fallback', () => {
    expect(resolveHandAuthoredTemplate('water')).toBeDefined();
    expect(resolveHandAuthoredTemplate('lava')).toBeDefined();
    expect(resolveHandAuthoredTemplate('water', { level: '0' })).toBeUndefined();
    expect(resolveHandAuthoredTemplate('lava', { level: '0' })).toBeUndefined();
  });
});

describe.skipIf(!hasRealJar())(`water / lava (real jar: ${REAL_JAR_PATH})`, () => {
  async function build(name: 'water' | 'lava') {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    const grid = await buildItemVoxelGrid(name, archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 16);
    return { grid, palette };
  }

  it.each([
    ['water', 'minecraft:blue_stained_glass'],
    ['lava', 'minecraft:resin_block'],
  ] as const)('%s voxelizes to exactly one full 16x16 top layer of %s', async (name, blockId) => {
    const { grid } = await build(name);
    const ys = new Set<number>();
    const ids = new Set<string>();
    let count = 0;
    forEachVoxel(grid, (_x, y, _z, id) => {
      ys.add(y);
      ids.add(id);
      count++;
    });
    expect(count).toBe(256);
    expect([...ys]).toEqual([15]);
    expect([...ids]).toEqual([blockId]);
  });

  it('resin_block and glass reach only their own source: resin only for lava, glass now also for water', async () => {
    const { palette } = await build('lava');
    const has = (src: string, id: string) => filterPaletteForSource(palette, src).some((e) => e.id === id);
    expect(has('lava', 'minecraft:resin_block')).toBe(true);
    for (const other of ['resin_block', 'orange_concrete', 'water', 'stone']) expect(has(other, 'minecraft:resin_block')).toBe(false);
    expect(has('water', 'minecraft:blue_stained_glass')).toBe(true);
    expect(has('lava', 'minecraft:blue_stained_glass')).toBe(false);
  });
});
