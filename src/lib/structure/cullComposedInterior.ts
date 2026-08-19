import type { VoxelGrid } from '../../types/minecraft';

/**
 * Final pass over the fully composed, fully voxelized grid: nulls out any solid voxel whose all 6
 * real face-neighbors are also solid. Unlike cullInteriorVoxels.ts (which runs on the cheap SOURCE
 * grid *before* voxelization, reasoning about whole un-voxelized blocks and needing a non-occluding
 * pattern allowlist since it can't see real shape yet), this runs after every block has been
 * voxelized into its true per-voxel shape — a door's thin panel, a stair's step — so presence or
 * absence of a voxel already reflects the real geometry, and "all 6 neighbors present" unambiguously
 * means "never visible from any angle." No pattern-based exceptions are needed here.
 *
 * This specifically fixes a seam buildStructureBlockStamp.ts's per-block-in-isolation design leaves
 * behind: two adjacent blocks are each voxelized with no knowledge of their real neighbors, so where
 * they touch, each one's own outer shell still shows its own wall facing the other — e.g. a stair
 * sitting next to a flat plank block draws its own full boundary layer right up against the plank's
 * boundary layer, doubling the wall thickness at that seam instead of merging into one skin. Running
 * this after composition merges any such touching walls that turn out to be fully interior once real
 * neighbors are known, without changing anything visible from outside.
 */
export function cullComposedInterior(grid: VoxelGrid): VoxelGrid {
  const { sizeX, sizeY, sizeZ, voxels } = grid;

  const isSolidAt = (x: number, y: number, z: number): boolean =>
    x >= 0 && x < sizeX && y >= 0 && y < sizeY && z >= 0 && z < sizeZ && voxels[x][y][z] !== null;

  const culled: (string | null)[][][] = [];
  for (let x = 0; x < sizeX; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < sizeY; y++) {
      const column: (string | null)[] = [];
      for (let z = 0; z < sizeZ; z++) {
        const id = voxels[x][y][z];
        if (id === null) {
          column.push(null);
          continue;
        }
        const fullyBuried =
          isSolidAt(x + 1, y, z) &&
          isSolidAt(x - 1, y, z) &&
          isSolidAt(x, y + 1, z) &&
          isSolidAt(x, y - 1, z) &&
          isSolidAt(x, y, z + 1) &&
          isSolidAt(x, y, z - 1);
        column.push(fullyBuried ? null : id);
      }
      plane.push(column);
    }
    culled.push(plane);
  }

  return { sizeX, sizeY, sizeZ, voxels: culled };
}
