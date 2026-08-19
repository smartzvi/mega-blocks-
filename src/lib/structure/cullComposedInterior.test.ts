import { describe, expect, it } from 'vitest';
import type { VoxelGrid } from '../../types/minecraft';
import { cullComposedInterior } from './cullComposedInterior';

function solidCube(size: number, id = 'minecraft:oak_planks'): VoxelGrid {
  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < size; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < size; y++) plane.push(new Array(size).fill(id));
    voxels.push(plane);
  }
  return { sizeX: size, sizeY: size, sizeZ: size, voxels };
}

describe('cullComposedInterior', () => {
  it('leaves only the outer shell of a fully solid cube', () => {
    const grid = solidCube(5);
    const culled = cullComposedInterior(grid);
    expect(culled.voxels[2][2][2]).toBeNull(); // dead center, fully buried
    expect(culled.voxels[0][2][2]).toBe('minecraft:oak_planks'); // outer face
    expect(culled.voxels[4][4][4]).toBe('minecraft:oak_planks'); // corner
  });

  it('merges two adjacent solid stamps into one skin, removing the doubled interior wall between them', () => {
    // Two 4x4x4 solid blocks side by side on X (a stand-in for two adjacent block stamps, each
    // independently voxelized as its own hollow shell before this pass) — before this pass, the
    // touching faces at x=3 and x=4 would both stay solid (each stamp's own outer wall). After,
    // the boundary voxels between them should cull away since they're now fully surrounded by
    // real neighbors from the other stamp.
    const voxels: (string | null)[][][] = [];
    for (let x = 0; x < 8; x++) {
      const plane: (string | null)[][] = [];
      for (let y = 0; y < 4; y++) plane.push(new Array(4).fill('minecraft:oak_planks'));
      voxels.push(plane);
    }
    const grid: VoxelGrid = { sizeX: 8, sizeY: 4, sizeZ: 4, voxels };
    const culled = cullComposedInterior(grid);

    // The seam voxels (x=3 and x=4, away from the y/z boundary) are now fully interior.
    expect(culled.voxels[3][1][1]).toBeNull();
    expect(culled.voxels[4][1][1]).toBeNull();
    // The true outer boundary (x=0 and x=7) stays.
    expect(culled.voxels[0][1][1]).toBe('minecraft:oak_planks');
    expect(culled.voxels[7][1][1]).toBe('minecraft:oak_planks');
  });

  it('never culls a voxel with any real air neighbor, even one placed there by a different stamp', () => {
    const voxels: (string | null)[][][] = [
      [
        [null, null, null],
        [null, 'minecraft:stone', null],
        [null, null, null],
      ],
    ];
    const grid: VoxelGrid = { sizeX: 1, sizeY: 3, sizeZ: 3, voxels };
    const culled = cullComposedInterior(grid);
    expect(culled.voxels[0][1][1]).toBe('minecraft:stone'); // fully exposed, never culled
  });

  it('leaves an already-sparse (thin, non-cube) shape untouched when nothing is fully buried', () => {
    // A single-voxel-thick plane — every voxel has at least one air neighbor (front/back), so
    // nothing should ever be culled.
    const voxels: (string | null)[][][] = [[[null, 'minecraft:oak_planks', null]]];
    const grid: VoxelGrid = { sizeX: 1, sizeY: 1, sizeZ: 3, voxels };
    const culled = cullComposedInterior(grid);
    expect(culled.voxels[0][0][1]).toBe('minecraft:oak_planks');
  });
});
