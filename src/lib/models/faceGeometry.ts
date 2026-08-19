import type { FaceName } from '../../types/minecraft';

/** Same priority assembleShell.ts uses for the cube shell, reused so a voxel exposed on more
 *  than one side (e.g. a corner of an element) picks its color the same deterministic way. */
export const FACE_PRIORITY: FaceName[] = ['top', 'bottom', 'north', 'south', 'east', 'west'];

export const NEIGHBOR_OFFSET: Record<FaceName, [number, number, number]> = {
  top: [0, 1, 0],
  bottom: [0, -1, 0],
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
};

export type Axis = 'x' | 'y' | 'z';

/** How a face's in-plane position maps to (u, v) inside its UV rect: texture v=0 is the top of
 *  the image, so every vertical side face flips y; top/bottom don't flip x/z. Mirrors the same
 *  convention lib/voxel/faceMapping.ts uses for the full cube shell. */
export const FACE_AXES: Record<FaceName, { uAxis: Axis; uFlip: boolean; vAxis: Axis; vFlip: boolean }> = {
  top: { uAxis: 'x', uFlip: false, vAxis: 'z', vFlip: false },
  bottom: { uAxis: 'x', uFlip: false, vAxis: 'z', vFlip: true },
  north: { uAxis: 'x', uFlip: true, vAxis: 'y', vFlip: true },
  south: { uAxis: 'x', uFlip: false, vAxis: 'y', vFlip: true },
  west: { uAxis: 'z', uFlip: false, vAxis: 'y', vFlip: true },
  east: { uAxis: 'z', uFlip: true, vAxis: 'y', vFlip: true },
};

export function axisValue(axis: Axis, x: number, y: number, z: number): number {
  return axis === 'x' ? x : axis === 'y' ? y : z;
}
