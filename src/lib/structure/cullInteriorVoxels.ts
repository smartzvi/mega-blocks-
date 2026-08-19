import type { VoxelGrid } from '../../types/minecraft';

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
];

export function isNonOccluding(blockId: string): boolean {
  // blockId may be a full blockstate key (Name[prop=val,...], see blockstateKey.ts) — strip the
  // property suffix first so a property *value* can never accidentally substring-match a pattern.
  const bareName = blockId.split('[')[0].replace('minecraft:', '');
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
  const { sizeX, sizeY, sizeZ, voxels } = grid;

  const isOccludingSolidAt = (x: number, y: number, z: number): boolean => {
    if (x < 0 || x >= sizeX || y < 0 || y >= sizeY || z < 0 || z >= sizeZ) return false;
    const id = voxels[x][y][z];
    return id !== null && !isNonOccluding(id);
  };

  const culled: (string | null)[][][] = [];
  for (let x = 0; x < sizeX; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < sizeY; y++) {
      const column: (string | null)[] = [];
      for (let z = 0; z < sizeZ; z++) {
        const id = voxels[x][y][z];
        if (id === null || isNonOccluding(id)) {
          column.push(id);
          continue;
        }
        const fullyBuried = NEIGHBOR_OFFSETS.every(([dx, dy, dz]) => isOccludingSolidAt(x + dx, y + dy, z + dz));
        column.push(fullyBuried ? null : id);
      }
      plane.push(column);
    }
    culled.push(plane);
  }

  return { sizeX, sizeY, sizeZ, voxels: culled };
}
