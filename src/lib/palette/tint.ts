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
 * Multiplies a single texture's pixels by an RGB tint color (Minecraft's grass/foliage textures
 * are flat grayscale in the PNG and colored at runtime) — the shared primitive both `applyTint`
 * (whole-block-face-set tinting, for the curated palette and Block mode's source picker) and
 * `detectTextureTintRgb`'s callers (single-texture tinting, for the generic item/structure
 * voxelization pipeline) build on.
 */
export function tintTexture(texture: FaceTexture, rgb: [number, number, number]): FaceTexture {
  const [tr, tg, tb] = rgb;
  const data = new Uint8ClampedArray(texture.data.length);
  for (let i = 0; i < texture.data.length; i += 4) {
    data[i] = (texture.data[i] * tr) / 255;
    data[i + 1] = (texture.data[i + 1] * tg) / 255;
    data[i + 2] = (texture.data[i + 2] * tb) / 255;
    data[i + 3] = texture.data[i + 3];
  }
  return { width: texture.width, height: texture.height, data };
}

/**
 * Applies a tint to every face of a block's texture set. Applied uniformly to all 6 faces for
 * simplicity — for grass_block specifically the real game only tints the top face and a thin
 * rim on the sides, so this is a documented approximation, not exact in-game color.
 */
export function applyTint(textures: BlockTextureSet, tint: TintName): BlockTextureSet {
  const rgb = TINT_RGB[tint];
  const result = {} as BlockTextureSet;
  for (const face of Object.keys(textures) as Array<keyof BlockTextureSet>) {
    result[face] = tintTexture(textures[face], rgb);
  }
  return result;
}

// Real per-species fixed leaf tints — confirmed via the Minecraft Wiki (https://minecraft.wiki/w/Leaves):
// spruce and birch leaves are hardcoded to these exact colors in the game client itself, not
// sampled from the biome foliage colormap like every other tinted leaf type (oak, jungle, acacia,
// dark_oak, mangrove all use the shared `TINT_RGB.foliage` approximation below instead).
const LEAF_TINT_OVERRIDES: Record<string, [number, number, number]> = {
  spruce_leaves: [0x61, 0x99, 0x61],
  birch_leaves: [0x80, 0xa7, 0x55],
};

// Leaf textures whose real jar pixels are already meaningfully colored — confirmed by direct
// pixel sampling of the real 1.21.8 jar: average per-pixel saturation 0.33-0.60 for these four,
// versus 0.00-0.08 for every genuinely-grayscale, needs-a-runtime-tint leaf texture (oak, spruce,
// birch, jungle, acacia, dark_oak, mangrove, pale_oak all land in that near-zero range). Applying
// the vivid foliage green on top of already-baked color would wash out cherry's real pink and
// azalea/flowering_azalea's own real olive-green, so these get no tint at all, same treatment
// `detectTint` already gives cherry_leaves.
const UNTINTED_LEAVES = new Set(['cherry_leaves', 'azalea_leaves', 'flowering_azalea_leaves']);

/**
 * Like `detectTint`, but keyed by a texture file path's bare key (e.g. "birch_leaves") rather
 * than a whole block name, and returning a direct RGB multiplier rather than one of
 * `detectTint`'s two shared named buckets — built for the generic item/structure voxelization
 * pipeline (buildItemVoxelGrid.ts), which decodes textures by file path and needs the real
 * per-species overrides above, not just the one shared 'foliage' approximation every leaf type
 * got before this. `pale_oak_leaves` is deliberately left out of both `LEAF_TINT_OVERRIDES` and
 * `UNTINTED_LEAVES`: its real texture is empirically grayscale (saturation ~0.06, in the same
 * range as the genuinely-tinted species, not the 0.33+ range the untinted ones show) so it still
 * needs *some* runtime tint, but no confirmed fixed hex constant for it was found — it falls
 * through to the shared foliage approximation like oak/jungle/acacia/dark_oak/mangrove, which is
 * closer to correct than leaving it untinted grayscale (the original "looks like stone" bug).
 */
export function detectTextureTintRgb(textureKey: string): [number, number, number] | null {
  if (UNTINTED_LEAVES.has(textureKey)) return null;
  if (textureKey in LEAF_TINT_OVERRIDES) return LEAF_TINT_OVERRIDES[textureKey];
  if (textureKey.endsWith('_leaves') || textureKey === 'vine') return TINT_RGB.foliage;
  return null;
}
