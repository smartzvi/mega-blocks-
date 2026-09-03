import type { FaceTexture, PaletteEntry, VoxelGrid } from '../../types/minecraft';
import { resolveItemModel } from './resolveItemModel';
import { rasterizeItemModel } from './rasterizeModel';
import { resolveTexturePath, texturePathToKey } from './resolveTextureVariable';
import { HAND_AUTHORED_TEMPLATES } from './handAuthoredTemplates';
import { filterPaletteForSource } from '../palette/glassSource';
import { filterLightSourcesForSource } from '../palette/lightSourceExclusion';
import { filterPaletteForLeafSource } from '../palette/leafSource';
import { filterPaletteForOreSource } from '../palette/oreSource';
import { filterPaletteForPlanksSource } from '../palette/woodPlanksSource';
import { detectTextureTintRgb, tintTexture } from '../palette/tint';

type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;
export type TextureDecoder = (key: string) => Promise<FaceTexture | null>;

/** Thrown when `rejectMultiCell` is set and the resolved model genuinely spans more than one
 *  block (a real door's half=lower/upper stacking, a hand-authored bed's 2-block length) — see
 *  the `rejectMultiCell` option below for why structure mode needs this distinguishable from
 *  every other failure mode. */
export class MultiCellBlockError extends Error {}

/**
 * The full item pipeline: resolve the block's model, work out every real texture key its faces
 * need, decode them (via the injected `decodeTexture` so this stays unit-testable without a
 * browser — the real caller passes a function that tries lib/zip/decodeTexture.ts's
 * loadAndDecodeTexture against both the archive's blockTextureFiles and entityTextureFiles), then
 * rasterize. A texture that fails to resolve or decode is simply left out of the map;
 * rasterizeItemModel already degrades gracefully (falls back to another face) rather than
 * treating a single bad reference as fatal for the whole model.
 *
 * Chest/shulker-box/bed/sign-family names are checked against the hand-authored template registry
 * first (handAuthoredTemplates.ts) — those blocks have no model JSON at all (rendering is
 * hardcoded in the Minecraft client), so the generic blockstate -> parent-chain resolver can never
 * reach them. Everything past model resolution (texture-key collection, decoding, rasterization)
 * is identical either way, including the heightUnits/depthUnits pass-through that lets a
 * hand-authored bed render at genuine 2-block length exactly like a resolved door renders at
 * genuine 2-block height.
 *
 * `options.properties`, when given (structure mode, which knows each real block's stored
 * Properties), is threaded straight through to resolveItemModel so the correct variant — the
 * right facing/half/shape/axis, not a generic default — gets resolved. This is also what makes
 * `options.rejectMultiCell` a non-issue for ordinary blockstate-driven two-part blocks (doors):
 * with real properties given, resolveItemModel never takes its two-part-stitching path at all (see
 * its own docs), so a door half now resolves as its own genuine single-block model instead of
 * needing to be rejected.
 *
 * `options.rejectMultiCell` remains for what real properties still can't fix — a hand-authored
 * template (bed) that only has geometry for its full 2-block combined shape, with no per-half
 * model to select via properties. Structure mode (buildStructureBlockStamp.ts) calls this engine
 * once per unique block found in a real structure; a structure cell is always exactly one block,
 * so cramming a genuinely 2-block model into one cell would squash or clip it unpredictably.
 * Rather than doing that, this throws a distinguishable error so the caller can fall back to a
 * flat matched-color cube for that block instead.
 *
 * The palette is run through `filterPaletteForSource` (glassSource.ts),
 * `filterLightSourcesForSource` (lightSourceExclusion.ts), `filterPaletteForLeafSource`
 * (leafSource.ts), `filterPaletteForOreSource` (oreSource.ts), and `filterPaletteForPlanksSource`
 * (woodPlanksSource.ts) before matching, all keyed on `itemName`: real glass blocks only stay
 * eligible when the item being voxelized is itself glass-family (a stained glass block, a beacon,
 * an end crystal, ...), never as generic pale/white filler for an unrelated build; light-source
 * blocks (glowstone, sea_lantern — the froglights were removed from the palette entirely, see
 * fullCubeBlocks.ts) are eligible everywhere except for sources confirmed to look bad with them
 * (diamond variants); a leaves/vine source (except cherry_leaves) is restricted to the green/lime
 * family, so a real dark shadow pixel can't stray into an off-theme gray stone match the way
 * `spruce_leaves` was confirmed to (see leafSource.ts's own doc); an ore source (`iron_ore`,
 * `deepslate_copper_ore`, ...) excludes `wood_earth`-family entries, so a real ore-speckle pixel
 * can't stray into an out-of-place wood-grain/mud match the way `iron_ore` was confirmed to (see
 * oreSource.ts's own doc); a planks source excludes `endGrainTopBottom` log/bark entries on every
 * face (not just top/bottom), so a stair or slab's tall side walls can't read as bark-striped log
 * while its tread stays clean plank, the way `oak_planks` was confirmed to (see
 * woodPlanksSource.ts's own doc).
 *
 * A hand-authored template's `elementPaletteRestrictions` (beacon's crystal) is turned into an
 * `elementPaletteOverrides` map here — each element index restricted to just its listed block ids
 * (intersected with `effectivePalette`, so a source-family exclusion still applies), or the
 * unrestricted `effectivePalette` if that intersection is empty (e.g. a custom resource pack
 * missing those exact ids) — so that specific element matches only against its curated set instead
 * of whatever's nearest in raw color across the whole palette.
 */
export async function buildItemVoxelGrid(
  itemName: string,
  blockStateFiles: FileLoaderMap,
  modelFiles: FileLoaderMap,
  decodeTexture: TextureDecoder,
  palette: PaletteEntry[],
  resolution: number,
  options?: { rejectMultiCell?: boolean; properties?: Record<string, string> }
): Promise<VoxelGrid> {
  const handAuthored = HAND_AUTHORED_TEMPLATES[itemName];
  const { model, heightUnits, depthUnits } =
    handAuthored ?? (await resolveItemModel(itemName, blockStateFiles, modelFiles, options?.properties));

  if (options?.rejectMultiCell && (heightUnits !== 16 || depthUnits !== 16)) {
    throw new MultiCellBlockError(`"${itemName}" spans more than one block (height/depth ${heightUnits}/${depthUnits}) and can't be voxelized as a single structure cell.`);
  }

  const neededKeys = new Set<string>();
  for (const el of model.elements) {
    for (const faceDef of Object.values(el.faces)) {
      if (!faceDef) continue;
      try {
        neededKeys.add(texturePathToKey(resolveTexturePath(faceDef.texture, model.textures)));
      } catch {
        // Unresolvable texture variable — skip; rasterizeItemModel falls back to another face
        // for any voxel that would have used it.
      }
    }
  }

  // Leaves (and vine) textures are stored flat/grayscale in the jar and colored at runtime by
  // the real client — the generic resolver has no concept of a model's tintindex, so without
  // this every leaf-type block voxelized here would sample its real, unmultiplied grayscale
  // pixels and match to gray/stone-family filler instead of anything green. detectTextureTintRgb
  // also carries the real per-species overrides (spruce/birch's fixed colors, cherry/azalea's
  // already-baked-in color needing no tint at all) — see its own doc in palette/tint.ts.
  const textures = new Map<string, FaceTexture>();
  await Promise.all(
    [...neededKeys].map(async (key) => {
      const tex = await decodeTexture(key);
      if (!tex) return;
      const tintRgb = detectTextureTintRgb(key);
      textures.set(key, tintRgb ? tintTexture(tex, tintRgb) : tex);
    })
  );

  if (textures.size === 0) {
    throw new Error(`Couldn't decode any texture referenced by "${itemName}"'s model.`);
  }

  const effectivePalette = filterPaletteForPlanksSource(
    filterPaletteForOreSource(
      filterPaletteForLeafSource(
        filterLightSourcesForSource(filterPaletteForSource(palette, itemName), itemName),
        itemName
      ),
      itemName
    ),
    itemName
  );

  let elementPaletteOverrides: Map<number, PaletteEntry[]> | undefined;
  if (handAuthored?.elementPaletteRestrictions) {
    elementPaletteOverrides = new Map(
      Object.entries(handAuthored.elementPaletteRestrictions).map(([indexStr, allowedIds]) => {
        const allowed = new Set(allowedIds);
        const restricted = effectivePalette.filter((entry) => allowed.has(entry.id));
        return [Number(indexStr), restricted.length > 0 ? restricted : effectivePalette];
      })
    );
  }

  return rasterizeItemModel(model, textures, effectivePalette, resolution, heightUnits, depthUnits, elementPaletteOverrides);
}
