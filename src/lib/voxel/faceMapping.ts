import type { FaceName } from '../../types/minecraft';

export interface Voxel {
  x: number;
  y: number;
  z: number;
}

/** (u,v) grid coordinate on a face -> world (x,y,z) on the corresponding cube face. */
export function faceUvToWorld(face: FaceName, u: number, v: number, size: number): Voxel {
  const max = size - 1;
  switch (face) {
    case 'top':
      return { x: u, y: max, z: v };
    case 'bottom':
      return { x: u, y: 0, z: max - v };
    case 'north':
      return { x: max - u, y: max - v, z: 0 };
    case 'south':
      return { x: u, y: max - v, z: max };
    case 'west':
      return { x: 0, y: max - v, z: u };
    case 'east':
      return { x: max, y: max - v, z: max - u };
  }
}

/** Inverse of faceUvToWorld: world (x,y,z) on a given face -> that face's (u,v) grid coordinate. */
export function worldToFaceUv(face: FaceName, voxel: Voxel, size: number): { u: number; v: number } {
  const { x, y, z } = voxel;
  const max = size - 1;
  switch (face) {
    case 'top':
      return { u: x, v: z };
    case 'bottom':
      return { u: x, v: max - z };
    case 'north':
      return { u: max - x, v: max - y };
    case 'south':
      return { u: x, v: max - y };
    case 'west':
      return { u: z, v: max - y };
    case 'east':
      return { u: max - z, v: max - y };
  }
}

/** Whether a given face's grid "owns" (is defined at) this world voxel position. */
export function faceOwnsVoxel(face: FaceName, voxel: Voxel, size: number): boolean {
  const { x, y, z } = voxel;
  const max = size - 1;
  switch (face) {
    case 'top':
      return y === max;
    case 'bottom':
      return y === 0;
    case 'north':
      return z === 0;
    case 'south':
      return z === max;
    case 'west':
      return x === 0;
    case 'east':
      return x === max;
  }
}

export function isShellVoxel(voxel: Voxel, size: number): boolean {
  const { x, y, z } = voxel;
  const max = size - 1;
  return x === 0 || x === max || y === 0 || y === max || z === 0 || z === max;
}
