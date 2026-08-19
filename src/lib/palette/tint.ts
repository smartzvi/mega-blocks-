import type { BlockTextureSet, FaceTexture, TintName } from '../../types/minecraft';

// Fixed default (plains-biome) tint constants. Real Minecraft samples a biome colormap;
// these are reasonable plains-biome approximations, not exact per-biome values.
const TINT_RGB: Record<TintName, [number, number, number]> = {
  grass: [0x91, 0xbd, 0x59],
  foliage: [0x77, 0xab, 0x2f],
};

/**
 * Best-effort tint detection from a texture base name, used both for curated palette entries
 * and for whatever block the user searches for (so a tinted block used as a *source* texture
 * is read consistently with how its own kind would be tinted as a palette candidate).
 * cherry_leaves is a deliberate exception — it has a fixed pink color baked into the PNG itself,
 * unlike every other leaf type which is tinted via the foliage colormap.
 */
export function detectTint(textureBase: string): TintName | null {
  if (textureBase === 'grass_block') return 'grass';
  if (textureBase === 'cherry_leaves') return null;
  if (textureBase.endsWith('_leaves') || textureBase === 'vine') return 'foliage';
  return null;
}

/**
 * Multiplies every face's pixels by the tint color (Minecraft's grass/foliage textures are
 * flat grayscale in the PNG and colored at runtime). Applied uniformly to all 6 faces for
 * simplicity — for grass_block specifically the real game only tints the top face and a thin
 * rim on the sides, so this is a documented approximation, not exact in-game color.
 */
export function applyTint(textures: BlockTextureSet, tint: TintName): BlockTextureSet {
  const [tr, tg, tb] = TINT_RGB[tint];
  const result = {} as BlockTextureSet;

  for (const face of Object.keys(textures) as Array<keyof BlockTextureSet>) {
    const src = textures[face];
    const data = new Uint8ClampedArray(src.data.length);
    for (let i = 0; i < src.data.length; i += 4) {
      data[i] = (src.data[i] * tr) / 255;
      data[i + 1] = (src.data[i + 1] * tg) / 255;
      data[i + 2] = (src.data[i + 2] * tb) / 255;
      data[i + 3] = src.data[i + 3];
    }
    result[face] = { width: src.width, height: src.height, data } as FaceTexture;
  }

  return result;
}
