import { describe, expect, it } from 'vitest';
import { assembleShell } from './assembleShell';
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

describe.each([
  { size: 16, expectedCount: 1352 },
  { size: 32, expectedCount: 5768 },
  { size: 64, expectedCount: 23816 },
])('assembleShell (size=$size)', ({ size, expectedCount }) => {
  const max = size - 1;
  const mid = Math.floor(size / 2) - 1; // an interior-ish index along an edge, safely inside [1, size-2]

  it(`populates exactly the ${expectedCount} shell voxels, leaving the interior air`, () => {
    const grid = assembleShell(fakeMatchedFaces(size));
    expect(grid.sizeX).toBe(size);
    expect(grid.sizeY).toBe(size);
    expect(grid.sizeZ).toBe(size);

    let populated = 0;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          if (grid.voxels[x][y][z] !== null) populated++;
        }
      }
    }
    expect(populated).toBe(size ** 3 - (size - 2) ** 3);
    expect(populated).toBe(expectedCount);
    // A clearly interior voxel must be air.
    const centerIsh = Math.floor(size / 2);
    expect(grid.voxels[centerIsh][centerIsh][centerIsh]).toBeNull();
  });

  it('resolves corners via the top/bottom face (wins over all sides)', () => {
    const grid = assembleShell(fakeMatchedFaces(size));
    expect(grid.voxels[0][max][0]).toBe('face-top');
    expect(grid.voxels[max][max][max]).toBe('face-top');
    expect(grid.voxels[0][0][0]).toBe('face-bottom');
    expect(grid.voxels[max][0][max]).toBe('face-bottom');
  });

  it('resolves the 4 vertical edges via north/south winning over east/west', () => {
    const grid = assembleShell(fakeMatchedFaces(size));
    expect(grid.voxels[0][mid][0]).toBe('face-north');
    expect(grid.voxels[0][mid][max]).toBe('face-south');
    expect(grid.voxels[max][mid][0]).toBe('face-north');
    expect(grid.voxels[max][mid][max]).toBe('face-south');
  });

  it('resolves flat (single-face) regions directly', () => {
    const grid = assembleShell(fakeMatchedFaces(size));
    expect(grid.voxels[0][mid][mid]).toBe('face-west');
    expect(grid.voxels[max][mid][mid]).toBe('face-east');
    expect(grid.voxels[mid][mid][0]).toBe('face-north');
    expect(grid.voxels[mid][mid][max]).toBe('face-south');
  });
});
