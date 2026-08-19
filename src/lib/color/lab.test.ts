import { describe, expect, it } from 'vitest';
import { deltaE, rgbToLab } from './lab';

describe('rgbToLab', () => {
  it('matches known reference values', () => {
    const black = rgbToLab(0, 0, 0);
    expect(black.L).toBeCloseTo(0, 1);
    expect(black.a).toBeCloseTo(0, 1);
    expect(black.b).toBeCloseTo(0, 1);

    const white = rgbToLab(255, 255, 255);
    expect(white.L).toBeCloseTo(100, 1);
    expect(white.a).toBeCloseTo(0, 1);
    expect(white.b).toBeCloseTo(0, 1);

    // Standard sRGB->Lab (D65) reference for pure red.
    const red = rgbToLab(255, 0, 0);
    expect(red.L).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
  });
});

describe('deltaE', () => {
  it('is zero for identical colors and positive for different ones', () => {
    const a = rgbToLab(100, 50, 20);
    expect(deltaE(a, a)).toBe(0);
    const b = rgbToLab(200, 200, 200);
    expect(deltaE(a, b)).toBeGreaterThan(0);
  });
});
