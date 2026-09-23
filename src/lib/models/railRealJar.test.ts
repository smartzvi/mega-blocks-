import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { forEachVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';

/**
 * End-to-end proof, against the real jar, that an ascending rail voxelizes into a genuine ramp —
 * not just that railTemplates.ts's own element coordinates look right in isolation (railTemplates
 * .test.ts already covers that), but that the real texture decode + real palette match + real
 * rasterizeItemModel pipeline (buildItemVoxelGrid.ts) turns them into a voxel grid that actually
 * climbs.
 */
describe.skipIf(!hasRealJar())(`rail (real jar: ${REAL_JAR_PATH})`, () => {
  async function setup() {
    const archive = await loadRealArchive();
    const textures = await extractTextures(archive);
    const palette = buildPalette(textures);
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    return { archive, palette, decodeTexture };
  }

  it('voxelizes a straight rail as one thin, flat layer matching the real texture\'s own tie-gap cutout pattern (rail.png genuinely has transparent gaps between ties — verified directly, not assumed: 144 of 256 pixels opaque)', async () => {
    const { archive, palette, decodeTexture } = await setup();
    const grid = await buildItemVoxelGrid('rail', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 16, {
      properties: { shape: 'north_south' },
    });

    const ys = new Set<number>();
    let count = 0;
    forEachVoxel(grid, (_x, y) => {
      ys.add(y);
      count++;
    });
    expect(ys.size).toBe(1); // exactly one Y row — genuinely flat
    expect(count).toBe(144); // the real texture's own opaque pixel count, a genuine cutout, not a bug
  });

  it('voxelizes ascending_north as a real ramp: the highest solid voxel sits near the north edge (z=0) and the lowest near the south edge (z=15), climbing monotonically in between', async () => {
    const { archive, palette, decodeTexture } = await setup();
    const grid = await buildItemVoxelGrid('rail', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 16, {
      properties: { shape: 'ascending_north' },
    });

    // Highest solid Y at each Z column, sampled at X=2 — one of the few columns the real rail
    // texture's own alternating tie-gap pattern (see the straight-rail test above) keeps opaque on
    // every row, so it's solid regardless of which texture row a given ramp step happens to sample.
    const topYByZ = new Array(16).fill(-1);
    forEachVoxel(grid, (x, y, z) => {
      if (x === 2 && y > topYByZ[z]) topYByZ[z] = y;
    });

    expect(topYByZ[0]).toBeGreaterThan(topYByZ[15]); // north edge is higher than south edge
    // Monotonically non-increasing from north (z=0) to south (z=15) — a real single-direction ramp.
    for (let i = 1; i < topYByZ.length; i++) {
      if (topYByZ[i] === -1 || topYByZ[i - 1] === -1) continue;
      expect(topYByZ[i]).toBeLessThanOrEqual(topYByZ[i - 1]);
    }
  });

  it('every rail-family block and every real shape voxelizes without throwing, at the resolution the app actually offers', async () => {
    const { archive, palette, decodeTexture } = await setup();
    const shapes = [
      'north_south', 'east_west', 'north_east', 'north_west', 'south_east', 'south_west',
      'ascending_north', 'ascending_south', 'ascending_east', 'ascending_west',
    ];
    for (const name of ['rail', 'powered_rail', 'detector_rail', 'activator_rail']) {
      for (const shape of shapes) {
        const grid = await buildItemVoxelGrid(name, archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 32, {
          properties: { shape, powered: 'false' },
        });
        let count = 0;
        forEachVoxel(grid, () => count++);
        expect(count, `${name} ${shape}`).toBeGreaterThan(0);
      }
    }
  });
});
