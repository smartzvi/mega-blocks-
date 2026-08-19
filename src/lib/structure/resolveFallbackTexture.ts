import type { BlockModel } from '../../types/item';
import { HAND_AUTHORED_TEMPLATES } from '../models/handAuthoredTemplates';
import { resolveItemModel } from '../models/resolveItemModel';
import { resolveTexturePath, texturePathToKey } from '../models/resolveTextureVariable';
import { decodeBlockstateKey } from './blockstateKey';

type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;

function firstTextureKey(model: BlockModel): string | null {
  for (const el of model.elements) {
    for (const faceDef of Object.values(el.faces)) {
      if (!faceDef) continue;
      try {
        return texturePathToKey(resolveTexturePath(faceDef.texture, model.textures));
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Finds ANY one real texture reference for a block, for buildStructureBlockStamp.ts's flat-color
 * fallback tier (a block whose full model can't be voxelized per-cell), by reusing the exact
 * model-resolution engine item mode already uses. This is far more reliable than guessing the
 * texture file is named identically to the block: it isn't, for most non-full-cube blocks
 * (confirmed against the real jar) — oak_stairs' real texture is oak_planks.png, wall_torch's is
 * torch.png, white_bed's lives in entity-texture space as bed/white. Naively looking up a texture
 * file literally named "oak_stairs" or "wall_torch" always misses, landing on the placeholder for
 * nearly every non-cube block — this was caught by the user visually, not by earlier verification,
 * which only checked that a PaletteEntry with the right ID existed, not that its texture was real
 * rather than the placeholder.
 *
 * Hand-authored templates (chest/shulker/bed/sign — no real model JSON at all) are checked first,
 * since resolveItemModel can never reach them.
 *
 * `blockName` may be a full blockstate key (Name[prop=val,...], see blockstateKey.ts) — its
 * properties are passed through so the representative texture comes from the block's actual
 * variant (e.g. an open vs. closed trapdoor), though this tier only ever needs *a* real texture,
 * not a shape, so getting the exact variant right here matters far less than it does for the real
 * per-cell voxelization path in buildStructureBlockStamp.ts.
 */
export async function resolveFallbackTextureKey(blockName: string, blockStateFiles: FileLoaderMap, modelFiles: FileLoaderMap): Promise<string | null> {
  const { name, properties } = decodeBlockstateKey(blockName);
  const bareName = name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;

  const template = HAND_AUTHORED_TEMPLATES[bareName];
  if (template) {
    const key = firstTextureKey(template.model);
    if (key) return key;
  }

  try {
    const resolved = await resolveItemModel(bareName, blockStateFiles, modelFiles, Object.keys(properties).length > 0 ? properties : undefined);
    return firstTextureKey(resolved.model);
  } catch {
    return null;
  }
}
