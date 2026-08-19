import type { FaceTexture, Hsv, Lab } from '../../types/minecraft';
import { rgbToLab } from './lab';
import { rgbToHsv } from './hsv';

/** Average RGB (ignoring fully-transparent pixels) of a decoded 16x16 texture. */
export function averageRgb(texture: FaceTexture): { r: number; g: number; b: number } {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;
  const { data } = texture;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
    count++;
  }

  if (count === 0) {
    // Fully transparent texture (shouldn't happen for a full-cube block) — treat as black.
    return { r: 0, g: 0, b: 0 };
  }

  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

export function averageColorLab(texture: FaceTexture): Lab {
  const { r, g, b } = averageRgb(texture);
  return rgbToLab(r, g, b);
}

export function averageColorHsv(texture: FaceTexture): Hsv {
  const { r, g, b } = averageRgb(texture);
  return rgbToHsv(r, g, b);
}
