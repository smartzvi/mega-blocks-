import { describe, expect, it } from 'vitest';
import { applyTint, detectTextureTintRgb, detectTint, redstoneWireTintRgb, tintTexture } from './tint';
import type { BlockTextureSet, FaceTexture } from '../../types/minecraft';

function solidTexture(r: number, g: number, b: number, a = 255): FaceTexture {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width: 4, height: 4, data };
}

describe('tintTexture', () => {
  it('multiplies every pixel by the given RGB tint, leaving alpha untouched', () => {
    const texture = solidTexture(150, 150, 150, 200);
    const result = tintTexture(texture, [0x77, 0xab, 0x2f]);
    expect(result.data[0]).toBeCloseTo((150 * 0x77) / 255, 0);
    expect(result.data[1]).toBeCloseTo((150 * 0xab) / 255, 0);
    expect(result.data[2]).toBeCloseTo((150 * 0x2f) / 255, 0);
    expect(result.data[3]).toBe(200); // alpha untouched
  });

  it('does not mutate the source texture', () => {
    const texture = solidTexture(150, 150, 150);
    tintTexture(texture, [100, 50, 50]);
    expect(texture.data[0]).toBe(150);
  });
});

describe('applyTint', () => {
  it('applies the same tint to every face via tintTexture', () => {
    const grayTex = solidTexture(200, 200, 200);
    const set: BlockTextureSet = { top: grayTex, bottom: grayTex, north: grayTex, south: grayTex, east: grayTex, west: grayTex };
    const result = applyTint(set, 'grass');
    for (const face of Object.values(result)) {
      expect(face.data[0]).toBeLessThan(200); // darkened by the tint multiply
    }
  });
});

describe('redstone wire tint', () => {
  it("reproduces the game's color for each power level: dark red unpowered, bright red at 15, green only at high power, never blue", () => {
    expect(redstoneWireTintRgb(0)).toEqual([77, 0, 0]);
    expect(redstoneWireTintRgb(15)).toEqual([255, 51, 0]);
    expect(redstoneWireTintRgb(8)).toEqual([184, 0, 0]);
    for (let p = 0; p <= 15; p++) expect(redstoneWireTintRgb(p)[2]).toBe(0);
  });

  it('tints the three wire textures by the block\'s real power, and defaults to fully powered with no properties', () => {
    for (const key of ['redstone_dust_dot', 'redstone_dust_line0', 'redstone_dust_line1']) {
      expect(detectTextureTintRgb(key, { power: '0' })).toEqual([77, 0, 0]);
      expect(detectTextureTintRgb(key, { power: '12' })).toEqual(redstoneWireTintRgb(12));
      expect(detectTextureTintRgb(key)).toEqual([255, 51, 0]);
      expect(detectTextureTintRgb(key, { power: 'garbage' })).toEqual([255, 51, 0]);
    }
  });

  it('leaves the transparent overlay texture untinted', () => {
    expect(detectTextureTintRgb('redstone_dust_overlay')).toBeNull();
  });
});

describe('detectTextureTintRgb', () => {
  it('returns the real fixed hardcoded colors for spruce/birch leaves, not the shared foliage approximation — confirmed via minecraft.wiki/w/Leaves', () => {
    expect(detectTextureTintRgb('spruce_leaves')).toEqual([0x61, 0x99, 0x61]);
    expect(detectTextureTintRgb('birch_leaves')).toEqual([0x80, 0xa7, 0x55]);
  });

  it('returns the shared foliage approximation for every other biome-tinted leaf type and vine', () => {
    const foliage = detectTextureTintRgb('oak_leaves');
    expect(foliage).not.toBeNull();
    expect(detectTextureTintRgb('jungle_leaves')).toEqual(foliage);
    expect(detectTextureTintRgb('acacia_leaves')).toEqual(foliage);
    expect(detectTextureTintRgb('dark_oak_leaves')).toEqual(foliage);
    expect(detectTextureTintRgb('mangrove_leaves')).toEqual(foliage);
    expect(detectTextureTintRgb('pale_oak_leaves')).toEqual(foliage); // real texture confirmed grayscale, no confirmed fixed constant found
    expect(detectTextureTintRgb('vine')).toEqual(foliage);
  });

  it('returns null for leaf types whose real texture already has baked-in color — no tint should ever be multiplied on top', () => {
    expect(detectTextureTintRgb('cherry_leaves')).toBeNull();
    expect(detectTextureTintRgb('azalea_leaves')).toBeNull();
    expect(detectTextureTintRgb('flowering_azalea_leaves')).toBeNull();
  });

  it('returns null for anything unrelated to leaves/vine', () => {
    expect(detectTextureTintRgb('oak_planks')).toBeNull();
    expect(detectTextureTintRgb('stone')).toBeNull();
  });
});

// Sanity check that the original block-name-keyed detector (BlockSearch.tsx's source picker,
// buildPalette.ts's curated entries) is untouched by the additions above.
describe('detectTint (unchanged)', () => {
  it('still detects grass_block and generic *_leaves/vine by block name, and still exempts cherry_leaves', () => {
    expect(detectTint('grass_block')).toBe('grass');
    expect(detectTint('oak_leaves')).toBe('foliage');
    expect(detectTint('vine')).toBe('foliage');
    expect(detectTint('cherry_leaves')).toBeNull();
  });
});
