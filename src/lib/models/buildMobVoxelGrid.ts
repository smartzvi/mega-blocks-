import type { FaceTexture, PaletteEntry, VoxelGrid } from '../../types/minecraft';
import { HAND_AUTHORED_MOB_TEMPLATES } from './handAuthoredMobTemplates';
import { rasterizeItemModel } from './rasterizeModel';
import { resolveTexturePath, texturePathToKey } from './resolveTextureVariable';
import { filterPaletteForSource } from '../palette/glassSource';
import { filterLightSourcesForSource } from '../palette/lightSourceExclusion';

export type MobTextureDecoder = (key: string) => Promise<FaceTexture | null>;

/**
 * The mob-mode counterpart to buildItemVoxelGrid.ts — deliberately its own top-level function
 * rather than routed through that one, since mobs have no blockstate/model JSON to ever fall back
 * to (confirmed by inspecting the real jar: no `models/entity/` directory exists at all — mob
 * geometry is hardcoded in the Minecraft client, not shipped as data), so none of that function's
 * `rejectMultiCell`/`properties` options (both structure-mode concerns, about resolving a real
 * per-instance blockstate variant) apply here. `HAND_AUTHORED_MOB_TEMPLATES` is the only source of
 * truth; an unknown mob name throws immediately rather than attempting any resolver fallback.
 */
export async function buildMobVoxelGrid(
  mobName: string,
  decodeTexture: MobTextureDecoder,
  palette: PaletteEntry[],
  resolution: number
): Promise<VoxelGrid> {
  const template = HAND_AUTHORED_MOB_TEMPLATES[mobName];
  if (!template) {
    throw new Error(`"${mobName}" has no hand-authored mob template.`);
  }
  const { model, heightUnits, depthUnits } = template;

  const neededKeys = new Set<string>();
  for (const el of model.elements) {
    for (const faceDef of Object.values(el.faces)) {
      if (!faceDef) continue;
      try {
        neededKeys.add(texturePathToKey(resolveTexturePath(faceDef.texture, model.textures)));
      } catch {
        // Unresolvable texture variable — skip; rasterizeItemModel falls back to another face.
      }
    }
  }

  const textures = new Map<string, FaceTexture>();
  await Promise.all(
    [...neededKeys].map(async (key) => {
      const tex = await decodeTexture(key);
      if (tex) textures.set(key, tex);
    })
  );

  if (textures.size === 0) {
    throw new Error(`Couldn't decode any texture referenced by "${mobName}"'s model.`);
  }

  // No real mob is glass- or diamond-family, but every other matching call site gates the palette
  // this way — keeping it consistent means a future mob addition can't accidentally end up
  // glass-eligible or lose its light sources by surprise.
  const effectivePalette = filterLightSourcesForSource(filterPaletteForSource(palette, mobName), mobName);

  // Same mechanism buildItemVoxelGrid.ts uses for beacon's crystal — a template can restrict
  // specific element indices to an explicit block-id allow-list instead of the shared palette.
  // Sheep's legs use this (see handAuthoredMobTemplates.ts) to stop its tan skin tone from
  // scattering across visually mismatched wood-plank/log blocks that happen to be close in raw
  // color but read as high-contrast noise next to each other.
  let elementPaletteOverrides: Map<number, PaletteEntry[]> | undefined;
  if (template.elementPaletteRestrictions) {
    elementPaletteOverrides = new Map(
      Object.entries(template.elementPaletteRestrictions).map(([indexStr, allowedIds]) => {
        const allowed = new Set(allowedIds);
        const restricted = effectivePalette.filter((entry) => allowed.has(entry.id));
        return [Number(indexStr), restricted.length > 0 ? restricted : effectivePalette];
      })
    );
  }

  return rasterizeItemModel(model, textures, effectivePalette, resolution, heightUnits, depthUnits, elementPaletteOverrides);
}
