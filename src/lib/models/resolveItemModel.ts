import type { BlockModel, BlockModelElement } from '../../types/item';
import { findTwoPartVariantKeys, resolveBlockStateModelRefs, type BlockStateModelRef } from '../blockstate/parseBlockState';
import { resolveModelFile } from './resolveModelFile';
import { rotateElementX, rotateElementY, shiftElementY } from './rotateElement';
import { texturePathToKey } from './resolveTextureVariable';

type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;

export interface ResolvedItem {
  model: BlockModel;
  /** The model space's Y extent, in the same 16-units-per-block scale as X/Z: 16 for an
   *  ordinary single-block item, 32 for a combined two-part block (a real door). */
  heightUnits: number;
  /** The model space's Z extent. Blockstate-driven two-part combination (findTwoPartVariantKeys)
   *  only ever stacks vertically (half=lower/upper), so this is always 16 here — a depth-doubled
   *  item (e.g. a hand-authored bed) is built directly in handAuthoredTemplates.ts instead. Kept
   *  alongside heightUnits so buildItemVoxelGrid.ts can pass both through uniformly regardless of
   *  which resolution path produced the model. */
  depthUnits: number;
}

async function loadRawBlockState(name: string, blockStateFiles: FileLoaderMap): Promise<unknown> {
  const load = blockStateFiles.get(name);
  if (!load) {
    throw new Error(`No blockstate found for "${name}" at assets/minecraft/blockstates/${name}.json.`);
  }
  const bytes = await load();
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Vanilla applies a variant's "x" rotation before its "y" rotation when both are present (real
 *  case: a `half=top` stair combines `x: 180` with a facing-driven `y`) — matching that order here
 *  matters, since rotating a non-cube element around Y first then X (or the reverse) generally
 *  lands it somewhere different. */
async function resolveSingleRef(ref: BlockStateModelRef, modelFiles: FileLoaderMap): Promise<BlockModel> {
  const modelKey = texturePathToKey(ref.model);
  const model = await resolveModelFile(modelKey, modelFiles);
  const elements = model.elements.map((el) => rotateElementY(rotateElementX(el, ref.x), ref.y));
  return { elements, textures: model.textures };
}

/** Prefixes every texture variable name (and every "#var" reference to one) with `prefix`, so
 *  two independently-resolved models can be merged into one without one half's variable name
 *  accidentally colliding with the other's (e.g. if both happen to use "#top" for something
 *  different — real door halves don't in practice, but this makes the combination correct
 *  regardless of what a given two-part block happens to name its variables). */
function namespaceModel(model: BlockModel, prefix: string): BlockModel {
  const renameRef = (ref: string) => (ref.startsWith('#') ? `#${prefix}${ref.slice(1)}` : ref);

  const textures = Object.fromEntries(Object.entries(model.textures).map(([k, v]) => [`${prefix}${k}`, renameRef(v)]));

  const elements: BlockModelElement[] = model.elements.map((el) => {
    const faces: BlockModelElement['faces'] = {};
    for (const [face, def] of Object.entries(el.faces)) {
      if (!def) continue;
      faces[face as keyof BlockModelElement['faces']] = { uv: def.uv, texture: renameRef(def.texture) };
    }
    return { from: el.from, to: el.to, faces };
  });

  return { elements, textures };
}

/**
 * Top-level entry point for the item voxelizer: resolves an arbitrary block name all the way
 * down to one combined, rotation-applied BlockModel ready for rasterizeItemModel, plus the
 * model's Y-height/Z-depth in 16-units-per-block terms. Ties together blockstate variant/multipart
 * selection (parseBlockState.ts), model parent-chain resolution (resolveModelFile.ts), per-part Y
 * rotation (rotateElement.ts), and two-part vertical stacking (also parseBlockState.ts) — real-
 * world wrinkles a plain "read one model file" approach doesn't handle, discovered by checking
 * real assets rather than assuming a simple case generalizes.
 *
 * Two-part blocks (a real door: one blockstate, "half=lower"/"half=upper" variants) resolve each
 * half exactly as if it were its own single-block item — each half's model JSON is authored in
 * its own local 0-16 Y space, as if it stood alone — then the upper half's elements are shifted
 * up by 16 units so the combined shape occupies 0-16 (lower) through 16-32 (upper): one
 * continuous 2-block-tall structure instead of two overlapping 1-block ones. This stitching is
 * purely an item-mode convenience for picking "a door" as one complete 2-tall item to voxelize —
 * skipped entirely when `properties` is given (structure mode, voxelizing one real structure cell
 * at a time, where each half already has its own position and its own real half=lower/upper
 * property): that cell resolves to its own ordinary single-block model instead, respecting
 * whatever facing/hinge/open it actually has.
 */
export async function resolveItemModel(
  itemName: string,
  blockStateFiles: FileLoaderMap,
  modelFiles: FileLoaderMap,
  properties?: Record<string, string>
): Promise<ResolvedItem> {
  const rawState = await loadRawBlockState(itemName, blockStateFiles);

  if (!properties) {
    const twoPart = findTwoPartVariantKeys(rawState);
    if (twoPart) {
      const lower = namespaceModel(await resolveSingleRef(twoPart.lower, modelFiles), 'lower_');
      const upper = namespaceModel(await resolveSingleRef(twoPart.upper, modelFiles), 'upper_');
      const upperShifted = upper.elements.map((el) => shiftElementY(el, 16));

      const elements = [...lower.elements, ...upperShifted];
      if (elements.length === 0) {
        throw new Error(`"${itemName}" resolved to zero elements — nothing to voxelize.`);
      }
      return { model: { elements, textures: { ...lower.textures, ...upper.textures } }, heightUnits: 32, depthUnits: 16 };
    }
  }

  const refs = resolveBlockStateModelRefs(rawState, itemName, properties);
  const parts = await Promise.all(refs.map((ref) => resolveSingleRef(ref, modelFiles)));

  const elements = parts.flatMap((p) => p.elements);
  if (elements.length === 0) {
    throw new Error(`"${itemName}" resolved to zero elements — nothing to voxelize.`);
  }

  const textures = parts.reduce<Record<string, string>>((acc, p) => ({ ...acc, ...p.textures }), {});
  return { model: { elements, textures }, heightUnits: 16, depthUnits: 16 };
}
