import { describe, expect, it } from 'vitest';
import { buildItemVoxelGrid } from './buildItemVoxelGrid';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';

function fakeFiles(files: Record<string, unknown>) {
  const map = new Map<string, () => Promise<Uint8Array>>();
  for (const [key, json] of Object.entries(files)) {
    map.set(key, async () => new TextEncoder().encode(JSON.stringify(json)));
  }
  return map;
}

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

function fakePaletteEntry(id: string, r: number, g: number, b: number, family: MaterialFamily = 'wood_earth'): PaletteEntry {
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

describe('buildItemVoxelGrid', () => {
  it('resolves a fence-post-like block end-to-end: blockstate -> parent chain -> texture decode -> voxels', async () => {
    const blockStateFiles = fakeFiles({
      oak_fence: {
        multipart: [
          { apply: { model: 'minecraft:block/oak_fence_post' } },
          { when: { north: 'true' }, apply: { model: 'minecraft:block/oak_fence_side' } },
        ],
      },
    });
    const modelFiles = fakeFiles({
      oak_fence_post: { parent: 'minecraft:block/fence_post', textures: { texture: 'minecraft:block/oak_planks' } },
      fence_post: {
        textures: { particle: '#texture' },
        elements: [
          {
            from: [6, 0, 6],
            to: [10, 16, 10],
            faces: {
              up: { uv: [6, 6, 10, 10], texture: '#texture' },
              north: { uv: [6, 0, 10, 16], texture: '#texture' },
              south: { uv: [6, 0, 10, 16], texture: '#texture' },
              east: { uv: [6, 0, 10, 16], texture: '#texture' },
              west: { uv: [6, 0, 10, 16], texture: '#texture' },
            },
          },
        ],
      },
    });
    const plankTexture = solidTexture(180, 140, 90);
    const decodeTexture = async (key: string) => (key === 'oak_planks' ? plankTexture : null);
    const palette = [fakePaletteEntry('minecraft:oak_planks_filler', 180, 140, 90)];

    const grid = await buildItemVoxelGrid('oak_fence', blockStateFiles, modelFiles, decodeTexture, palette, 16);

    const nonNull = grid.voxels.flat(2).filter((v) => v !== null);
    expect(grid.sizeX).toBe(16);
    expect(nonNull.length).toBeGreaterThan(0);
    expect(nonNull.every((id) => id === 'minecraft:oak_planks_filler')).toBe(true);
    // Post footprint is a 4x4 (6..10) column across the full 16-tall height.
    expect(nonNull.length).toBeLessThanOrEqual(4 * 4 * 16);
  });

  it('routes chest to the hand-authored template instead of the blockstate/model resolver', async () => {
    // Empty file maps — chest.json's real blockstate/model would resolve to nothing usable
    // anyway (no elements, no parent), so this also proves the template path never touches them.
    const emptyFiles = fakeFiles({});
    const chestTexture = solidTexture(120, 90, 50);
    const decodeTexture = async (key: string) => (key === 'chest/normal' ? chestTexture : null);
    const palette = [fakePaletteEntry('minecraft:chest_filler', 120, 90, 50)];

    const grid = await buildItemVoxelGrid('chest', emptyFiles, emptyFiles, decodeTexture, palette, 16);
    const nonNull = grid.voxels.flat(2).filter((v) => v !== null);

    expect(nonNull.length).toBeGreaterThan(0);
    expect(nonNull.every((id) => id === 'minecraft:chest_filler')).toBe(true);
  });

  it('routes red_bed to the hand-authored template as a genuinely 2-block-long (sizeZ=32) structure', async () => {
    const emptyFiles = fakeFiles({});
    const bedTexture = solidTexture(160, 40, 40);
    const decodeTexture = async (key: string) => (key === 'bed/red' ? bedTexture : null);
    const palette = [fakePaletteEntry('minecraft:bed_filler', 160, 40, 40)];

    const grid = await buildItemVoxelGrid('red_bed', emptyFiles, emptyFiles, decodeTexture, palette, 16);
    const nonNull = grid.voxels.flat(2).filter((v) => v !== null);

    expect(grid.sizeX).toBe(16);
    expect(grid.sizeY).toBe(16);
    expect(grid.sizeZ).toBe(32); // genuinely 2 blocks long, not a single squashed block
    expect(nonNull.length).toBeGreaterThan(0);
  });

  it('builds a real 2-block-tall door end-to-end: blockstate half=lower/upper -> parent chains -> distinct textures per half', async () => {
    const blockStateFiles = fakeFiles({
      oak_door: {
        variants: {
          'facing=north,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left' },
          'facing=north,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left' },
        },
      },
    });
    const modelFiles = fakeFiles({
      oak_door_bottom_left: {
        parent: 'minecraft:block/door_bottom_left',
        textures: { bottom: 'minecraft:block/oak_door_bottom', top: 'minecraft:block/oak_door_top' },
      },
      oak_door_top_left: {
        parent: 'minecraft:block/door_top_left',
        textures: { bottom: 'minecraft:block/oak_door_bottom', top: 'minecraft:block/oak_door_top' },
      },
      door_bottom_left: {
        textures: { particle: '#bottom' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#bottom' }, down: { texture: '#bottom' } } }],
      },
      door_top_left: {
        textures: { particle: '#top' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#top' }, down: { texture: '#top' } } }],
      },
    });
    const bottomTexture = solidTexture(90, 60, 30); // dark wood-grain panel
    const topTexture = solidTexture(150, 190, 220); // lighter "window" panel
    const decodeTexture = async (key: string) => {
      if (key === 'oak_door_bottom') return bottomTexture;
      if (key === 'oak_door_top') return topTexture;
      return null;
    };
    const palette = [
      fakePaletteEntry('minecraft:door_bottom_color', 90, 60, 30),
      fakePaletteEntry('minecraft:door_top_color', 150, 190, 220),
    ];

    const grid = await buildItemVoxelGrid('oak_door', blockStateFiles, modelFiles, decodeTexture, palette, 16);

    expect(grid.sizeX).toBe(16);
    expect(grid.sizeY).toBe(32); // genuinely 2 blocks tall, not a single squashed block
    expect(grid.sizeZ).toBe(16);
    expect(grid.voxels[8][0][8]).toBe('minecraft:door_bottom_color'); // bottom of the lower half
    expect(grid.voxels[8][31][8]).toBe('minecraft:door_top_color'); // top of the upper half
  });

  it('routes beacon to the hand-authored hollow-shell template, restricting its crystal to the curated white-to-light-blue set', async () => {
    const emptyFiles = fakeFiles({});
    const glassTexture = solidTexture(210, 230, 230);
    const obsidianTexture = solidTexture(20, 18, 28);
    const crystalTexture = solidTexture(100, 220, 200);
    const decodeTexture = async (key: string) => {
      if (key === 'glass') return glassTexture;
      if (key === 'obsidian') return obsidianTexture;
      if (key === 'beacon') return crystalTexture;
      return null;
    };
    const glass: PaletteEntry = { ...fakePaletteEntry('minecraft:glass', 210, 230, 230, 'stone_deepslate'), glassOnly: true };
    const obsidianFiller = fakePaletteEntry('minecraft:obsidian_filler', 20, 18, 28);
    // Closer raw color match than the curated pick below, but not in BEACON_CRYSTAL_PALETTE's
    // allow-list — must lose anyway. Also flagged lightSource, proving the restriction is now a
    // specific id allow-list, not "any light source" (a froglight would have won this one).
    const closeButNotListed: PaletteEntry = {
      ...fakePaletteEntry('minecraft:close_but_not_listed', 100, 220, 200),
      lightSource: true,
    };
    const curatedPick: PaletteEntry = { ...fakePaletteEntry('minecraft:sea_lantern', 60, 180, 160), lightSource: true };
    const palette = [glass, obsidianFiller, closeButNotListed, curatedPick];

    const grid = await buildItemVoxelGrid('beacon', emptyFiles, emptyFiles, decodeTexture, palette, 16);
    const idsUsed = new Set(grid.voxels.flat(2).filter((v): v is string => v !== null));

    expect(idsUsed.has('minecraft:sea_lantern')).toBe(true); // crystal used the curated allow-listed id
    expect(idsUsed.has('minecraft:close_but_not_listed')).toBe(false); // never an unlisted id, even if closer/lightSource
    expect(idsUsed.has('minecraft:glass')).toBe(true); // shell is real glass
    expect(grid.sizeX).toBe(16); // single-block item, not a multi-cell shape
  });

  it('throws when no referenced texture could be decoded at all', async () => {
    const blockStateFiles = fakeFiles({ x: { variants: { '': { model: 'minecraft:block/x' } } } });
    const modelFiles = fakeFiles({
      x: { textures: { t: 'block/nonexistent' }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#t' } } }] },
    });
    const decodeTexture = async () => null;
    await expect(buildItemVoxelGrid('x', blockStateFiles, modelFiles, decodeTexture, [], 16)).rejects.toThrow(/couldn't decode/i);
  });
});
