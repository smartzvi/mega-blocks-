import type { Lab } from '../../types/minecraft';

// sRGB -> linear -> CIE XYZ (D65) -> CIE Lab. Standard formulas, no shortcuts.
function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

// D65 reference white, sRGB primaries (IEC 61966-2-1).
const Xn = 0.95047;
const Yn = 1.0;
const Zn = 1.08883;

function xyzChannelToLab(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3 ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / Xn;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / Yn;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / Zn;

  const fx = xyzChannelToLab(x);
  const fy = xyzChannelToLab(y);
  const fz = xyzChannelToLab(z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** CIE76 Euclidean distance in Lab space. Good enough for nearest-neighbor block matching. */
export function deltaE(a: Lab, b: Lab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
