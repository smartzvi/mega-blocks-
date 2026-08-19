import { describe, expect, it } from 'vitest';
import { matchAllFaces, matchFace } from './matchFace';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import { FACE_NAMES } from '../../types/minecraft';
import type { BlockTextureSet, FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';

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

function fakePaletteEntry(
  id: string,
  r: number,
  g: number,
  b: number,
  family: MaterialFamily = 'stone_deepslate',
  flags?: Pick<PaletteEntry, 'gravityAffected' | 'endGrainTopBottom'>
): PaletteEntry {
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
    ...flags,
  };
}

// All fixtures below (deltaE / hue distance / saturation figures quoted in comments) were
// computed with an independent reference implementation of sRGB->Lab and RGB->HSV, not
// guessed — see the conversation this file originated from. This matters because CIE76
// distance and hue angle don't move intuitively; several "obviously right" hand-picked
// examples turned out to have the wrong ordering when actually computed.

describe('matchFace', () => {
  it('picks the palette entry whose color is closest to each pixel', () => {
    const palette = [
      fakePaletteEntry('minecraft:white_wool', 255, 255, 255, 'neutrals_concrete'),
      fakePaletteEntry('minecraft:black_wool', 0, 0, 0, 'neutrals_concrete'),
      fakePaletteEntry('minecraft:red_wool', 220, 20, 20, 'neutrals_concrete'),
    ];

    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let v = 0; v < 16; v++) {
      for (let u = 0; u < 16; u++) {
        const i = (v * 16 + u) * 4;
        const isLeft = u < 8;
        data[i] = data[i + 1] = data[i + 2] = isLeft ? 255 : 0;
        data[i + 3] = 255;
      }
    }
    const texture: FaceTexture = { width: 16, height: 16, data };

    const grid = matchFace(texture, 'south', palette);
    expect(grid[0][0]).toBe('minecraft:white_wool');
    expect(grid[0][15]).toBe('minecraft:black_wool');
    expect(grid[15][0]).toBe('minecraft:white_wool');
    expect(grid[15][15]).toBe('minecraft:black_wool');
  });

  it('throws on an empty palette', () => {
    const texture = solidTexture(1, 2, 3);
    expect(() => matchFace(texture, 'north', [])).toThrow();
  });

  it('hue guard: rejects a far-hue candidate even though it is closer in raw Lab distance', () => {
    // pixel (200,120,30): 'near' has deltaE 75.21, hueDist 5.1°; 'far' has deltaE 59.56,
    // hueDist 75.4°. Without the guard, 'far' wins on raw distance alone — the exact bug
    // pattern reported (an off-hue candidate edging out a same-hue one). With the guard,
    // 'far' gets the severe-mismatch penalty and 'near' wins instead.
    const palette = [
      fakePaletteEntry('minecraft:near_same_hue', 30, 15, 3, 'wood_earth'),
      fakePaletteEntry('minecraft:far_off_hue', 114, 147, 105, 'stone_deepslate'),
    ];
    const texture = solidTexture(200, 120, 30);
    const grid = matchFace(texture, 'south', palette);
    expect(grid[0][0]).toBe('minecraft:near_same_hue');
  });

  it('family affinity: a muted pixel prefers an earthy candidate over a closer-but-vivid neutrals_concrete one', () => {
    // pixel (150,120,90), sat 0.40 (< 0.5 natural cutoff, so prefersNatural=true).
    // 'vivid' (151,120,90) is deltaE 0.47 from the pixel — nearly a perfect color match — but
    // is tagged neutrals_concrete and is itself chromatic (sat 0.40), so it eats the severe
    // mismatch penalty. 'earthy' (110,80,55) is deltaE 16.12 — a much worse raw match — but
    // wins anyway once the penalty pushes 'vivid' to an effective score over 50.
    const earthy = fakePaletteEntry('minecraft:earthy_imperfect', 110, 80, 55, 'wood_earth');
    const vivid = fakePaletteEntry('minecraft:vivid_near_exact', 151, 120, 90, 'neutrals_concrete');
    const palette = [earthy, vivid];
    const texture = solidTexture(150, 120, 90);
    const grid = matchFace(texture, 'south', palette);
    expect(grid[0][0]).toBe('minecraft:earthy_imperfect');
  });

  it('does not penalize a near-neutral neutrals_concrete entry just for its family tag', () => {
    // pixel (160,130,100), sat 0.375 (prefersNatural=true). 'grayWool' (148,140,126) is
    // non-chromatic (sat < 0.15) so it's exempt from the family penalty despite being tagged
    // neutrals_concrete, and is the closer raw match (deltaE 13.93). 'farOff' (197,166,158) is
    // chromatic but a worse raw match (deltaE 18.93) — within 50 of grayWool's distance, so if
    // the exemption were missing (grayWool wrongly penalized +50), farOff would win instead.
    // grayWool winning here demonstrates the exemption is actually load-bearing.
    const grayWool = fakePaletteEntry('minecraft:light_gray_wool', 148, 140, 126, 'neutrals_concrete');
    const farOff = fakePaletteEntry('minecraft:chromatic_alternative', 197, 166, 158, 'wood_earth');
    const palette = [grayWool, farOff];
    const texture = solidTexture(160, 130, 100);
    const grid = matchFace(texture, 'south', palette);
    expect(grid[0][0]).toBe('minecraft:light_gray_wool');
  });

  it('lets a genuinely vivid pixel match a vivid neutrals_concrete candidate without penalty', () => {
    // pixel sat 0.9 (well above the 0.5 natural cutoff) — the family penalty never applies,
    // so the exact-color-match candidate wins normally.
    const green = fakePaletteEntry('minecraft:lime_wool', 20, 200, 20, 'neutrals_concrete');
    const brownDecoy = fakePaletteEntry('minecraft:brown_decoy', 120, 90, 60, 'wood_earth');
    const palette = [green, brownDecoy];
    const texture = solidTexture(20, 200, 20);
    const grid = matchFace(texture, 'south', palette);
    expect(grid[0][0]).toBe('minecraft:lime_wool');
  });
});

describe('matchAllFaces', () => {
  it('produces a grid at the requested resolution for every face, upsampling the native 16x16 source', () => {
    const source = solidTexture(150, 120, 90);
    const sourceTextures = Object.fromEntries(FACE_NAMES.map((f) => [f, source])) as BlockTextureSet;
    const palette = [fakePaletteEntry('minecraft:filler', 150, 120, 90, 'wood_earth')];

    const at16 = matchAllFaces(sourceTextures, palette, 16);
    for (const face of FACE_NAMES) {
      expect(at16[face]).toHaveLength(16);
      expect(at16[face][0]).toHaveLength(16);
    }

    const at32 = matchAllFaces(sourceTextures, palette, 32);
    for (const face of FACE_NAMES) {
      expect(at32[face]).toHaveLength(32);
      expect(at32[face][0]).toHaveLength(32);
      // A single-entry palette means every cell must resolve to that entry regardless of size.
      expect(at32[face].flat().every((id) => id === 'minecraft:filler')).toBe(true);
    }

    const at64 = matchAllFaces(sourceTextures, palette, 64);
    for (const face of FACE_NAMES) {
      expect(at64[face]).toHaveLength(64);
      expect(at64[face][0]).toHaveLength(64);
      expect(at64[face].flat().every((id) => id === 'minecraft:filler')).toBe(true);
    }
  });

  it('excludes a gravity-affected entry (sand) from the top face only — the shell\'s top always sits over a hollow interior, but the bottom and the 4 walls are fine', () => {
    const source = solidTexture(230, 210, 160); // sand-ish tan
    const sourceTextures = Object.fromEntries(FACE_NAMES.map((f) => [f, source])) as BlockTextureSet;
    // A worse-but-safe color match must still lose to sand everywhere sand is eligible, and win
    // only on top — proves this is a hard exclusion, not just a scoring nudge.
    const palette = [
      fakePaletteEntry('minecraft:sand', 230, 210, 160, 'sand_clay', { gravityAffected: true }),
      fakePaletteEntry('minecraft:sandstone', 210, 190, 140, 'sand_clay'),
    ];
    const matched = matchAllFaces(sourceTextures, palette, 16);
    expect(matched.top.flat().every((id) => id === 'minecraft:sandstone')).toBe(true);
    for (const face of ['bottom', 'north', 'south', 'east', 'west'] as const) {
      expect(matched[face].flat().every((id) => id === 'minecraft:sand')).toBe(true);
    }
  });

  it('excludes an end-grain entry (log) from both top and bottom faces, but keeps it everywhere else', () => {
    const source = solidTexture(120, 90, 60); // wood-brown
    const sourceTextures = Object.fromEntries(FACE_NAMES.map((f) => [f, source])) as BlockTextureSet;
    const palette = [
      fakePaletteEntry('minecraft:oak_log', 120, 90, 60, 'wood_earth', { endGrainTopBottom: true }),
      fakePaletteEntry('minecraft:oak_planks', 100, 70, 40, 'wood_earth'),
    ];
    const matched = matchAllFaces(sourceTextures, palette, 16);
    expect(matched.top.flat().every((id) => id === 'minecraft:oak_planks')).toBe(true);
    expect(matched.bottom.flat().every((id) => id === 'minecraft:oak_planks')).toBe(true);
    for (const face of ['north', 'south', 'east', 'west'] as const) {
      expect(matched[face].flat().every((id) => id === 'minecraft:oak_log')).toBe(true);
    }
  });

  it('falls back to the unfiltered palette for a face rather than failing when every candidate is excluded from it', () => {
    const source = solidTexture(230, 210, 160);
    const sourceTextures = Object.fromEntries(FACE_NAMES.map((f) => [f, source])) as BlockTextureSet;
    const palette = [fakePaletteEntry('minecraft:sand', 230, 210, 160, 'sand_clay', { gravityAffected: true })];
    const matched = matchAllFaces(sourceTextures, palette, 16);
    expect(matched.top.flat().every((id) => id === 'minecraft:sand')).toBe(true);
  });
});
