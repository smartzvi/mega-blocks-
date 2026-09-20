import { describe, expect, it } from 'vitest';
import { applyTint, detectTextureTintRgb, detectTint, redstoneWireTintRgb, stemTintRgb, tintTexture } from './tint';
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

describe('grass tint', () => {
  it('applies the default grass tint to every grass-colormap texture the real models tint', () => {
    const grass = [0x91, 0xbd, 0x59];
    for (const key of [
      'grass_block_top',
      'grass_block_side_overlay',
      'short_grass',
      'tall_grass_top',
      'tall_grass_bottom',
      'fern',
      'large_fern_top',
      'large_fern_bottom',
      'sugar_cane',
      'bush',
      'pink_petals_stem',
      'wildflowers_stem',
    ]) {
      expect(detectTextureTintRgb(key)).toEqual(grass);
    }
  });

  it('matches the tint Block mode already applies to grass_block, so both modes agree', () => {
    const grass = detectTextureTintRgb('grass_block_top')!;
    const blockMode = applyTint({ top: solidTexture(255, 255, 255) } as BlockTextureSet, 'grass').top;
    expect([blockMode.data[0], blockMode.data[1], blockMode.data[2]]).toEqual(grass);
  });

  it('gives lily pads the game\'s fixed color, not the grass colormap', () => {
    expect(detectTextureTintRgb('lily_pad')).toEqual([0x20, 0x80, 0x30]);
  });

  it('does not tint the plain dirt side of grass_block or unrelated blocks', () => {
    expect(detectTextureTintRgb('grass_block_side')).toBeNull();
    expect(detectTextureTintRgb('dirt')).toBeNull();
    expect(detectTextureTintRgb('grass_block_snow')).toBeNull();
  });
});

describe('stem, leaf litter and water cauldron tints', () => {
  it("colors stems per growth age from bright green to yellow-brown, using the game's formula", () => {
    expect(stemTintRgb(0)).toEqual([0, 255, 0]);
    expect(stemTintRgb(3)).toEqual([96, 231, 12]);
    expect(stemTintRgb(7)).toEqual([224, 199, 28]);
    expect(stemTintRgb(99)).toEqual(stemTintRgb(7)); // clamps
  });

  it("the attached-stem constant equals the formula's age-7 value (an independent cross-check)", () => {
    expect(detectTextureTintRgb('attached_melon_stem')).toEqual(stemTintRgb(7));
    expect(detectTextureTintRgb('attached_pumpkin_stem')).toEqual([0xe0, 0xc7, 0x1c]);
  });

  it("tints melon/pumpkin stem textures by the block's real age, defaulting to age 0 (the model item mode resolves)", () => {
    expect(detectTextureTintRgb('melon_stem', { age: '5' })).toEqual(stemTintRgb(5));
    expect(detectTextureTintRgb('pumpkin_stem', { age: '7' })).toEqual(stemTintRgb(7));
    expect(detectTextureTintRgb('melon_stem')).toEqual([0, 255, 0]);
    expect(detectTextureTintRgb('melon_stem', { age: 'x' })).toEqual([0, 255, 0]);
  });

  it('an attached stem block uses the fixed color even for the plain stem texture its model reuses', () => {
    expect(detectTextureTintRgb('melon_stem', undefined, 'attached_melon_stem')).toEqual([0xe0, 0xc7, 0x1c]);
    expect(detectTextureTintRgb('pumpkin_stem', { age: '2' }, 'minecraft:attached_pumpkin_stem')).toEqual([0xe0, 0xc7, 0x1c]);
    expect(detectTextureTintRgb('melon_stem', { age: '2' }, 'melon_stem')).toEqual(stemTintRgb(2));
  });

  it("tints leaf litter with plains dry foliage and cauldron water with plains' water color, both read from the jar", () => {
    expect(detectTextureTintRgb('leaf_litter')).toEqual([0xa3, 0x75, 0x46]);
    expect(detectTextureTintRgb('water_still')).toEqual([0x3f, 0x76, 0xe4]);
  });

  it('leaves lava and powder snow (which the game does not tint in a cauldron) alone', () => {
    expect(detectTextureTintRgb('lava_still')).toBeNull();
    expect(detectTextureTintRgb('powder_snow')).toBeNull();
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
