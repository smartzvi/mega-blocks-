import { describe, expect, it } from 'vitest';
import type { VoxelGrid } from '../../types/minecraft';
import { cullComposedInterior } from './cullComposedInterior';
import { createVoxelGrid, getVoxel, setVoxel } from '../voxel/voxelGrid';

function solidCube(size: number, id = 'minecraft:oak_planks'): VoxelGrid {
  const grid = createVoxelGrid(size, size, size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) setVoxel(grid, x, y, z, id);
    }
  }
  return grid;
}

describe('cullComposedInterior', () => {
  it('leaves only the outer shell of a fully solid cube', () => {
    const grid = solidCube(5);
    const culled = cullComposedInterior(grid);
    expect(getVoxel(culled, 2, 2, 2)).toBeNull(); // dead center, fully buried
    expect(getVoxel(culled, 0, 2, 2)).toBe('minecraft:oak_planks'); // outer face
    expect(getVoxel(culled, 4, 4, 4)).toBe('minecraft:oak_planks'); // corner
  });

  it('merges two adjacent solid stamps into one skin, removing the doubled interior wall between them', () => {
    // Two 4x4x4 solid blocks side by side on X (a stand-in for two adjacent block stamps, each
    // independently voxelized as its own hollow shell before this pass) — before this pass, the
    // touching faces at x=3 and x=4 would both stay solid (each stamp's own outer wall). After,
    // the boundary voxels between them should cull away since they're now fully surrounded by
    // real neighbors from the other stamp.
    const wideGrid = createVoxelGrid(8, 4, 4);
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 4; y++) {
        for (let z = 0; z < 4; z++) setVoxel(wideGrid, x, y, z, 'minecraft:oak_planks');
      }
    }
    const culled = cullComposedInterior(wideGrid);

    // The seam voxels (x=3 and x=4, away from the y/z boundary) are now fully interior.
    expect(getVoxel(culled, 3, 1, 1)).toBeNull();
    expect(getVoxel(culled, 4, 1, 1)).toBeNull();
    // The true outer boundary (x=0 and x=7) stays.
    expect(getVoxel(culled, 0, 1, 1)).toBe('minecraft:oak_planks');
    expect(getVoxel(culled, 7, 1, 1)).toBe('minecraft:oak_planks');
  });

  it('never culls a voxel with any real air neighbor, even one placed there by a different stamp', () => {
    const grid = createVoxelGrid(1, 3, 3);
    setVoxel(grid, 0, 1, 1, 'minecraft:stone');
    const culled = cullComposedInterior(grid);
    expect(getVoxel(culled, 0, 1, 1)).toBe('minecraft:stone'); // fully exposed, never culled
  });

  it('leaves an already-sparse (thin, non-cube) shape untouched when nothing is fully buried', () => {
    // A single-voxel-thick plane — every voxel has at least one air neighbor (front/back), so
    // nothing should ever be culled.
    const grid = createVoxelGrid(1, 1, 3);
    setVoxel(grid, 0, 0, 1, 'minecraft:oak_planks');
    const culled = cullComposedInterior(grid);
    expect(getVoxel(culled, 0, 0, 1)).toBe('minecraft:oak_planks');
  });
});
