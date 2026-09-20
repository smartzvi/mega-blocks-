import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid, forEachVoxel, getVoxel, setVoxel } from '../voxel/voxelGrid';

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

const NEIGHBOR_OFFSETS: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Culls (nulls out) any solid, occluding voxel whose all 6 face-neighbors are also solid and
 * occluding. This is exact, not an approximation: if every rendered block is an opaque,
 * uniformly-filled cube (true for everything except the non-occluding set above), then a source
 * block fully surrounded by other opaque blocks has every one of its upscaled sub-voxels fully
 * interior too, with no exceptions — so culling at this cheap source-grid resolution, before
 * upscaling, produces exactly the same visible result as culling the far more expensive upscaled
 * grid would. Real air pockets (rooms, doorways) stay intact because walls facing genuine air (or
 * a non-occluding block like a door/window) keep an exposed face and are never culled. Voxels on
 * the structure's own outer boundary are also never culled (an out-of-bounds neighbor never
 * counts as solid), since that's the visible outer shell.
 */
export function cullInteriorVoxels(grid: VoxelGrid): VoxelGrid {
  const { sizeX, sizeY, sizeZ } = grid;

  const isOccludingSolidAt = (x: number, y: number, z: number): boolean => {
    const id = getVoxel(grid, x, y, z);
    return id !== null && !isNonOccluding(id);
  };

  const culled = createVoxelGrid(sizeX, sizeY, sizeZ);
  forEachVoxel(grid, (x, y, z, id) => {
    if (isNonOccluding(id)) {
      setVoxel(culled, x, y, z, id);
      return;
    }
    const fullyBuried = NEIGHBOR_OFFSETS.every(([dx, dy, dz]) => isOccludingSolidAt(x + dx, y + dy, z + dz));
    if (!fullyBuried) setVoxel(culled, x, y, z, id);
  });

  return culled;
}
