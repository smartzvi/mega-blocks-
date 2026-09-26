import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { forEachVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';

/**
 * A wire arm's line texture has to run along the arm. The east/west arms are the north arm's model
 * turned by the blockstate's y-rotation, and the flat top face's texture used to stay unturned, so
 * every east-west wire was drawn with a north-south line (seen in ancient_city/city_center_3).
 */
describe.skipIf(!hasRealJar())(`redstone wire orientation (real jar: ${REAL_JAR_PATH})`, () => {
  async function footprint(properties: Record<string, string>) {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    const grid = await buildItemVoxelGrid('redstone_wire', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 16, { properties });
    const xs = new Set<number>();
    const zs = new Set<number>();
    forEachVoxel(grid, (x, y, z) => {
      if (y > 1) return;
      xs.add(x);
      zs.add(z);
    });
    return { xs: xs.size, zs: zs.size };
  }

  const none = { north: 'none', south: 'none', east: 'none', west: 'none', power: '15' };

  it('a north-south wire is a line that stays in a narrow column of X', async () => {
    const { xs, zs } = await footprint({ ...none, north: 'side', south: 'side' });
    expect(zs).toBeGreaterThan(xs);
  });

  it('an east-west wire is a line that stays in a narrow row of Z — the mirror image, not a crosswise line', async () => {
    const { xs, zs } = await footprint({ ...none, east: 'side', west: 'side' });
    expect(xs).toBeGreaterThan(zs);
  });

  it('the west arm alone also runs along X', async () => {
    const { xs, zs } = await footprint({ ...none, west: 'side' });
    expect(xs).toBeGreaterThan(zs);
  });
});
