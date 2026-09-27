import { describe, expect, it } from 'vitest';
import { resolveItemModel } from './resolveItemModel';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { getVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';

/**
 * A fence post/arm is a genuinely solid box element (unlike bars/panes, which are thin and need
 * `dropBarsCapBoxes` — see resolveItemModel.ts), so it should never have a real hole: no voxel that
 * is both missing (not stored) and exposed to real air. `rasterizeItemModel` does leave some cells
 * unstored — a voxel with every one of its 6 neighbours solid (the post's core, the post/arm
 * junction) never gets a colour, since colorVoxel finds no exposed face to sample — but those cells
 * are fully enclosed by other fence voxels and can never be seen from any angle, so omitting them is
 * a real, correct interior-culling optimisation, not a hole. This test tells the two apart directly:
 * it computes the fence's own real solid shape (every cell any element's box covers, independent of
 * the rasterizer), then checks every cell that shape claims but the rasterizer left empty — a hole
 * only if that cell also touches a position the shape does NOT claim, i.e. real open air.
 *
 * Prompted by a bug report describing "hollow" fence posts; investigation (see git history) found
 * zero real holes at the checked configurations — this test is what locks that finding in, so a
 * future rasterizeModel.ts change can't silently reintroduce one.
 */
describe.skipIf(!hasRealJar())(`fence has no real holes (real jar: ${REAL_JAR_PATH})`, () => {
  const NEIGHBOR_OFFSETS: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  async function setup() {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    return { archive, palette, decodeTexture };
  }

  /** Every cell any model element's rounded box covers, at the given resolution — the fence's own
   *  real solid shape, computed independently of colorVoxel's interior-culling. */
  function solidShape(elements: { from: [number, number, number]; to: [number, number, number] }[], scale: number): Set<string> {
    const shape = new Set<string>();
    for (const el of elements) {
      const [x0, y0, z0] = el.from.map((n) => Math.round(n * scale));
      const [x1, y1, z1] = el.to.map((n) => Math.round(n * scale));
      for (let x = x0; x < x1; x++) for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) shape.add(`${x},${y},${z}`);
    }
    return shape;
  }

  async function countRealHoles(itemName: string, properties: Record<string, string>, resolution: number) {
    const { archive, palette, decodeTexture } = await setup();
    const { model } = await resolveItemModel(itemName, archive.blockStateFiles, archive.modelFiles, properties);
    const shape = solidShape(model.elements, resolution / 16);
    const grid = await buildItemVoxelGrid(itemName, archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, resolution, { properties });

    let holes = 0;
    for (const key of shape) {
      const [x, y, z] = key.split(',').map(Number);
      if (getVoxel(grid, x, y, z) !== null) continue; // stored — not a hole
      const exposedToRealAir = NEIGHBOR_OFFSETS.some(([dx, dy, dz]) => !shape.has(`${x + dx},${y + dy},${z + dz}`));
      if (exposedToRealAir) holes++;
    }
    return { holes, solidCellCount: shape.size };
  }

  const NO_PROPS = { north: 'false', south: 'false', east: 'false', west: 'false', waterlogged: 'false' };
  const STRAIGHT = { ...NO_PROPS, north: 'true', south: 'true' };
  const CORNER = { ...NO_PROPS, north: 'true', east: 'true' };
  const ALL_FOUR = { north: 'true', south: 'true', east: 'true', west: 'true', waterlogged: 'false' };

  it.each([
    ['isolated post, no arms', NO_PROPS],
    ['two opposite arms (straight through)', STRAIGHT],
    ['two adjacent arms (a corner)', CORNER],
    ['all four arms connected', ALL_FOUR],
  ] as const)('oak_fence: %s has no voxel that is both missing and exposed to real air', async (_label, properties) => {
    const { holes, solidCellCount } = await countRealHoles('oak_fence', properties, 16);
    expect(solidCellCount).toBeGreaterThan(0);
    expect(holes).toBe(0);
  });

  it('holds at every resolution the app actually offers, not just 16', async () => {
    for (const resolution of [16, 32, 48, 64]) {
      const { holes } = await countRealHoles('oak_fence', ALL_FOUR, resolution);
      expect(holes, `resolution ${resolution}`).toBe(0);
    }
  });

  it('holds for every wood species and for iron bars (the other real fence-family multipart block)', async () => {
    for (const name of ['spruce_fence', 'dark_oak_fence', 'iron_bars']) {
      const { holes } = await countRealHoles(name, ALL_FOUR, 16);
      expect(holes, name).toBe(0);
    }
  });
});
