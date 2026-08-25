import type { BlockTextureSet, FaceMatchGrid, FaceName, FaceTexture, Hsv, Lab, MatchedFaces, PaletteEntry } from '../../types/minecraft';
import { FACE_NAMES } from '../../types/minecraft';
import { deltaE, rgbToLab } from '../color/lab';
import { hueDistance, isChromatic, rgbToHsv } from '../color/hsv';
import { resampleTexture } from '../color/resample';

// Hues within this many degrees of the pixel's hue are treated as compatible; anything wider
// gets a severe penalty. This is what stops e.g. green wool from ever being picked for a warm
// brown wood pixel just because it was marginally closer in raw Lab distance.
const HUE_HARD_CUTOFF_DEG = 75;

// Below this saturation a pixel reads as a muted/earthy color (wood grain, stone, clay) rather
// than a vividly dyed one — only pixels at or above this saturation are allowed to reach into
// the neutrals_concrete family (wool/concrete) without penalty. This is the "unless the pixel
// itself is explicitly bright green/yellow" carve-out from a saturation angle, complementing
// the hue guard's angle-based one.
const NATURAL_SATURATION_CUTOFF = 0.5;

// Additive Lab-distance penalty for a hue or family mismatch. Large relative to typical deltaE
// values in this palette (roughly 0-60), so a mismatched candidate only wins if it's
// dramatically closer than every compatible option — "effectively impossible" without being a
// hard exclusion (additive penalties can never eliminate every candidate, so a match is always
// well-defined even in a degenerate one-block palette).
const SEVERE_MISMATCH_PENALTY = 50;

/** Nearest-palette-block match, per pixel, for a single 16x16 face texture. */
export function matchFace(sourceFace: FaceTexture, face: FaceName, palette: PaletteEntry[]): FaceMatchGrid {
  if (palette.length === 0) throw new Error('Palette is empty — cannot match blocks.');

  const grid: string[][] = [];
  for (let v = 0; v < sourceFace.height; v++) {
    const row: string[] = [];
    for (let u = 0; u < sourceFace.width; u++) {
      const i = (v * sourceFace.width + u) * 4;
      const r = sourceFace.data[i];
      const g = sourceFace.data[i + 1];
      const b = sourceFace.data[i + 2];
      const pixelLab = rgbToLab(r, g, b);
      const pixelHsv = rgbToHsv(r, g, b);
      row.push(matchPixel(pixelLab, pixelHsv, face, palette).id);
    }
    grid.push(row);
  }
  return grid;
}

/**
 * Nearest-palette-block match for a single already-decoded pixel. Exported (in addition to
 * matchFace/matchAllFaces) because it's the one primitive here that isn't tied to "one whole
 * 16x16 cube face" — anything that needs to match individual sampled pixels against the palette
 * (e.g. the item-model voxelizer in lib/models/rasterizeModel.ts) can call this directly.
 */
export function matchPixel(pixelLab: Lab, pixelHsv: Hsv, face: FaceName, palette: PaletteEntry[]): PaletteEntry {
  // Near-black/near-white/near-gray pixels skip hue and family reasoning entirely: HSV
  // saturation is numerically unstable at extreme lightness (the same instability CIE Lab's
  // a*/b* show near L=0, confirmed empirically while validating obsidian's match distribution),
  // so treating those as "chromatic" would filter on noise, not signal. Pure color distance is
  // already the right answer for these.
  if (!isChromatic(pixelHsv)) {
    return nearestByColor(pixelLab, palette, face);
  }

  const pixelPrefersNatural = pixelHsv.s < NATURAL_SATURATION_CUTOFF;

  let best = palette[0];
  let bestScore = Infinity;
  for (const entry of palette) {
    let score = deltaE(pixelLab, entry.avgLab[face]);
    const chsv = entry.avgHsv[face];
    const candidateIsChromatic = isChromatic(chsv);

    // Rule 3 — hue guard: only meaningful when the candidate itself has a stable hue.
    if (candidateIsChromatic && hueDistance(pixelHsv.h, chsv.h) > HUE_HARD_CUTOFF_DEG) {
      score += SEVERE_MISMATCH_PENALTY;
    }

    // Rule 2 — material-family affinity: a muted/earthy pixel reaching for a vividly-dyed
    // wool/concrete color (rather than a muted variant of the same family) is penalized.
    // Near-neutral wool/concrete entries (white/gray/black) are exempt — they're as
    // color-neutral as stone or terracotta and shouldn't be family-gated.
    if (pixelPrefersNatural && entry.family === 'neutrals_concrete' && candidateIsChromatic) {
      score += SEVERE_MISMATCH_PENALTY;
    }

    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

function nearestByColor(pixelLab: Lab, palette: PaletteEntry[], face: FaceName): PaletteEntry {
  let best = palette[0];
  let bestDist = deltaE(pixelLab, best.avgLab[face]);
  for (let k = 1; k < palette.length; k++) {
    const d = deltaE(pixelLab, palette[k].avgLab[face]);
    if (d < bestDist) {
      bestDist = d;
      best = palette[k];
    }
  }
  return best;
}

/**
 * Matches all 6 faces of a source block independently against the palette, at the given output
 * grid resolution. The source textures are natively 16x16 (the jar's own texture resolution);
 * for a 32x32 grid each face is first upsampled via nearest-neighbor replication (each source
 * pixel becomes a flat 2x2 block) so thin high-contrast details (icon edges, grid lines) stay
 * crisp instead of being blurred into in-between colors that don't exist in the source texture.
 *
 * The output is always the same hollow-cube shell shape (assembleShell.ts), so "top"/"bottom"
 * here are real, fixed physical directions, not just arbitrary face labels — which lets this
 * exclude two categories of palette entry from specific faces rather than the whole palette:
 * `gravityAffected` (sand/red_sand) off the top face only — the shell's top always sits over a
 * hollow interior with nothing to support it, but the bottom face (resting on the ground, the
 * normal way a finished build is placed) and the 4 walls (continuously backed by solid shell
 * down to that same ground) are fine; `endGrainTopBottom` (log/stem/bamboo end-grain) off both
 * top and bottom — a purely visual call, its distinctive ring texture reads as an out-of-place
 * blotch on a flat face regardless of which one.
 */
export function matchAllFaces(sourceTextures: BlockTextureSet, palette: PaletteEntry[], resolution: number): MatchedFaces {
  const result = {} as MatchedFaces;
  for (const face of FACE_NAMES) {
    const resampled = resampleTexture(sourceTextures[face], resolution);
    const facePalette = palette.filter((entry) => {
      if (entry.endGrainTopBottom && (face === 'top' || face === 'bottom')) return false;
      if (entry.gravityAffected && face === 'top') return false;
      return true;
    });
    // Never let a restriction leave a face with nothing to match against — falling back to the
    // unfiltered palette for that one face is far better than crashing on an edge case (e.g. a
    // custom resource pack whose only usable blocks all happen to be flagged).
    result[face] = matchFace(resampled, face, facePalette.length > 0 ? facePalette : palette);
  }
  return result;
}
