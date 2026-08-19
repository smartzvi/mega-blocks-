import type { Hsv } from '../../types/minecraft';

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

/** Circular hue distance in degrees, always in [0, 180]. */
export function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2) % 360;
  return d > 180 ? 360 - d : d;
}

// Saturation is numerically unstable at low value (tiny channel differences on a near-black
// pixel can produce a spuriously high S), the same instability CIE Lab's a*/b* show near L=0 —
// confirmed empirically while validating obsidian's match distribution. Gate "is this color's
// hue meaningful enough to reason about" on both saturation AND value to avoid acting on noise.
const SATURATION_THRESHOLD = 0.15;
const VALUE_THRESHOLD = 0.12;

export function isChromatic(hsv: Hsv): boolean {
  return hsv.s >= SATURATION_THRESHOLD && hsv.v >= VALUE_THRESHOLD;
}
