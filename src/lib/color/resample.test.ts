import { describe, expect, it } from 'vitest';
import { makeEdgesTileable, resampleTexture } from './resample';
import type { FaceTexture } from '../../types/minecraft';

function pixel(data: Uint8ClampedArray, size: number, x: number, y: number): [number, number, number, number] {
  const i = (y * size + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe('resampleTexture', () => {
  it('is a no-op when the target size matches the source size', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(123);
    const texture: FaceTexture = { width: 16, height: 16, data };
    const result = resampleTexture(texture, 16);
    expect(result).toBe(texture); // same reference, not just equal content
  });

  it('reproduces a flat solid color exactly when upsampled', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 200;
      data[i + 1] = 100;
      data[i + 2] = 50;
      data[i + 3] = 255;
    }
    const texture: FaceTexture = { width: 16, height: 16, data };
    const result = resampleTexture(texture, 32);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
    for (let y = 0; y < 32; y += 5) {
      for (let x = 0; x < 32; x += 5) {
        expect(pixel(result.data, 32, x, y)).toEqual([200, 100, 50, 255]);
      }
    }
  });

  it('replicates each source pixel as an exact NxN block with a hard boundary, no blending', () => {
    // Left half of the 16x16 source is black, right half is white.
    const size = 16;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const v = x < size / 2 ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const texture: FaceTexture = { width: size, height: size, data };
    const result = resampleTexture(texture, 32);

    // Source pixel (7, y) -> black -> output columns 14,15. Source pixel (8, y) -> white ->
    // output columns 16,17. The boundary must be a hard jump, not an intermediate gray —
    // this is what distinguishes nearest-neighbor replication from bilinear blending, and is
    // exactly what keeps thin high-contrast texture details (icon edges, grid lines) crisp
    // instead of smearing them into colors that don't exist in the source.
    expect(pixel(result.data, 32, 15, 16)[0]).toBe(0);
    expect(pixel(result.data, 32, 16, 16)[0]).toBe(255);
  });

  it('maps a 2x2 output block to exactly one source pixel when scaling 16->32', () => {
    const size = 16;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        // Encode each source pixel's own coordinates into its color so we can trace exactly
        // which source pixel each output block came from.
        data[i] = x * 10;
        data[i + 1] = y * 10;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const texture: FaceTexture = { width: size, height: size, data };
    const result = resampleTexture(texture, 32);

    // Source pixel (3,5) should become the exact 2x2 block at output (6..7, 10..11).
    const expected = [30, 50, 0, 255];
    expect(pixel(result.data, 32, 6, 10)).toEqual(expected);
    expect(pixel(result.data, 32, 7, 10)).toEqual(expected);
    expect(pixel(result.data, 32, 6, 11)).toEqual(expected);
    expect(pixel(result.data, 32, 7, 11)).toEqual(expected);
  });

  it('produces a grid of the requested target size regardless of source size', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4).fill(50);
    const texture: FaceTexture = { width: 16, height: 16, data };
    const result = resampleTexture(texture, 32);
    expect(result.data.length).toBe(32 * 32 * 4);
  });

  it('maps a 4x4 output block to exactly one source pixel when scaling 16->64', () => {
    const size = 16;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = x * 10;
        data[i + 1] = y * 10;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const texture: FaceTexture = { width: size, height: size, data };
    const result = resampleTexture(texture, 64);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);

    // Source pixel (3,5) should become the exact 4x4 block at output (12..15, 20..23).
    const expected = [30, 50, 0, 255];
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        expect(pixel(result.data, 64, 12 + dx, 20 + dy)).toEqual(expected);
      }
    }
  });
});

describe('makeEdgesTileable', () => {
  it('makes the left and right edges identical — regression test for real user feedback that two mega blocks of the same source placed side by side broke the repeating pattern instead of flowing together, traced to real vanilla textures (confirmed directly on cobblestone.png) not being designed to tile at pixel precision, only to look fine at native 1-block scale', () => {
    const size = 8;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = x * 30; // left column (x=0) far from right column (x=7) in raw color
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 255;
      }
    }
    const texture: FaceTexture = { width: size, height: size, data };
    const result = makeEdgesTileable(texture);
    for (let y = 0; y < size; y++) {
      const left = pixel(result.data, size, 0, y);
      const right = pixel(result.data, size, size - 1, y);
      expect(left).toEqual(right); // identical, so a copy placed to the right continues seamlessly
    }
  });

  it('makes the top and bottom edges identical too, and the blended value is the real average of the original two edges (not an arbitrary pick of one side)', () => {
    const size = 8;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = y * 30;
        data[i + 3] = 255;
      }
    }
    const texture: FaceTexture = { width: size, height: size, data };
    const result = makeEdgesTileable(texture);
    for (let x = 0; x < size; x++) {
      const top = pixel(result.data, size, x, 0);
      const bottom = pixel(result.data, size, x, size - 1);
      expect(top).toEqual(bottom);
      expect(top[0]).toBe(Math.round((0 + (size - 1) * 30) / 2)); // real average of the original top/bottom values
    }
  });

  it('leaves interior pixels completely untouched — only the outermost 1-pixel ring changes, per explicit user request not to touch the colors/pattern otherwise', () => {
    const size = 8;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 10;
      data[i + 1] = 20;
      data[i + 2] = 30;
      data[i + 3] = 255;
    }
    // Make every edge pixel distinctly different from the flat interior fill, so any leak would show.
    for (let x = 0; x < size; x++) {
      const iTop = x * 4;
      const iBottom = ((size - 1) * size + x) * 4;
      data[iTop] = data[iBottom] = 200;
      const iLeft = (x * size) * 4;
      const iRight = (x * size + (size - 1)) * 4;
      data[iLeft] = data[iRight] = 200;
    }
    const texture: FaceTexture = { width: size, height: size, data };
    const result = makeEdgesTileable(texture);
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        expect(pixel(result.data, size, x, y)).toEqual([10, 20, 30, 255]);
      }
    }
  });

  it('does not mutate the input texture — callers keep their own original untouched', () => {
    const size = 4;
    const data = new Uint8ClampedArray(size * size * 4).fill(100);
    const texture: FaceTexture = { width: size, height: size, data };
    makeEdgesTileable(texture);
    expect(texture.data).toEqual(new Uint8ClampedArray(size * size * 4).fill(100));
  });
});
