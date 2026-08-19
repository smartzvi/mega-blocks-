import type { BlockTextureSet, FaceName, Hsv, Lab, PaletteEntry } from '../../types/minecraft';
import { FACE_NAMES } from '../../types/minecraft';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import { FULL_CUBE_BLOCKS } from './fullCubeBlocks';
import { isExcluded } from './blockExclusions';
import { applyTint } from './tint';

/**
 * Restricts the extracted textures to the curated full-cube allow-list, applies biome tints
 * where applicable, and computes+caches each entry's average Lab + HSV color per face. Run
 * once right after upload — never recomputed per search.
 */
export function buildPalette(extractedTextures: Map<string, BlockTextureSet>): PaletteEntry[] {
  const palette: PaletteEntry[] = [];

  for (const def of FULL_CUBE_BLOCKS) {
    if (isExcluded(def.id)) continue;

    const rawTextures = extractedTextures.get(def.textureBase);
    if (!rawTextures) continue; // this jar/pack doesn't have (or couldn't resolve) this block's texture

    const textures = def.tint ? applyTint(rawTextures, def.tint) : rawTextures;

    const avgLab = {} as Record<FaceName, Lab>;
    const avgHsv = {} as Record<FaceName, Hsv>;
    for (const face of FACE_NAMES) {
      avgLab[face] = averageColorLab(textures[face]);
      avgHsv[face] = averageColorHsv(textures[face]);
    }

    palette.push({
      id: def.id,
      textureBase: def.textureBase,
      tint: def.tint,
      family: def.family,
      textures,
      avgLab,
      avgHsv,
      gravityAffected: def.gravityAffected,
      endGrainTopBottom: def.endGrainTopBottom,
      glassOnly: def.glassOnly,
      lightSource: def.lightSource,
    });
  }

  return palette;
}
