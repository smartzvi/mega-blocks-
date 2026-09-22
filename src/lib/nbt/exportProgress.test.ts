import { describe, expect, it } from 'vitest';
import { overallExportFraction } from './exportProgress';

describe('overallExportFraction', () => {
  it('weights write (0.9) ahead of compress (0.1), each scaled by its own within-stage fraction', () => {
    expect(overallExportFraction({ stage: 'write', fraction: 0 })).toBeCloseTo(0);
    expect(overallExportFraction({ stage: 'write', fraction: 0.5 })).toBeCloseTo(0.45);
    expect(overallExportFraction({ stage: 'write', fraction: 1 })).toBeCloseTo(0.9);
    expect(overallExportFraction({ stage: 'compress', fraction: 0 })).toBeCloseTo(0.9);
    expect(overallExportFraction({ stage: 'compress', fraction: 0.5 })).toBeCloseTo(0.95);
    expect(overallExportFraction({ stage: 'compress', fraction: 1 })).toBeCloseTo(1);
  });
});
