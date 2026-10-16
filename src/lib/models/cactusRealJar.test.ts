import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { reshapeCactus } from './resolveItemModel';
import { getVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';
import type { BlockModelElement } from '../../types/item';

const face = { uv: [0, 0, 16, 16] as [number, number, number, number], texture: '#top' };

describe('reshapeCactus', () => {
  const box: BlockModelElement = { from: [0, 0, 0], to: [16, 16, 16], faces: { top: face, bottom: face } };
  const northSouth: BlockModelElement = { from: [0, 0, 1], to: [16, 16, 15], faces: { north: face, south: face } };
  const westEast: BlockModelElement = { from: [1, 0, 0], to: [15, 16, 16], faces: { west: face, east: face } };

  it('turns the faces-only full box into a one-unit top cap and bottom cap', () => {
    const [top, bottom] = reshapeCactus([box]);
    expect(top).toMatchObject({ from: [0, 15, 0], to: [16, 16, 16] });
    expect(Object.keys(top.faces)).toEqual(['top']);
    expect(bottom).toMatchObject({ from: [0, 0, 0], to: [16, 1, 16] });
    expect(Object.keys(bottom.faces)).toEqual(['bottom']);
  });

  it('splits each side plate into one one-unit slab per face, standing where that face is', () => {
    const [north, south] = reshapeCactus([northSouth]);
    expect(north).toMatchObject({ from: [0, 0, 1], to: [16, 16, 2] });
    expect(Object.keys(north.faces)).toEqual(['north']);
    expect(south).toMatchObject({ from: [0, 0, 14], to: [16, 16, 15] });
    expect(Object.keys(south.faces)).toEqual(['south']);

    const [west, east] = reshapeCactus([westEast]);
    expect(west).toMatchObject({ from: [1, 0, 0], to: [2, 16, 16] });
    expect(east).toMatchObject({ from: [14, 0, 0], to: [15, 16, 16] });
  });

  it('keeps a full box that has side faces (a normal cube) and any other element as it is', () => {
    const cube: BlockModelElement = { from: [0, 0, 0], to: [16, 16, 16], faces: { top: face, north: face } };
    const other: BlockModelElement = { from: [2, 0, 2], to: [14, 8, 14], faces: { top: face, north: face, south: face } };
    expect(reshapeCactus([cube, other])).toEqual([cube, other]);
  });
});

/** The cactus used to voxelize as a stack of thin rings: its full-cube box buried both side plates,
 *  so only a few rows of spine pixels survived. */
describe.skipIf(!hasRealJar())(`cactus (real jar: ${REAL_JAR_PATH})`, () => {
  it('is a solid-walled cactus: caps on top and bottom, walls on all four sides the whole way up', async () => {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decode = async (k: string) => (await loadAndDecodeTexture(k, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(k, archive.entityTextureFiles);
    const grid = await buildItemVoxelGrid('cactus', archive.blockStateFiles, archive.modelFiles, decode, palette, 16, {});

    // The real top/bottom textures have a transparent one-pixel border, so the caps are 14x14.
    for (const y of [0, 15]) for (let x = 1; x < 15; x++) for (let z = 1; z < 15; z++) expect(getVoxel(grid, x, y, z), `cap y=${y} (${x},${z})`).not.toBeNull();

    // Every row of the body has its four walls, not only the spine rows.
    for (let y = 0; y < 16; y++) {
      for (let i = 2; i < 14; i++) {
        expect(getVoxel(grid, i, y, 1), `north wall y=${y}`).not.toBeNull();
        expect(getVoxel(grid, i, y, 14), `south wall y=${y}`).not.toBeNull();
        expect(getVoxel(grid, 1, y, i), `west wall y=${y}`).not.toBeNull();
        expect(getVoxel(grid, 14, y, i), `east wall y=${y}`).not.toBeNull();
      }
    }
    // Mostly green: the pale spine colour is a minority.
    let spines = 0;
    grid.voxels.forEach((id) => {
      if (id === 'minecraft:sandstone') spines++;
    });
    expect(spines).toBeLessThan(grid.voxels.size * 0.3);
  }, 60000);
});
