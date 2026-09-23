import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { forEachVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';

/**
 * End-to-end proof, against the real jar, that a lever voxelizes into a genuinely tilted arm that
 * actually flips when `powered` changes — not just that leverTemplate.ts's own element coordinates
 * look right in isolation (leverTemplate.test.ts already covers that), but that the real texture
 * decode + real palette match + real rasterizeItemModel pipeline (buildItemVoxelGrid.ts) turns them
 * into a voxel grid that visibly differs between on and off.
 */
describe.skipIf(!hasRealJar())(`lever (real jar: ${REAL_JAR_PATH})`, () => {
  async function setup() {
    const archive = await loadRealArchive();
    const textures = await extractTextures(archive);
    const palette = buildPalette(textures);
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    return { archive, palette, decodeTexture };
  }

  it('voxelizes a bare lever pick (no properties) without throwing, producing a real voxel grid', async () => {
    const { archive, palette, decodeTexture } = await setup();
    const grid = await buildItemVoxelGrid('lever', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 32);
    let count = 0;
    forEachVoxel(grid, () => count++);
    expect(count).toBeGreaterThan(0);
  });

  it('powered=false and powered=true genuinely differ: the arm\'s highest voxel sits on opposite sides of the block\'s Z center', async () => {
    const { archive, palette, decodeTexture } = await setup();
    const off = await buildItemVoxelGrid('lever', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 32, {
      properties: { face: 'floor', facing: 'north', powered: 'false' },
    });
    const on = await buildItemVoxelGrid('lever', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 32, {
      properties: { face: 'floor', facing: 'north', powered: 'true' },
    });

    function highestVoxelZ(grid: Parameters<typeof forEachVoxel>[0]): number {
      let bestY = -1;
      let z = -1;
      forEachVoxel(grid, (_x, y, vz) => {
        if (y > bestY) {
          bestY = y;
          z = vz;
        }
      });
      return z;
    }

    const half = 16; // 32-resolution grid's own Z center
    expect(highestVoxelZ(off)).toBeGreaterThan(half);
    expect(highestVoxelZ(on)).toBeLessThan(half);
  });

  it('the base mounting nub (element 0) only ever matches real gray stone blocks, never the wrong-material outlier (cyan_terracotta) real cobblestone pixels used to pull in before elementPaletteRestrictions was added', async () => {
    const { leverTemplateFor } = await import('./leverTemplate');
    const { rasterizeItemModel } = await import('./rasterizeModel');
    const { resolveTexturePath, texturePathToKey } = await import('./resolveTextureVariable');
    const { palette, decodeTexture } = await setup();

    const { model, elementPaletteRestrictions } = leverTemplateFor({ face: 'floor', facing: 'north', powered: 'false' });
    const baseOnlyModel = { textures: model.textures, elements: [model.elements[0]] };

    const neededKeys = new Set<string>();
    for (const el of baseOnlyModel.elements) {
      for (const faceDef of Object.values(el.faces)) {
        if (faceDef) neededKeys.add(texturePathToKey(resolveTexturePath(faceDef.texture, baseOnlyModel.textures)));
      }
    }
    const textures = new Map();
    for (const key of neededKeys) {
      const tex = await decodeTexture(key);
      if (tex) textures.set(key, tex);
    }

    const restrictedPalette = new Map([[0, palette.filter((p: { id: string }) => elementPaletteRestrictions![0].includes(p.id))]]);
    const grid = rasterizeItemModel(baseOnlyModel, textures, palette, 32, 16, 16, restrictedPalette);

    const allowed = new Set(elementPaletteRestrictions![0]);
    let checked = 0;
    forEachVoxel(grid, (_x, _y, _z, id) => {
      expect(allowed.has(id)).toBe(true);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('every real face/facing/powered combination voxelizes without throwing, at the resolution the app actually offers', async () => {
    const { archive, palette, decodeTexture } = await setup();
    for (const face of ['floor', 'wall', 'ceiling']) {
      for (const facing of ['north', 'east', 'south', 'west']) {
        for (const powered of ['true', 'false']) {
          const grid = await buildItemVoxelGrid('lever', archive.blockStateFiles, archive.modelFiles, decodeTexture, palette, 16, {
            properties: { face, facing, powered },
          });
          let count = 0;
          forEachVoxel(grid, () => count++);
          expect(count, `${face} ${facing} ${powered}`).toBeGreaterThan(0);
        }
      }
    }
  });
});
