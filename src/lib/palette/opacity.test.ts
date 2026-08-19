import { describe, expect, it } from 'vitest';
import { isFullyOpaque } from './opacity';
import type { BlockTextureSet, FaceTexture } from '../../types/minecraft';

function opaqueTexture(): FaceTexture {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 100;
    data[i + 1] = 100;
    data[i + 2] = 100;
    data[i + 3] = 255;
  }
  return { width: 16, height: 16, data };
}

function spriteTexture(): FaceTexture {
  // Mostly transparent with a small opaque patch, like torch.png.
  const data = new Uint8ClampedArray(16 * 16 * 4); // all zero -> alpha 0 everywhere
  const i = (8 * 16 + 8) * 4;
  data[i] = 200;
  data[i + 1] = 150;
  data[i + 2] = 50;
  data[i + 3] = 255;
  return { width: 16, height: 16, data };
}

function textureSet(overrides: Partial<BlockTextureSet> = {}): BlockTextureSet {
  const base = opaqueTexture();
  return { top: base, bottom: base, north: base, south: base, east: base, west: base, ...overrides };
}

describe('isFullyOpaque', () => {
  it('is true when every face has alpha=255 everywhere', () => {
    expect(isFullyOpaque(textureSet())).toBe(true);
  });

  it('is false when any single pixel on any face is transparent', () => {
    const set = textureSet({ top: spriteTexture() });
    expect(isFullyOpaque(set)).toBe(false);
  });

  it('is false for a fully sprite-style block (torch-like: mostly transparent)', () => {
    const sprite = spriteTexture();
    const set: BlockTextureSet = { top: sprite, bottom: sprite, north: sprite, south: sprite, east: sprite, west: sprite };
    expect(isFullyOpaque(set)).toBe(false);
  });
});
