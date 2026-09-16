import type { MatchedFaces, VoxelGrid } from '../../types/minecraft';
import { faceOwnsVoxel, isShellVoxel, worldToFaceUv } from './faceMapping';
import { createVoxelGrid, setVoxel } from './voxelGrid';

// Top/bottom checked first (they win at every corner and every top/bottom edge), then the 4
// side faces in a fixed north > south > east > west order to resolve the 4 vertical edges
// (each vertical edge is owned by exactly one north/south face and one east/west face, and
// north/south always precede east/west in this list, so this single ordered scan implements
// the plan's full edge/corner priority rule without any special-casing).
const FACE_PRIORITY = ['top', 'bottom', 'north', 'south', 'east', 'west'] as const;

/**
 * Assembles the 6 per-face matched grids into a hollow shell voxel grid. The grid size is
 * inferred from the matched faces themselves (16 or 32) rather than passed separately, so it
 * can never drift out of sync with the actual per-face grids being assembled.
 */
export function assembleShell(matchedFaces: MatchedFaces): VoxelGrid {
  const size = matchedFaces.top.length;
  const grid = createVoxelGrid(size, size, size);

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        const voxel = { x, y, z };
        if (!isShellVoxel(voxel, size)) continue;
        const face = FACE_PRIORITY.find((f) => faceOwnsVoxel(f, voxel, size))!;
        const { u, v } = worldToFaceUv(face, voxel, size);
        setVoxel(grid, x, y, z, matchedFaces[face][v][u]);
      }
    }
  }

  return grid;
}
