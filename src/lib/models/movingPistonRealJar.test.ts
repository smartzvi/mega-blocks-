import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { forEachVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';
import { isNonOccluding } from '../structure/cullInteriorVoxels';

describe.skipIf(!hasRealJar())(`moving_piston (real jar: ${REAL_JAR_PATH})`, () => {
  async function setup() {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    const build = (name: string, properties?: Record<string, string>) =>
      buildItemVoxelGrid(name, archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 16, { properties });
    return { build };
  }

  function snapshot(grid: Parameters<typeof forEachVoxel>[0]): string {
    const cells: string[] = [];
    forEachVoxel(grid, (x, y, z, id) => cells.push(`${x},${y},${z}:${id}`));
    return cells.sort().join('|');
  }

  // Mean position of every voxel — the head plate is the heavy end, so it pulls the mean toward
  // whichever side the piston faces (the rod alone spans the full depth, so extents can't tell).
  function centroid(grid: Parameters<typeof forEachVoxel>[0]) {
    const sum = [0, 0, 0];
    let n = 0;
    forEachVoxel(grid, (x, y, z) => {
      sum[0] += x;
      sum[1] += y;
      sum[2] += z;
      n++;
    });
    return sum.map((v) => v / n);
  }

  it('a bare pick renders as a piston head instead of failing with "no elements"', async () => {
    const { build } = await setup();
    const grid = await build('moving_piston');
    const head = await build('piston_head', { facing: 'north', type: 'normal', short: 'false' });
    expect(snapshot(grid)).toBe(snapshot(head));
    expect(snapshot(grid).length).toBeGreaterThan(0);
  });

  it('follows its own facing: the head plate pulls the mean toward the faced side: low Z for north, high Z for south, high X for east', async () => {
    const { build } = await setup();
    const north = centroid(await build('moving_piston', { facing: 'north', type: 'normal' }));
    const south = centroid(await build('moving_piston', { facing: 'south', type: 'normal' }));
    const east = centroid(await build('moving_piston', { facing: 'east', type: 'normal' }));
    expect(north[2]).toBeLessThan(south[2]);
    expect(east[0]).toBeGreaterThan(north[0]);
  });

  it('sticky and normal differ (the sticky head has its own slime-coloured face)', async () => {
    const { build } = await setup();
    const normal = await build('moving_piston', { facing: 'north', type: 'normal' });
    const sticky = await build('moving_piston', { facing: 'north', type: 'sticky' });
    expect(snapshot(normal)).not.toBe(snapshot(sticky));
  });

  it('never counts as a solid neighbour when culling a structure', () => {
    expect(isNonOccluding('minecraft:moving_piston[facing=north,type=normal]')).toBe(true);
  });
});
