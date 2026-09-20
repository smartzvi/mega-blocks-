import { describe, expect, it } from 'vitest';
import { applyConnectionMode, connectionFamily, forcedConnectionProperties, itemConnectionProperties } from './connections';
import { decodeBlockstateKey, encodeBlockstateKey } from './blockstateKey';
import { createVoxelGrid, getVoxel, setVoxel } from '../voxel/voxelGrid';

function gridWith(cells: Array<[number, number, number, string]>) {
  const grid = createVoxelGrid(8, 8, 8);
  const blockIds = new Set<string>();
  for (const [x, y, z, key] of cells) {
    setVoxel(grid, x, y, z, key);
    blockIds.add(key);
  }
  return { grid, blockIds };
}

const fence = (props: Record<string, string> = {}) => encodeBlockstateKey('minecraft:oak_fence', { north: 'false', east: 'false', south: 'false', west: 'false', ...props });
const pane = (props: Record<string, string> = {}) => encodeBlockstateKey('minecraft:glass_pane', { north: 'false', east: 'false', south: 'false', west: 'false', ...props });
const wall = (props: Record<string, string> = {}) =>
  encodeBlockstateKey('minecraft:cobblestone_wall', { north: 'none', east: 'none', south: 'none', west: 'none', up: 'true', ...props });
const propsAt = (grid: ReturnType<typeof createVoxelGrid>, x: number, y: number, z: number) => decodeBlockstateKey(getVoxel(grid, x, y, z)!).properties;

describe('connectionFamily', () => {
  it('recognizes fences, panes/bars, walls and redstone wire, and nothing else', () => {
    expect(connectionFamily('minecraft:oak_fence')).toBe('fence');
    expect(connectionFamily('minecraft:nether_brick_fence')).toBe('fence');
    expect(connectionFamily('minecraft:glass_pane[north=true]')).toBe('pane');
    expect(connectionFamily('minecraft:white_stained_glass_pane')).toBe('pane');
    expect(connectionFamily('minecraft:iron_bars')).toBe('pane');
    expect(connectionFamily('minecraft:copper_bars')).toBe('pane');
    expect(connectionFamily('minecraft:cobblestone_wall')).toBe('wall');
    expect(connectionFamily('minecraft:redstone_wire')).toBe('wire');
    expect(connectionFamily('minecraft:oak_fence_gate')).toBeNull();
    expect(connectionFamily('minecraft:oak_wall_sign')).toBeNull();
    expect(connectionFamily('minecraft:stone')).toBeNull();
  });
});

describe('forced connection properties', () => {
  it('builds per-family all-connected and all-open sets', () => {
    expect(forcedConnectionProperties('fence', 'all')).toEqual({ north: 'true', east: 'true', south: 'true', west: 'true' });
    expect(forcedConnectionProperties('pane', 'none')).toEqual({ north: 'false', east: 'false', south: 'false', west: 'false' });
    expect(forcedConnectionProperties('wall', 'all')).toEqual({ north: 'low', east: 'low', south: 'low', west: 'low', up: 'true' });
    expect(forcedConnectionProperties('wall', 'none')).toEqual({ north: 'none', east: 'none', south: 'none', west: 'none', up: 'true' });
    expect(forcedConnectionProperties('wire', 'all')).toEqual({ north: 'side', east: 'side', south: 'side', west: 'side' });
  });

  it('gives item mode properties only for the two forced modes and only for connecting blocks', () => {
    expect(itemConnectionProperties('oak_fence', 'all')).toEqual({ north: 'true', east: 'true', south: 'true', west: 'true' });
    expect(itemConnectionProperties('oak_fence', 'stored')).toBeUndefined();
    expect(itemConnectionProperties('oak_fence', 'auto')).toBeUndefined();
    expect(itemConnectionProperties('stone', 'all')).toBeUndefined();
  });
});

describe('applyConnectionMode', () => {
  it("'stored' leaves everything untouched", () => {
    const key = fence({ north: 'true' });
    const { grid, blockIds } = gridWith([[3, 1, 3, key]]);
    applyConnectionMode(grid, blockIds, 'stored');
    expect(getVoxel(grid, 3, 1, 3)).toBe(key);
  });

  it("'all' and 'none' force every side regardless of neighbors, and register the new keys", () => {
    const { grid, blockIds } = gridWith([[3, 1, 3, pane()]]);
    applyConnectionMode(grid, blockIds, 'all');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'true', east: 'true', south: 'true', west: 'true' });
    expect(blockIds.has(getVoxel(grid, 3, 1, 3)!)).toBe(true);

    applyConnectionMode(grid, blockIds, 'none');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'false', east: 'false', south: 'false', west: 'false' });
  });

  it('keeps unrelated properties such as waterlogged when rewriting', () => {
    const { grid, blockIds } = gridWith([[3, 1, 3, fence({ waterlogged: 'true' })]]);
    applyConnectionMode(grid, blockIds, 'all');
    expect(propsAt(grid, 3, 1, 3).waterlogged).toBe('true');
  });

  it('auto: a fence connects to a full block and to another fence, not to air or a plant', () => {
    const { grid, blockIds } = gridWith([
      [3, 1, 3, fence()],
      [3, 1, 2, 'minecraft:stone_bricks'], // north: full block
      [4, 1, 3, fence()], // east: fence
      [3, 1, 4, 'minecraft:poppy'], // south: plant
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'true', east: 'true', south: 'false', west: 'false' });
  });

  it('auto: snow blocks and grass blocks are full blocks; snow layers, leaves and slabs are not', () => {
    const { grid, blockIds } = gridWith([
      [3, 1, 3, fence()],
      [3, 1, 2, 'minecraft:snow_block'],
      [4, 1, 3, 'minecraft:grass_block'],
      [3, 1, 4, 'minecraft:oak_leaves'],
      [2, 1, 3, 'minecraft:oak_slab[type=bottom]'],
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'true', east: 'true', south: 'false', west: 'false' });
  });

  it('auto: a fence connects to a stair only by its back face, and to a double slab but not a half slab', () => {
    // A stair's `facing` points at what its high back side faces: it connects when that is toward the fence.
    const { grid, blockIds } = gridWith([
      [3, 1, 3, fence()],
      [3, 1, 2, 'minecraft:oak_stairs[facing=south,half=bottom,shape=straight]'], // north neighbor, back toward fence
      [4, 1, 3, 'minecraft:oak_stairs[facing=north,half=bottom,shape=straight]'], // east neighbor, back away from fence
      [3, 1, 4, 'minecraft:oak_slab[type=double]'],
      [2, 1, 3, 'minecraft:oak_slab[type=bottom]'],
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'true', east: 'false', south: 'true', west: 'false' });
  });

  it('auto: nether brick fences only join nether brick fences, wooden ones only wooden ones', () => {
    const nether = encodeBlockstateKey('minecraft:nether_brick_fence', { north: 'false', east: 'false', south: 'false', west: 'false' });
    const { grid, blockIds } = gridWith([
      [3, 1, 3, fence()],
      [3, 1, 2, nether],
      [4, 1, 3, fence()],
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'false', east: 'true' });
  });

  it('auto: a fence gate connects only when its opening axis is perpendicular to the connection', () => {
    const { grid, blockIds } = gridWith([
      [3, 1, 3, fence()],
      [4, 1, 3, 'minecraft:oak_fence_gate[facing=north]'], // east neighbor, gate faces north/south: perpendicular to east
      [3, 1, 4, 'minecraft:oak_fence_gate[facing=north]'], // south neighbor, same gate axis: parallel, no connection
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ east: 'true', south: 'false' });
  });

  it('auto: panes join panes and full blocks but never walls or fence gates', () => {
    const { grid, blockIds } = gridWith([
      [3, 1, 3, pane()],
      [3, 1, 2, pane()],
      [4, 1, 3, wall()],
      [3, 1, 4, 'minecraft:oak_fence_gate[facing=east]'],
      [2, 1, 3, 'minecraft:stone'],
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'true', east: 'false', south: 'false', west: 'true' });
  });

  it('auto: walls join walls, gates and full blocks but not fences or panes', () => {
    const { grid, blockIds } = gridWith([
      [3, 1, 3, wall()],
      [3, 1, 2, wall()],
      [4, 1, 3, fence()],
      [2, 1, 3, pane()],
      [3, 1, 4, 'minecraft:stone'],
    ]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'low', east: 'none', west: 'none', south: 'low' });
  });

  it('auto walls: a straight run has no post, an end/corner/isolated wall does', () => {
    const straight = gridWith([[3, 1, 3, wall()], [3, 1, 2, wall()], [3, 1, 4, wall()]]);
    applyConnectionMode(straight.grid, straight.blockIds, 'auto');
    expect(propsAt(straight.grid, 3, 1, 3).up).toBe('false');
    expect(propsAt(straight.grid, 3, 1, 2).up).toBe('true'); // end of the run
    const lone = gridWith([[3, 1, 3, wall({ up: 'false' })]]);
    applyConnectionMode(lone.grid, lone.blockIds, 'auto');
    expect(propsAt(lone.grid, 3, 1, 3).up).toBe('true');
    const corner = gridWith([[3, 1, 3, wall()], [3, 1, 2, wall()], [4, 1, 3, wall()]]);
    applyConnectionMode(corner.grid, corner.blockIds, 'auto');
    expect(propsAt(corner.grid, 3, 1, 3).up).toBe('true');
  });

  it('auto walls: a full block above makes connected sides tall; a torch above keeps them low but raises the post', () => {
    const covered = gridWith([[3, 1, 3, wall()], [3, 1, 2, wall()], [3, 1, 4, wall()], [3, 2, 3, 'minecraft:stone']]);
    applyConnectionMode(covered.grid, covered.blockIds, 'auto');
    expect(propsAt(covered.grid, 3, 1, 3)).toMatchObject({ north: 'tall', south: 'tall', up: 'false' }); // a solid block above does not force the post

    const torch = gridWith([[3, 1, 3, wall()], [3, 1, 2, wall()], [3, 1, 4, wall()], [3, 2, 3, 'minecraft:torch']]);
    applyConnectionMode(torch.grid, torch.blockIds, 'auto');
    expect(propsAt(torch.grid, 3, 1, 3)).toMatchObject({ north: 'low', south: 'low', up: 'true' });
  });

  it('auto: redstone wire keeps its saved connections', () => {
    const key = encodeBlockstateKey('minecraft:redstone_wire', { north: 'side', east: 'none', south: 'none', west: 'none', power: '3' });
    const { grid, blockIds } = gridWith([[3, 1, 3, key]]);
    applyConnectionMode(grid, blockIds, 'auto');
    expect(getVoxel(grid, 3, 1, 3)).toBe(key);
  });

  it("'all' also forces redstone wire's sides, keeping its power", () => {
    const key = encodeBlockstateKey('minecraft:redstone_wire', { north: 'none', east: 'none', south: 'none', west: 'none', power: '7' });
    const { grid, blockIds } = gridWith([[3, 1, 3, key]]);
    applyConnectionMode(grid, blockIds, 'all');
    expect(propsAt(grid, 3, 1, 3)).toMatchObject({ north: 'side', east: 'side', south: 'side', west: 'side', power: '7' });
  });

  it('does not touch blocks outside the four families', () => {
    const { grid, blockIds } = gridWith([[3, 1, 3, 'minecraft:oak_stairs[facing=east]']]);
    applyConnectionMode(grid, blockIds, 'all');
    expect(getVoxel(grid, 3, 1, 3)).toBe('minecraft:oak_stairs[facing=east]');
  });
});
