import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid, forEachVoxel, getVoxel, setVoxel } from '../voxel/voxelGrid';

/** One entry per cell face: which of a stamp's local coordinates marks that face's outer layer. */
const FACES: { axis: 0 | 1 | 2; side: 0 | 1; d: [number, number, number] }[] = [
  { axis: 0, side: 0, d: [-1, 0, 0] },
  { axis: 0, side: 1, d: [1, 0, 0] },
  { axis: 1, side: 0, d: [0, -1, 0] },
  { axis: 1, side: 1, d: [0, 1, 0] },
  { axis: 2, side: 0, d: [0, 0, -1] },
  { axis: 2, side: 1, d: [0, 0, 1] },
];

const isLeaves = (sourceBlockId: string | null) => sourceBlockId !== null && sourceBlockId.includes('leaves');

/**
 * Turns the solid canopy into a hollow one: only the leaves' outside skin is kept.
 *
 * Every source leaf block is voxelized on its own as a thin hollow box, so where two leaf blocks (or
 * a leaf and the trunk) touch, the canopy's inside is a honeycomb of partition walls, each one a
 * leaf block's own wall. This removes those walls: a leaf voxel is dropped when it sits on a face of
 * its block that touches another block, and kept when it also sits on a face that touches air (the
 * edges and corners of the outside skin). The trunk's own logs are never touched, so they show
 * through the opened canopy as the frame.
 *
 * `source` is the tree's block grid *before* interior culling (one cell per block, so a block hidden
 * deep inside the canopy still counts as a neighbour, and it names which blocks are leaves); `grid`
 * is the finished voxel grid at `resolution` voxels per block, holding palette-matched blocks.
 */
export function hollowLeafInterior(grid: VoxelGrid, source: VoxelGrid, resolution: number): VoxelGrid {
  const out = createVoxelGrid(grid.sizeX, grid.sizeY, grid.sizeZ);
  const last = resolution - 1;

  forEachVoxel(grid, (x, y, z, blockId) => {
    const cx = Math.floor(x / resolution);
    const cy = Math.floor(y / resolution);
    const cz = Math.floor(z / resolution);
    // `blockId` is the palette block the voxel was colour-matched to (a green concrete, a moss
    // block...), not the leaf it came from — whether this voxel belongs to a leaf comes from its
    // source cell.
    if (!isLeaves(getVoxel(source, cx, cy, cz))) {
      setVoxel(out, x, y, z, blockId);
      return;
    }
    const local = [x - cx * resolution, y - cy * resolution, z - cz * resolution];

    let touchesBlock = false;
    let touchesAir = false;
    for (const { axis, side, d } of FACES) {
      if (local[axis] !== (side === 0 ? 0 : last)) continue; // not on this face's outer layer
      if (getVoxel(source, cx + d[0], cy + d[1], cz + d[2]) !== null) touchesBlock = true;
      else touchesAir = true;
    }
    if (touchesBlock && !touchesAir) return; // an inside partition wall: drop it
    setVoxel(out, x, y, z, blockId);
  });

  return out;
}
