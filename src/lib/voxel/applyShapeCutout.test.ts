import { describe, expect, it } from 'vitest';
import { assembleShell } from './assembleShell';
import { applyShapeCutout } from './applyShapeCutout';
import type { FaceMatchGrid, FaceName, MatchedFaces } from '../../types/minecraft';

function uniformGrid(id: string, size: number): FaceMatchGrid {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => id));
}

function fakeMatchedFaces(size: number): MatchedFaces {
  const faces: FaceName[] = ['top', 'bottom', 'north', 'south', 'east', 'west'];
  const result = {} as MatchedFaces;
  for (const face of faces) result[face] = uniformGrid(`face-${face}`, size);
  return result;
}

function countPopulated(voxels: (string | null)[][][]): number {
  let count = 0;
  for (const plane of voxels) for (const column of plane) for (const cell of column) if (cell !== null) count++;
  return count;
}

// Expected counts/positions below were computed with an independent script replicating the
// exact trim+cap algorithm against a real assembleShell() output for size=16, not hand-derived
// by inspection — see the conversation this file originated from.

describe('applyShapeCutout', () => {
  it('full_cube is a no-op identity (same grid reference, untouched)', () => {
    const matchedFaces = fakeMatchedFaces(16);
    const shell = assembleShell(matchedFaces);
    const result = applyShapeCutout(shell, matchedFaces, 'full_cube');
    expect(result).toBe(shell);
  });

  it('slab: keeps the bottom half, caps the new top plane, size=16 -> 872 populated', () => {
    const matchedFaces = fakeMatchedFaces(16);
    const shell = assembleShell(matchedFaces);
    const result = applyShapeCutout(shell, matchedFaces, 'slab');

    expect(countPopulated(result.voxels)).toBe(872);
    // Interior cell directly under the cut, previously air, now capped solid with the top grid.
    expect(result.voxels[7][7][7]).toBe('face-top');
    // Removed region (upper half) must be air.
    expect(result.voxels[7][8][7]).toBeNull();
    // A ring wall cell AT the cap plane gets overwritten to the cap value too (full-plane cap).
    expect(result.voxels[0][7][0]).toBe('face-top');
    // One layer below the cap, the original wall is untouched.
    expect(result.voxels[0][6][0]).toBe('face-north');
  });

  it('stair: L-shaped profile with tread + riser caps, size=16 -> 1210 populated', () => {
    const matchedFaces = fakeMatchedFaces(16);
    const shell = assembleShell(matchedFaces);
    const result = applyShapeCutout(shell, matchedFaces, 'stair');

    expect(countPopulated(result.voxels)).toBe(1210);
    // Tread cap: newly exposed horizontal surface over the front half.
    expect(result.voxels[0][7][8]).toBe('face-top');
    // Riser cap: newly exposed vertical surface over the back-top half.
    expect(result.voxels[0][8][7]).toBe('face-south');
    // The removed front-top quadrant is air.
    expect(result.voxels[7][8][8]).toBeNull();
    // The back tower (z < cutZ) is untouched all the way to the original top.
    expect(result.voxels[0][15][0]).toBe('face-top');
  });

  it('door: thin, half-width, full-height panel, size=16 -> cutZ=2, width=8 (x 4..11), 256 populated', () => {
    const matchedFaces = fakeMatchedFaces(16);
    const shell = assembleShell(matchedFaces);
    const result = applyShapeCutout(shell, matchedFaces, 'door');

    expect(countPopulated(result.voxels)).toBe(256);
    // Cap plane (the new back of the thin panel), within the narrowed width, is fully solid.
    expect(result.voxels[7][0][1]).toBe('face-south');
    expect(result.voxels[7][7][1]).toBe('face-south');
    // Anything beyond the panel's depth is air.
    expect(result.voxels[7][7][2]).toBeNull();
    // The original front wall is untouched within the narrowed width.
    expect(result.voxels[7][0][0]).toBe('face-bottom');
    // Newly exposed side cuts (left at x=4, right at x=11) are capped with west/east.
    expect(result.voxels[4][7][0]).toBe('face-west');
    expect(result.voxels[4][7][1]).toBe('face-west');
    expect(result.voxels[11][7][0]).toBe('face-east');
    expect(result.voxels[11][7][1]).toBe('face-east');
    // Narrowed away entirely: x=0 and x=15 (the original cube's own west/east walls) are air.
    expect(result.voxels[0][7][0]).toBeNull();
    expect(result.voxels[15][7][0]).toBeNull();
  });

  it('does not mutate the input grid (independent copy)', () => {
    const matchedFaces = fakeMatchedFaces(16);
    const shell = assembleShell(matchedFaces);
    const before = shell.voxels[0][15][0];
    applyShapeCutout(shell, matchedFaces, 'slab');
    expect(shell.voxels[0][15][0]).toBe(before);
  });
});
