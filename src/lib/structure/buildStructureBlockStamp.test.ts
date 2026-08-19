import { describe, expect, it } from 'vitest';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';
import { encodeBlockstateKey } from './blockstateKey';
import { buildStructureBlockStamp } from './buildStructureBlockStamp';

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

const noFiles = new Map<string, () => Promise<Uint8Array>>();

describe('buildStructureBlockStamp', () => {
  it('voxelizes an ordinary blockstate-driven block through the real engine, respecting real properties (not the multi-cell fallback)', async () => {
    const key = encodeBlockstateKey('minecraft:oak_door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false' });
    const blockStateFiles = fakeFiles({
      oak_door: {
        variants: {
          'facing=north,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left' },
          'facing=north,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left' },
        },
      },
    });
    const modelFiles = fakeFiles({
      oak_door_top_left: {
        textures: { top: 'minecraft:block/oak_door_top' },
        // A real door panel is thin (3 of 16 units), unlike a full-cube block — this is what
        // proves the real engine's shape ran, not just a flat fallback cube.
        elements: [{ from: [0, 0, 0], to: [3, 16, 16], faces: { north: { texture: '#top' }, south: { texture: '#top' } } }],
      },
    });
    const topTexture = solidTexture(90, 60, 30);
    const decodeTexture = async (k: string) => (k === 'oak_door_top' ? topTexture : null);
    const palette = [fakePaletteEntry('minecraft:door_color', 90, 60, 30)];

    const stamp = await buildStructureBlockStamp(key, blockStateFiles, modelFiles, decodeTexture, palette, 16);

    expect(stamp.sizeX).toBe(16);
    expect(stamp.sizeY).toBe(16);
    expect(stamp.sizeZ).toBe(16);
    const nonNull = stamp.voxels.flat(2).filter((v) => v !== null);
    expect(nonNull.length).toBeGreaterThan(0);
    // Not a uniform solid cube — the door panel only occupies x=0..2 of 16, so the real engine's
    // actual shape must have run (unlike the flat-fallback path, which fills every single cell).
    expect(nonNull.length).toBeLessThan(16 * 16 * 16);
    expect(stamp.voxels[10][8][8]).toBeNull(); // well outside the thin panel's x=0..2 footprint
  });

  it('falls back to a single flat matched color for a hand-authored multi-cell block (bed) — filling the whole stamp solid', async () => {
    const key = 'minecraft:red_bed';
    const bedTexture = solidTexture(160, 40, 40);
    const decodeTexture = async (k: string) => (k === 'bed/red' ? bedTexture : null);
    const palette = [fakePaletteEntry('minecraft:bed_color', 160, 40, 40)];

    const stamp = await buildStructureBlockStamp(key, noFiles, noFiles, decodeTexture, palette, 16);

    expect(stamp.sizeX).toBe(16);
    expect(stamp.sizeY).toBe(16);
    expect(stamp.sizeZ).toBe(16);
    const all = stamp.voxels.flat(2);
    expect(all.every((v) => v === 'minecraft:bed_color')).toBe(true);
  });

  it('falls back to a placeholder-matched solid color when nothing resolves at all, never throwing', async () => {
    const key = 'minecraft:some_unresolvable_block';
    const noDecode = async () => null;
    const palette = [fakePaletteEntry('minecraft:red_ish', 200, 20, 20), fakePaletteEntry('minecraft:white_ish', 230, 230, 230)];

    const stamp = await buildStructureBlockStamp(key, noFiles, noFiles, noDecode, palette, 16);

    const all = stamp.voxels.flat(2);
    expect(all.every((v) => v === all[0] && v !== null)).toBe(true);
  });

  it('throws when the palette is empty, instead of silently matching against nothing', async () => {
    await expect(buildStructureBlockStamp('minecraft:stone', noFiles, noFiles, async () => null, [], 16)).rejects.toThrow(/palette is empty/i);
  });

  it('produces a resolution^3 stamp at a non-16 resolution too', async () => {
    const key = 'minecraft:red_bed';
    const bedTexture = solidTexture(160, 40, 40);
    const decodeTexture = async (k: string) => (k === 'bed/red' ? bedTexture : null);
    const palette = [fakePaletteEntry('minecraft:bed_color', 160, 40, 40)];

    const stamp = await buildStructureBlockStamp(key, noFiles, noFiles, decodeTexture, palette, 32);
    expect(stamp.sizeX).toBe(32);
    expect(stamp.sizeY).toBe(32);
    expect(stamp.sizeZ).toBe(32);
  });
});
