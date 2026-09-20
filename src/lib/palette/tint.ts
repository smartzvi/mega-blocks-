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

// Textures the real models mark `tintindex: 0` and the game colors with the biome GRASS colormap —
// read from the jar's model JSON (every tinted block was enumerated, not guessed). They are stored
// grayscale, so without this the voxelizer matched them to stone/andesite/smooth stone: a
// grass_block top came out gray, ferns and tall grass came out as rock. Uses the same default
// plains grass color (TINT_RGB.grass) Block mode already uses for grass_block.
const GRASS_TINTED_TEXTURES = new Set([
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
]);

// The game gives lily pads one fixed color instead of sampling a biome colormap (0x208030).
const LILY_PAD_RGB: [number, number, number] = [0x20, 0x80, 0x30];

// The three tinted redstone wire textures (`tintindex: 0` in the real redstone_dust_* models). They
// are near-white in the jar (values 217-254) and colored at runtime by the wire's `power`, so
// without a tint they matched white wool/concrete. `redstone_dust_overlay` is fully transparent
// and untinted in the real models, so it is deliberately not listed.
const REDSTONE_WIRE_TEXTURES = new Set(['redstone_dust_dot', 'redstone_dust_line0', 'redstone_dust_line1']);

// Item mode has no real block instance, so no `power`: use the fully powered color, i.e. the
// recognizable bright red, rather than the near-black unpowered one.
const DEFAULT_WIRE_POWER = 15;

function parseWirePower(properties?: Record<string, string>): number {
  const power = Number.parseInt(properties?.power ?? '', 10);
  return Number.isNaN(power) ? DEFAULT_WIRE_POWER : Math.min(15, Math.max(0, power));
}

/**
 * The game's wire color for a given power level (RedStoneWireBlock's per-power color table):
 * red rises from 0.3 (unpowered, dark red) to 1.0, green only appears at high power (0.2 at 15),
 * blue never does. Reproduced from the client's known formula rather than read from the jar,
 * because it lives in compiled code, not an asset.
 */
export function redstoneWireTintRgb(power: number): [number, number, number] {
  const f = Math.min(15, Math.max(0, power)) / 15;
  const r = f * 0.6 + (f > 0 ? 0.4 : 0.3);
  const g = Math.min(1, Math.max(0, f * f * 0.7 - 0.5));
  const b = Math.min(1, Math.max(0, f * f * 0.6 - 0.7));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// Leaf litter is colored by the biome DRY FOLIAGE colormap. Sampled from the jar's own
// `colormap/dry_foliage.png` at the plains coordinates (temperature 0.8, downfall 0.4) — the same
// method reproduces this file's plains grass (#91bd59) and foliage (#77ab2f) constants exactly
// when applied to `colormap/grass.png` / `foliage.png`, which is what validates it.
const DRY_FOLIAGE_RGB: [number, number, number] = [0xa3, 0x75, 0x46];

// Water cauldron water is colored with the biome's `water_color`; plains' is `#3f76e4`, read
// directly from the jar's `data/minecraft/worldgen/biome/plains.json`. `water_still` is only ever
// tinted through the water cauldron model, so tinting the texture key is safe. Lava and powder
// snow cauldrons reuse the same template but the game gives them no tint, and their own textures
// (`lava_still`, `powder_snow`) are not listed here.
const WATER_RGB: [number, number, number] = [0x3f, 0x76, 0xe4];

// Melon/pumpkin stems are recolored per growth stage (`age` 0-7) from bright green to
// yellow-brown, and attached stems use one fixed color. The per-age formula is the game's, from
// compiled code rather than an asset (so, unlike the colormaps above, not checkable against the
// jar): (age*32, 255-age*8, age*4). The fixed attached color, 0xE0C71C, is exactly that formula's
// value at age 7 — an independent cross-check between the two.
const STEM_TEXTURES = new Set(['melon_stem', 'pumpkin_stem']);
const ATTACHED_STEM_TEXTURES = new Set(['attached_melon_stem', 'attached_pumpkin_stem']);
const ATTACHED_STEM_RGB: [number, number, number] = [0xe0, 0xc7, 0x1c];

// Item mode picks a stem with no real instance, and the variant it resolves is age=0 (the first
// key — a short young stem), so its tint is age 0 too, keeping model and color consistent.
const DEFAULT_STEM_AGE = 0;

export function stemTintRgb(age: number): [number, number, number] {
  const a = Math.min(7, Math.max(0, age));
  return [a * 32, 255 - a * 8, a * 4];
}

function parseStemAge(properties?: Record<string, string>): number {
  const age = Number.parseInt(properties?.age ?? '', 10);
  return Number.isNaN(age) ? DEFAULT_STEM_AGE : age;
}

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
export function detectTextureTintRgb(
  textureKey: string,
  properties?: Record<string, string>,
  blockName?: string
): [number, number, number] | null {
  if (REDSTONE_WIRE_TEXTURES.has(textureKey)) return redstoneWireTintRgb(parseWirePower(properties));
  if (GRASS_TINTED_TEXTURES.has(textureKey)) return TINT_RGB.grass;
  if (textureKey === 'lily_pad') return LILY_PAD_RGB;
  if (textureKey === 'leaf_litter') return DRY_FOLIAGE_RGB;
  if (textureKey === 'water_still') return WATER_RGB;
  if (ATTACHED_STEM_TEXTURES.has(textureKey)) return ATTACHED_STEM_RGB;
  // An attached stem's model also reuses the plain stem texture; the block name tells them apart.
  if (STEM_TEXTURES.has(textureKey)) {
    return blockName?.replace(/^minecraft:/, '').startsWith('attached_') ? ATTACHED_STEM_RGB : stemTintRgb(parseStemAge(properties));
  }
  if (UNTINTED_LEAVES.has(textureKey)) return null;
  if (textureKey in LEAF_TINT_OVERRIDES) return LEAF_TINT_OVERRIDES[textureKey];
  if (textureKey.endsWith('_leaves') || textureKey === 'vine') return TINT_RGB.foliage;
  return null;
}
