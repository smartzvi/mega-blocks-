import type { FaceName, PaletteEntry } from '../../types/minecraft';
import { FACE_NAMES } from '../../types/minecraft';
import { isChromatic } from '../color/hsv';
import { isWoodFamilySource } from './lightSourceExclusion';

/** A candidate whose average color is non-chromatic (near gray/white/black) on every face — a
 *  block with genuinely no hue at all, like light_gray_concrete or polished_deepslate, as opposed
 *  to a "muted but still colored" block like brown_concrete or terracotta. */
function isGenuinelyNeutral(entry: PaletteEntry): boolean {
  return FACE_NAMES.every((face: FaceName) => !isChromatic(entry.avgHsv[face]));
}

/**
 * Strips genuinely-neutral (hueless) candidates — plain grays like light_gray_concrete,
 * polished_deepslate, white/black/gray wool and concrete — for wood-family sources
 * (isWoodFamilySource). Confirmed against the real jar: acacia_log's real bark texture sits right
 * at the edge of matchPixel's "chromatic" saturation cutoff (~0.16, just above the 0.15
 * threshold), so its family-affinity guard treats nearly the whole texture as "prefers natural" —
 * and since light_gray_concrete/polished_deepslate are themselves non-chromatic, they're exempt
 * from that very guard (an exemption that exists so a genuinely gray SOURCE like stone can still
 * reach wool/concrete fill) and win purely on raw Lab distance: 216/1024 + 76/1024 pixels (~29%)
 * of acacia_log's side faces at resolution 32, a visibly blotchy patch of gray stone/concrete in
 * an otherwise wood-toned build. A handful of other woods (spruce/jungle/dark_oak/crimson/warped)
 * pull in small amounts of a same-hue-family concrete/wool (brown_concrete, red_wool, cyan_wool)
 * through the same exemption — those are left alone, since they're still the right *hue*, just a
 * different material, and don't read as visibly wrong the way true gray does in a wood build.
 */
export function filterNeutralStoneForWoodSource(palette: PaletteEntry[], sourceName: string): PaletteEntry[] {
  if (!isWoodFamilySource(sourceName)) return palette;
  return palette.filter((entry) => {
    if ((entry.family === 'neutrals_concrete' || entry.family === 'stone_deepslate') && isGenuinelyNeutral(entry)) {
      return false;
    }
    return true;
  });
}
