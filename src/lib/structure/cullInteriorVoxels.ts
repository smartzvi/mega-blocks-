import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid, forEachVoxel, getVoxel, setVoxel } from '../voxel/voxelGrid';
import { decodeBlockstateKey } from './blockstateKey';

/**
 * Block IDs matching any of these substrings never count as a solid neighbor for culling
 * purposes, and are excluded from being culled themselves. Every other block gets voxelized as an
 * opaque, uniformly-filled shape (buildStructureBlockStamp.ts — the real model where resolvable,
 * else a flat matched color, never a see-through cutout), which is exactly the property that
 * makes source-grid interior culling geometrically exact rather than approximate. Doors,
 * trapdoors, fence gates, glass, iron bars, ladders, signs, banners, torches, lanterns, buttons,
 * pressure plates, and carpets break that property (they're thin/see-through in the real game),
 * so treating them as solid would brick up doorways and windows once the neighbor-exposure check
 * (correctly) leaves the walls around them alone. This is a required correctness fix, not
 * optional polish — real village/outpost structures use these constantly.
 */
const NON_OCCLUDING_PATTERNS = [
  'door',
  'trapdoor',
  'fence_gate',
  'glass',
  'iron_bars',
  'ladder',
  'sign',
  'banner',
  'torch',
  'lantern',
  'button',
  'pressure_plate',
  'carpet',
  // A flat film on top of a block: counting it as solid deleted the block underneath it (39 of 52
  // supports in ancient_city/city_center_3), leaving the wire floating over a hole.
  'redstone_wire',
  // More things that sit ON a block without covering it. A scan of every bundled structure found
  // 865 blocks deleted from under exactly these (wheat 186, candles 135, short grass 74, snow
  // layers 71, fences 78, repeaters/comparators 48, stems 45, walls 43, ...), leaving a crop,
  // post or plant floating over a hole. Only patterns that can't also match a full block are
  // here; the ones that can (snow vs snow_block, ...) are in NON_OCCLUDING_EXACT below.
  'wheat',
  'carrots',
  'potatoes',
  'beetroots',
  '_stem', // melon/pumpkin stems and attached_* — but not crimson/warped stems, see isNonOccluding
  'candle',
  'short_grass',
  'tall_grass',
  'fern',
  'sapling',
  'tulip',
  'potted_',
  'fence', // plain fences too, not just gates
  '_wall', // cobblestone_wall, brick_wall, ... (wall_torch/_wall_sign were already covered)
  'repeater',
  'comparator',
  'vine',
  'lily_pad',
  'pointed_dripstone',
];

// Names that would also match a full block as a substring (snow_block, nether_wart_block,
// red_mushroom_block, ...), so they are matched whole instead.
const NON_OCCLUDING_EXACT = new Set([
  'snow',
  'nether_wart',
  'brown_mushroom',
  'red_mushroom',
  'cactus',
  'poppy',
  'dandelion',
  'oxeye_daisy',
  'dead_bush',
]);

// `_stem` also ends the full blocks crimson_stem/warped_stem (and their stripped forms) and
// mushroom_stem, which must keep occluding.
const FULL_STEM_BLOCKS = /(^|_)(crimson|warped|mushroom)_stem$/;

export function isNonOccluding(blockId: string): boolean {
  // blockId may be a full blockstate key (Name[prop=val,...], see blockstateKey.ts) — strip the
  // property suffix first so a property *value* can never accidentally substring-match a pattern.
  const bareName = blockId.split('[')[0].replace('minecraft:', '');
  if (NON_OCCLUDING_EXACT.has(bareName)) return true;
  if (FULL_STEM_BLOCKS.test(bareName)) return false;
  return NON_OCCLUDING_PATTERNS.some((pattern) => bareName.includes(pattern));
}

type Face = 'up' | 'down' | 'north' | 'south' | 'east' | 'west';

// Offset to a neighbor, plus which face of THAT neighbor points back at the block being tested.
const NEIGHBORS: { offset: [number, number, number]; faceTowardBlock: Face }[] = [
  { offset: [1, 0, 0], faceTowardBlock: 'west' },
  { offset: [-1, 0, 0], faceTowardBlock: 'east' },
  { offset: [0, 1, 0], faceTowardBlock: 'down' },
  { offset: [0, -1, 0], faceTowardBlock: 'up' },
  { offset: [0, 0, 1], faceTowardBlock: 'north' },
  { offset: [0, 0, -1], faceTowardBlock: 'south' },
];

/**
 * Whether `id`'s face pointing at a neighboring block is a FULL square, i.e. actually hides that
 * neighbor's face. Every occluding block is treated as a full cube except stairs and slabs, which
 * are only full on some faces:
 * - a stair is full on its bottom (half=bottom) or top (half=top) face, and on its back — the
 *   `facing` side — when its shape is straight; its other faces are stepped or L-shaped, so part
 *   of a block behind them is still visible;
 * - a slab is full on its bottom face (type=bottom), top face (type=top), or every face (double).
 * Face directions checked against the game's own saved data (a fence connects to a stair only by
 * its back face, and to a double slab but not a half slab).
 */
function coversFace(id: string, face: Face): boolean {
  const bare = id.split('[')[0];
  const isStair = bare.endsWith('_stairs');
  if (!isStair && !bare.endsWith('_slab')) return true;
  const { properties } = decodeBlockstateKey(id);
  if (isStair) {
    if (face === 'down') return properties.half === 'bottom';
    if (face === 'up') return properties.half === 'top';
    return properties.shape === 'straight' && properties.facing === face;
  }
  if (properties.type === 'double') return true;
  if (face === 'down') return properties.type === 'bottom';
  if (face === 'up') return properties.type === 'top';
  return false;
}

/**
 * Culls (nulls out) any solid, occluding voxel whose 6 faces are all hidden by a neighbor that is
 * solid, occluding, and actually covers that face. For plain cubes this is exact: if every
 * rendered block is an opaque, uniformly-filled cube, a source block fully surrounded by other
 * opaque blocks has every one of its upscaled sub-voxels fully interior too, so culling at this
 * cheap source-grid resolution, before upscaling, produces exactly the same visible result as
 * culling the far more expensive upscaled grid would. Stairs and slabs are NOT full cubes — a
 * block beside a stair's stepped side, or under an upside-down stair, is still partly visible —
 * so `coversFace` checks the specific face of a stair/slab that touches the block. Before that
 * check, 1,720 of the 4,542 blocks culled next to a stair or slab in the bundled structures were
 * really partly exposed (leaving a cavity behind the step); the other 2,822, whose neighbor does
 * cover the face, are still culled. Real air pockets (rooms, doorways) stay intact because walls
 * facing genuine air (or a non-occluding block like a door/window) keep an exposed face and are
 * never culled. Voxels on the structure's own outer boundary are also never culled (an
 * out-of-bounds neighbor never counts as solid), since that's the visible outer shell.
 */
export function cullInteriorVoxels(grid: VoxelGrid): VoxelGrid {
  const { sizeX, sizeY, sizeZ } = grid;

  const hidesFace = (x: number, y: number, z: number, faceTowardBlock: Face): boolean => {
    const id = getVoxel(grid, x, y, z);
    return id !== null && !isNonOccluding(id) && coversFace(id, faceTowardBlock);
  };

  const culled = createVoxelGrid(sizeX, sizeY, sizeZ);
  forEachVoxel(grid, (x, y, z, id) => {
    if (isNonOccluding(id)) {
      setVoxel(culled, x, y, z, id);
      return;
    }
    const fullyBuried = NEIGHBORS.every(({ offset: [dx, dy, dz], faceTowardBlock }) => hidesFace(x + dx, y + dy, z + dz, faceTowardBlock));
    if (!fullyBuried) setVoxel(culled, x, y, z, id);
  });

  return culled;
}
