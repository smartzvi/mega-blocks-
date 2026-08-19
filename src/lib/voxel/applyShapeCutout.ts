import type { BlockShape, FaceName, MatchedFaces, VoxelGrid } from '../../types/minecraft';
import { worldToFaceUv } from './faceMapping';

/**
 * Trims the assembled hollow-shell cube down to an approximation of a common partial-block
 * silhouette (slab/stair/door), for building megablock versions of those shapes instead of
 * only full cubes. These are deliberately simplified approximations of the real in-game
 * shapes, not pixel-perfect hitbox replicas — see the per-shape comments below for exactly
 * what's approximated and why.
 *
 * Every face's (u,v) mapping (see faceMapping.ts) depends on only the 2 axes spanning that
 * face, never the perpendicular one — e.g. 'top' is always (u=x, v=z) regardless of y. That
 * lets capCell() reuse a face's already-computed matched grid to fill in ANY plane
 * perpendicular to that face's axis, not just the cube's original boundary — which is exactly
 * what's needed to give a newly-exposed cut surface a sensible, non-air texture instead of
 * leaving it looking like a broken-open shell.
 */
export function applyShapeCutout(grid: VoxelGrid, matchedFaces: MatchedFaces, shape: BlockShape): VoxelGrid {
  if (shape === 'full_cube') return grid;

  const size = grid.sizeX; // block-mode grids are always cubic (sizeX === sizeY === sizeZ)
  const voxels = grid.voxels.map((plane) => plane.map((column) => column.slice()));

  switch (shape) {
    case 'slab':
      applySlab(voxels, matchedFaces, size);
      break;
    case 'stair':
      applyStair(voxels, matchedFaces, size);
      break;
    case 'door':
      applyDoor(voxels, matchedFaces, size);
      break;
  }

  return { sizeX: size, sizeY: size, sizeZ: size, voxels };
}

function capCell(
  voxels: (string | null)[][][],
  matchedFaces: MatchedFaces,
  face: FaceName,
  x: number,
  y: number,
  z: number,
  size: number
) {
  const { u, v } = worldToFaceUv(face, { x, y, z }, size);
  voxels[x][y][z] = matchedFaces[face][v][u];
}

/** Bottom slab: keep the lower half height, full footprint. Caps the new flat top with the
 *  original top-face grid so the cut looks like a proper flat slab surface, not a hollow rim. */
function applySlab(voxels: (string | null)[][][], matchedFaces: MatchedFaces, size: number) {
  const cutY = size / 2; // keep y in [0, cutY)

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      for (let y = cutY; y < size; y++) voxels[x][y][z] = null;
    }
  }

  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) capCell(voxels, matchedFaces, 'top', x, cutY - 1, z, size);
  }
}

/** Stair: a full-footprint bottom half slab plus a half-depth ("back half") upper block,
 *  forming an L-shaped side profile. Caps the newly exposed horizontal tread (top-face grid)
 *  and vertical riser (south-face grid) so both new surfaces read as solid, not hollow. */
function applyStair(voxels: (string | null)[][][], matchedFaces: MatchedFaces, size: number) {
  const cutY = size / 2;
  const cutZ = size / 2;

  for (let x = 0; x < size; x++) {
    for (let y = cutY; y < size; y++) {
      for (let z = cutZ; z < size; z++) voxels[x][y][z] = null;
    }
  }

  // Tread: the newly exposed horizontal surface over the front (z >= cutZ) half.
  for (let x = 0; x < size; x++) {
    for (let z = cutZ; z < size; z++) capCell(voxels, matchedFaces, 'top', x, cutY - 1, z, size);
  }

  // Riser: the newly exposed vertical surface over the back-top (y >= cutY) half.
  for (let x = 0; x < size; x++) {
    for (let y = cutY; y < size; y++) capCell(voxels, matchedFaces, 'south', x, y, cutZ - 1, size);
  }
}

/** Door: a thin (~1/8 depth), full-height panel narrowed to about half the block's width — a
 *  real door reads roughly twice as tall as it is wide, and since this tool always outputs a
 *  single size×size×size cube (one block's worth of space, full height is already the most
 *  "tall" this shape can be), narrowing the width is what actually makes the silhouette read as
 *  door-shaped instead of a flat square slab. Caps the newly exposed back plane (south grid) and
 *  the two newly exposed side cuts (west/east grids) so every new surface looks solid, not hollow.
 */
function applyDoor(voxels: (string | null)[][][], matchedFaces: MatchedFaces, size: number) {
  const cutZ = Math.max(1, Math.round(size / 8)); // keep z in [0, cutZ)
  const doorWidth = Math.max(1, Math.round(size / 2)); // keep x in [marginX, marginX + doorWidth)
  const marginX = Math.round((size - doorWidth) / 2);
  const xMax = marginX + doorWidth - 1; // inclusive

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      for (let z = 0; z < size; z++) {
        if (z >= cutZ || x < marginX || x > xMax) voxels[x][y][z] = null;
      }
    }
  }

  // Back: the newly exposed plane at the cut depth, within the narrowed width only.
  for (let x = marginX; x <= xMax; x++) {
    for (let y = 0; y < size; y++) capCell(voxels, matchedFaces, 'south', x, y, cutZ - 1, size);
  }

  // Sides: the two newly exposed vertical strips left by narrowing the width.
  for (let y = 0; y < size; y++) {
    for (let z = 0; z < cutZ; z++) {
      capCell(voxels, matchedFaces, 'west', marginX, y, z, size);
      capCell(voxels, matchedFaces, 'east', xMax, y, z, size);
    }
  }
}
