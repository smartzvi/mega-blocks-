import { describe, expect, it } from 'vitest';
import { STAGE_WEIGHTS, overallFraction, throttledProgress, type BuildProgress } from './buildProgress';

describe('throttledProgress', () => {
  it('fires only when the whole percent changes, so a hot loop does not flood the callback', () => {
    const events: BuildProgress[] = [];
    const report = throttledProgress('place', (p) => events.push(p));
    for (let i = 0; i <= 10_000; i++) report(i / 10_000);
    expect(events.length).toBeLessThanOrEqual(101);
    expect(events[0]).toEqual({ stage: 'place', fraction: 0 });
    expect(events[events.length - 1]).toEqual({ stage: 'place', fraction: 1 });
  });

  it('clamps out-of-range values and is a no-op without a callback', () => {
    const events: BuildProgress[] = [];
    const report = throttledProgress('trim', (p) => events.push(p));
    report(-5);
    report(9);
    expect(events.map((e) => e.fraction)).toEqual([0, 1]);
    expect(() => throttledProgress('trim', undefined)(0.5)).not.toThrow();
  });
});

describe('overallFraction', () => {
  it('weights sum to 1, so the bar ends exactly full', () => {
    expect(Object.values(STAGE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(overallFraction({ stage: 'prepare', fraction: 1 })).toBeCloseTo(1, 10);
  });

  it('only ever moves forward as stages advance', () => {
    const points: BuildProgress[] = [
      { stage: 'connect', fraction: 0 },
      { stage: 'connect', fraction: 1 },
      { stage: 'stamps', fraction: 0.5 },
      { stage: 'stamps', fraction: 1 },
      { stage: 'place', fraction: 0.5 },
      { stage: 'place', fraction: 1 },
      { stage: 'trim', fraction: 0.5 },
      { stage: 'trim', fraction: 1 },
      { stage: 'prepare', fraction: 0.5 },
      { stage: 'prepare', fraction: 1 },
    ];
    const values = points.map(overallFraction);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(values[0]).toBe(0);
  });

  it('a build with no connect stage (a warm worker) still starts at 0 for its first real stage', () => {
    // The bar just begins later on the scale; it never jumps backwards.
    expect(overallFraction({ stage: 'stamps', fraction: 0 })).toBeCloseTo(STAGE_WEIGHTS.connect, 10);
  });
});
