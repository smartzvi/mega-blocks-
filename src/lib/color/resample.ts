import type { FaceTexture } from '../../types/minecraft';

/**
 * Resamples a decoded texture to targetSize x targetSize using nearest-neighbor upsampling
 * (each source pixel becomes a flat block of targetSize/sourceSize output pixels — a 2x2 block
 * per source pixel when going 16x16 -> 32x32).
 *
 * This was originally bilinear (smooth blending between adjacent source pixels), but that
 * blurs exactly the detail that matters in Minecraft's pixel-art textures: thin high-contrast
 * lines and icon edges (e.g. the crafting table's grid lines and axe/pickaxe icons) get
 * smeared into muddy in-between colors that don't correspond to anything in the real texture,
 * which then get matched to visually "off" filler blocks. Nearest-neighbor keeps every edge
 * exactly as crisp as the source — just larger — which is the standard approach for scaling
 * pixel art. A no-op if the texture is already the target size.
 */
export function resampleTexture(texture: FaceTexture, targetSize: number): FaceTexture {
  const { width: sw, height: sh, data: src } = texture;
  if (targetSize === sw && targetSize === sh) return texture;

  const out = new Uint8ClampedArray(targetSize * targetSize * 4);
  const scaleX = sw / targetSize;
  const scaleY = sh / targetSize;

  for (let oy = 0; oy < targetSize; oy++) {
    const sy = Math.min(sh - 1, Math.floor(oy * scaleY));
    for (let ox = 0; ox < targetSize; ox++) {
      const sx = Math.min(sw - 1, Math.floor(ox * scaleX));
      const si = (sy * sw + sx) * 4;
      const oi = (oy * targetSize + ox) * 4;
      out[oi] = src[si];
      out[oi + 1] = src[si + 1];
      out[oi + 2] = src[si + 2];
      out[oi + 3] = src[si + 3];
    }
  }

  return { width: targetSize, height: targetSize, data: out };
}

/**
 * Blends each edge of a texture with its opposite edge (column 0 with the last column, row 0
 * with the last row), so a face's right edge is guaranteed identical to its own left edge —
 * the standard technique for making a texture repeat seamlessly. Needed specifically for block
 * mode's full-cube self-replica builds: placing two mega blocks of the same source block side by
 * side should continue the pattern smoothly, but real vanilla block textures (confirmed directly
 * against cobblestone.png) are only designed to look fine repeating at native 1-block scale —
 * column 0 and the last column can differ by a large amount (measured up to RGB-distance ~119 on
 * cobblestone) that's invisible at 16x16 but reads as an obvious seam once blown up into a giant
 * mega block, per direct user feedback ("the frame interrupts the repeating pattern instead of
 * matching up seamlessly with the neighboring block's pattern"). Column blending runs first, then
 * row blending reads the column-blended result so the 4 corners (affected by both) end up
 * consistent rather than only half-blended. Only the outermost 1-pixel ring changes — the
 * interior pattern and every other color are untouched.
 */
export function makeEdgesTileable(texture: FaceTexture): FaceTexture {
  const { width, height, data } = texture;
  const out = new Uint8ClampedArray(data);

  const blendPixel = (i1: number, i2: number) => {
    for (let c = 0; c < 4; c++) {
      const avg = Math.round((out[i1 + c] + out[i2 + c]) / 2);
      out[i1 + c] = avg;
      out[i2 + c] = avg;
    }
  };

  for (let y = 0; y < height; y++) {
    blendPixel((y * width + 0) * 4, (y * width + (width - 1)) * 4);
  }
  for (let x = 0; x < width; x++) {
    blendPixel((0 * width + x) * 4, ((height - 1) * width + x) * 4);
  }

  return { width, height, data: out };
}
