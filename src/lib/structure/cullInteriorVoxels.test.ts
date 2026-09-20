import { describe, expect, it } from 'vitest';
import type { VoxelGrid } from '../../types/minecraft';
import { cullInteriorVoxels, isNonOccluding } from './cullInteriorVoxels';
import { countVoxels, createVoxelGrid, getVoxel, setVoxel } from '../voxel/voxelGrid';

function solidCube(size: number, id = 'minecraft:stone'): VoxelGrid {
  const grid = createVoxelGrid(size, size, size);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) setVoxel(grid, x, y, z, id);
    }
  }
  return grid;
}

describe('isNonOccluding', () => {
  it('matches doors, glass, fences, torches, etc.', () => {
    expect(isNonOccluding('minecraft:oak_door')).toBe(true);
    expect(isNonOccluding('minecraft:glass')).toBe(true);
    expect(isNonOccluding('minecraft:glass_pane')).toBe(true);
    expect(isNonOccluding('minecraft:oak_fence_gate')).toBe(true);
    expect(isNonOccluding('minecraft:torch')).toBe(true);
    expect(isNonOccluding('minecraft:iron_bars')).toBe(true);
    expect(isNonOccluding('minecraft:redstone_wire[east=side,north=none,power=0,south=side,west=none]')).toBe(true);
  });

  it('matches the crops, plants, fences, walls and fixtures that sit on a block without covering it', () => {
    for (const name of [
      'wheat', 'carrots', 'potatoes', 'beetroots', 'pumpkin_stem', 'attached_melon_stem', 'candle', 'white_candle',
      'short_grass', 'tall_grass', 'fern', 'large_fern', 'oak_sapling', 'red_tulip', 'potted_poppy', 'oak_fence',
      'nether_brick_fence', 'cobblestone_wall', 'polished_deepslate_wall', 'repeater', 'comparator', 'vine',
      'cave_vines', 'lily_pad', 'pointed_dripstone', 'snow', 'nether_wart', 'brown_mushroom', 'red_mushroom',
      'cactus', 'poppy', 'dandelion', 'oxeye_daisy', 'dead_bush',
    ]) {
      expect(isNonOccluding(`minecraft:${name}`), name).toBe(true);
    }
  });

  it('keeps full blocks that merely share a name with those occluding (snow_block, *_block mushrooms, nether stems, wart block)', () => {
    for (const name of [
      'snow_block', 'powder_snow', 'nether_wart_block', 'red_mushroom_block', 'brown_mushroom_block', 'mushroom_stem',
      'crimson_stem', 'stripped_warped_stem', 'grass_block', 'hay_block', 'oak_stairs', 'oak_slab', 'water', 'lava',
    ]) {
      expect(isNonOccluding(`minecraft:${name}`), name).toBe(false);
    }
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
    expect(countVoxels(culled)).toBe(7 ** 3 - 5 ** 3);
    // Corner and edge voxels (on the structure's own boundary) always survive.
    expect(getVoxel(culled, 0, 0, 0)).toBe('minecraft:stone');
    expect(getVoxel(culled, 6, 6, 6)).toBe('minecraft:stone');
    // The dead center of a 7-cube (buried on all 6 sides) is culled.
    expect(getVoxel(culled, 3, 3, 3)).toBeNull();
  });

  it('keeps walls facing a genuine interior air pocket (a room) exposed, not culled', () => {
    // A 5x5x5 solid block with a 1x1x1 air pocket carved out of its exact center.
    const grid = solidCube(5);
    setVoxel(grid, 2, 2, 2, null);
    const culled = cullInteriorVoxels(grid);
    // Every one of the 6 face-neighbors of the air pocket must survive culling (they're each now
    // exposed to real air, not fully buried).
    expect(getVoxel(culled, 1, 2, 2)).toBe('minecraft:stone');
    expect(getVoxel(culled, 3, 2, 2)).toBe('minecraft:stone');
    expect(getVoxel(culled, 2, 1, 2)).toBe('minecraft:stone');
    expect(getVoxel(culled, 2, 3, 2)).toBe('minecraft:stone');
    expect(getVoxel(culled, 2, 2, 1)).toBe('minecraft:stone');
    expect(getVoxel(culled, 2, 2, 3)).toBe('minecraft:stone');
  });

  it('keeps a wall exposed when a door/glass block (non-occluding) sits in it instead of real air, and never culls the door/glass itself', () => {
    // A 5x5x5 solid block with a door standing in for a genuine air pocket at the center — this
    // is the "doorway/window shouldn't brick up" case: the door itself is voxelized as an opaque
    // shape by buildStructureBlockStamp, but must never count as a solid neighbor for culling.
    const grid = solidCube(5);
    setVoxel(grid, 2, 2, 2, 'minecraft:oak_door');
    const culled = cullInteriorVoxels(grid);
    expect(getVoxel(culled, 1, 2, 2)).toBe('minecraft:stone'); // wall facing the door stays exposed
    expect(getVoxel(culled, 2, 2, 2)).toBe('minecraft:oak_door'); // the door itself is never culled
  });
});

describe('cullInteriorVoxels next to stairs and slabs', () => {
  // A 5x5x5 stone cube whose center block (2,2,2) is fully buried — except that one neighbor is
  // replaced by a stair/slab. Returns whether the center block survived culling.
  const centerSurvives = (neighbor: [number, number, number], id: string): boolean => {
    const grid = solidCube(5);
    setVoxel(grid, neighbor[0], neighbor[1], neighbor[2], id);
    return getVoxel(cullInteriorVoxels(grid), 2, 2, 2) !== null;
  };
  const EAST: [number, number, number] = [3, 2, 2];
  const ABOVE: [number, number, number] = [2, 3, 2];
  const BELOW: [number, number, number] = [2, 1, 2];

  it('culls the block when a straight stair\'s back face (its facing side) is toward it, but keeps it when the stepped side is', () => {
    // The stair is EAST of the block, so its face toward the block is "west".
    expect(centerSurvives(EAST, 'minecraft:oak_stairs[facing=west,half=bottom,shape=straight]')).toBe(false);
    expect(centerSurvives(EAST, 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]')).toBe(true); // stepped front
    expect(centerSurvives(EAST, 'minecraft:oak_stairs[facing=north,half=bottom,shape=straight]')).toBe(true); // L-shaped side
  });

  it('keeps the block beside a corner stair, whose back face is not a full square', () => {
    expect(centerSurvives(EAST, 'minecraft:oak_stairs[facing=west,half=bottom,shape=outer_left]')).toBe(true);
    expect(centerSurvives(EAST, 'minecraft:oak_stairs[facing=west,half=bottom,shape=inner_right]')).toBe(true);
  });

  it('a stair above covers the block only when it is a bottom-half stair (full underside); an upside-down stair does not', () => {
    expect(centerSurvives(ABOVE, 'minecraft:oak_stairs[facing=north,half=bottom,shape=straight]')).toBe(false);
    expect(centerSurvives(ABOVE, 'minecraft:oak_stairs[facing=north,half=top,shape=straight]')).toBe(true);
  });

  it('a stair below covers the block only when it is an upside-down stair (full top)', () => {
    expect(centerSurvives(BELOW, 'minecraft:oak_stairs[facing=north,half=top,shape=straight]')).toBe(false);
    expect(centerSurvives(BELOW, 'minecraft:oak_stairs[facing=north,half=bottom,shape=straight]')).toBe(true);
  });

  it('a slab above covers the block only as a bottom slab; a slab below only as a top slab; a double slab always', () => {
    expect(centerSurvives(ABOVE, 'minecraft:oak_slab[type=bottom]')).toBe(false);
    expect(centerSurvives(ABOVE, 'minecraft:oak_slab[type=top]')).toBe(true);
    expect(centerSurvives(BELOW, 'minecraft:oak_slab[type=top]')).toBe(false);
    expect(centerSurvives(BELOW, 'minecraft:oak_slab[type=bottom]')).toBe(true);
    expect(centerSurvives(EAST, 'minecraft:oak_slab[type=double]')).toBe(false);
  });

  it('a half slab beside the block never covers its side', () => {
    expect(centerSurvives(EAST, 'minecraft:oak_slab[type=bottom]')).toBe(true);
    expect(centerSurvives(EAST, 'minecraft:oak_slab[type=top]')).toBe(true);
  });

  it('a stair or slab in the same cube as plain stone does not change plain-cube culling', () => {
    const grid = solidCube(5);
    setVoxel(grid, 0, 0, 0, 'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]'); // a corner, on the boundary anyway
    expect(getVoxel(cullInteriorVoxels(grid), 2, 2, 2)).toBeNull();
  });
});
