import type { VoxelGrid } from '../../types/minecraft';

/**
 * Shared accessors for VoxelGrid's sparse `voxels` map — every producer (parsers, rasterizers,
 * culling passes, tree generation) and consumer (rendering, export, material tally) goes through
 * these instead of touching the map's key format directly, so that format stays an implementation
 * detail. See VoxelGrid's own doc (types/minecraft.ts) for why sparse over a dense 3D array.
 */
function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function createVoxelGrid(sizeX: number, sizeY: number, sizeZ: number): VoxelGrid {
  return { sizeX, sizeY, sizeZ, voxels: new Map() };
}

export function getVoxel(grid: VoxelGrid, x: number, y: number, z: number): string | null {
  if (x < 0 || x >= grid.sizeX || y < 0 || y >= grid.sizeY || z < 0 || z >= grid.sizeZ) return null;
  return grid.voxels.get(cellKey(x, y, z)) ?? null;
}

/** `value: null` clears the cell (air) rather than storing a null entry — keeping the map's only
 *  entries the genuinely solid ones is what makes `.size` a true solid-voxel count and iteration
 *  cost proportional to real content instead of the bounding box. */
export function setVoxel(grid: VoxelGrid, x: number, y: number, z: number, value: string | null): void {
  const key = cellKey(x, y, z);
  if (value === null) grid.voxels.delete(key);
  else grid.voxels.set(key, value);
}

/** Shallow-clones a grid for a pass that mutates cells without touching the original (the same
 *  role `.map((plane) => plane.map((column) => column.slice()))` played for the old dense array). */
export function cloneVoxelGrid(grid: VoxelGrid): VoxelGrid {
  return { sizeX: grid.sizeX, sizeY: grid.sizeY, sizeZ: grid.sizeZ, voxels: new Map(grid.voxels) };
}

/** Iterates only the solid cells — for a sparse shape this is far cheaper than looping the full
 *  sizeX*sizeY*sizeZ bounding box and skipping air, which is what every rendering/export/tally
 *  consumer used to do back when the grid itself was a dense array. */
export function forEachVoxel(grid: VoxelGrid, callback: (x: number, y: number, z: number, blockId: string) => void): void {
  for (const [key, blockId] of grid.voxels) {
    const [x, y, z] = key.split(',').map(Number);
    callback(x, y, z, blockId);
  }
}

/** The real solid-voxel count — the map only ever holds solid cells (see setVoxel), so `.size` is
 *  exact with no filtering needed. This is what a resolution safety cap should be measured
 *  against instead of the bounding box, and what "how many blocks does this cost" actually means. */
export function countVoxels(grid: VoxelGrid): number {
  return grid.voxels.size;
}
