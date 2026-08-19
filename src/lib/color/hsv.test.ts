import { describe, expect, it } from 'vitest';
import { hueDistance, isChromatic, rgbToHsv } from './hsv';

describe('rgbToHsv', () => {
  it('matches known reference values for primaries and gray', () => {
    expect(rgbToHsv(255, 0, 0)).toEqual({ h: 0, s: 1, v: 1 });
    const green = rgbToHsv(0, 255, 0);
    expect(green.h).toBeCloseTo(120, 5);
    expect(green.s).toBeCloseTo(1, 5);
    expect(green.v).toBeCloseTo(1, 5);
    const blue = rgbToHsv(0, 0, 255);
    expect(blue.h).toBeCloseTo(240, 5);
    const gray = rgbToHsv(128, 128, 128);
    expect(gray.s).toBe(0);
  });
});

describe('hueDistance', () => {
  it('is circular and symmetric', () => {
    expect(hueDistance(10, 20)).toBe(10);
    expect(hueDistance(20, 10)).toBe(10);
    expect(hueDistance(350, 10)).toBe(20);
    expect(hueDistance(0, 180)).toBe(180);
    expect(hueDistance(0, 350)).toBe(10);
  });
});

describe('isChromatic', () => {
  it('rejects near-achromatic (gray) colors and low-value (near-black) colors', () => {
    expect(isChromatic({ h: 0, s: 0.01, v: 0.5 })).toBe(false); // gray
    expect(isChromatic({ h: 30, s: 0.9, v: 0.05 })).toBe(false); // near-black, unstable hue
    expect(isChromatic({ h: 30, s: 0.5, v: 0.5 })).toBe(true); // genuinely chromatic
  });
});
