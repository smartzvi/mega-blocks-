import { describe, expect, it } from 'vitest';
import type { VoxelGrid } from '../../types/minecraft';
import { cullInteriorVoxels, isNonOccluding } from './cullInteriorVoxels';

function solidCube(size: number, id = 'minecraft:stone'): VoxelGrid {
  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < size; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < size; y++) {
      plane.push(new Array(size).fill(id));
    }
    voxels.push(plane);
  }
  return { sizeX: size, sizeY: size, sizeZ: size, voxels };
}

function countSolid(grid: VoxelGrid): number {
  let n = 0;
  for (let x = 0; x < grid.sizeX; x++)
    for (let y = 0; y < grid.sizeY; y++)
      for (let z = 0; z < grid.sizeZ; z++) if (grid.voxels[x][y][z] !== null) n++;
  return n;
}

describe('isNonOccluding', () => {
  it('matches doors, glass, fences, torches, etc.', () => {
    expect(isNonOccluding('minecraft:oak_door')).toBe(true);
    expect(isNonOccluding('minecraft:glass')).toBe(true);
    expect(isNonOccluding('minecraft:glass_pane')).toBe(true);
    expect(isNonOccluding('minecraft:oak_fence_gate')).toBe(true);
    expect(isNonOccluding('minecraft:torch')).toBe(true);
    expect(isNonOccluding('minecraft:iron_bars')).toBe(true);
  });

  it('does not match ordinary solid blocks', () => {
    expect(isNonOccluding('minecraft:stone')).toBe(false);
    expect(isNonOccluding('minecraft:oak_planks')).toBe(false);
    expect(isNonOccluding('minecraft:oak_log')).toBe(false);
  });

  it('strips a blockstate key\'s property suffix before matching, so a property value can never accidentally match', () => {
    expect(isNonOccluding('minecraft:oak_door[facing=north,half=lower,hinge=left,open=false]')).toBe(true);
    expect(isNonOccluding('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]')).toBe(false);
  });
});

describe('cullInteriorVoxels', () => {
  it('leaves only the outer shell of a fully solid cube, matching the known hollow-shell voxel count formula', () => {
    const grid = solidCube(7);
    const culled = cullInteriorVoxels(grid);
    // Same formula the existing hollow-shell tests use: n^3 - (n-2)^3 for the outer shell of an
    // n-cube. For n=7: 343 - 125 = 218.
    expect(countSolid(culled)).toBe(7 ** 3 - 5 ** 3);
    // Corner and edge voxels (on the structure's own boundary) always survive.
    expect(culled.voxels[0][0][0]).toBe('minecraft:stone');
    expect(culled.voxels[6][6][6]).toBe('minecraft:stone');
    // The dead center of a 7-cube (buried on all 6 sides) is culled.
    expect(culled.voxels[3][3][3]).toBeNull();
  });

  it('keeps walls facing a genuine interior air pocket (a room) exposed, not culled', () => {
    // A 5x5x5 solid block with a 1x1x1 air pocket carved out of its exact center.
    const grid = solidCube(5);
    grid.voxels[2][2][2] = null;
    const culled = cullInteriorVoxels(grid);
    // Every one of the 6 face-neighbors of the air pocket must survive culling (they're each now
    // exposed to real air, not fully buried).
    expect(culled.voxels[1][2][2]).toBe('minecraft:stone');
    expect(culled.voxels[3][2][2]).toBe('minecraft:stone');
    expect(culled.voxels[2][1][2]).toBe('minecraft:stone');
    expect(culled.voxels[2][3][2]).toBe('minecraft:stone');
    expect(culled.voxels[2][2][1]).toBe('minecraft:stone');
    expect(culled.voxels[2][2][3]).toBe('minecraft:stone');
  });

  it('keeps a wall exposed when a door/glass block (non-occluding) sits in it instead of real air, and never culls the door/glass itself', () => {
    // A 5x5x5 solid block with a door standing in for a genuine air pocket at the center — this
    // is the "doorway/window shouldn't brick up" case: the door itself is voxelized as an opaque
    // shape by buildStructureBlockStamp, but must never count as a solid neighbor for culling.
    const grid = solidCube(5);
    grid.voxels[2][2][2] = 'minecraft:oak_door';
    const culled = cullInteriorVoxels(grid);
    expect(culled.voxels[1][2][2]).toBe('minecraft:stone'); // wall facing the door stays exposed
    expect(culled.voxels[2][2][2]).toBe('minecraft:oak_door'); // the door itself is never culled
  });
});
