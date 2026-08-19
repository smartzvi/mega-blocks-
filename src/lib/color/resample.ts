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
