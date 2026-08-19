import type { FaceName } from '../../types/minecraft';
import type { BlockModelElement } from '../../types/item';

export type YRotation = 0 | 90 | 180 | 270;

// Rotating the block clockwise (viewed from above) by this many degrees moves whatever was
// pointing in the "from" direction to point in the "to" direction — e.g. at 90° the face that
// used to point north now points east. Top/bottom are on the rotation axis, unaffected.
const FACE_ROTATION_MAP: Record<YRotation, Record<FaceName, FaceName>> = {
  0: { top: 'top', bottom: 'bottom', north: 'north', east: 'east', south: 'south', west: 'west' },
  90: { top: 'top', bottom: 'bottom', north: 'east', east: 'south', south: 'west', west: 'north' },
  180: { top: 'top', bottom: 'bottom', north: 'south', east: 'west', south: 'north', west: 'east' },
  270: { top: 'top', bottom: 'bottom', north: 'west', east: 'north', south: 'east', west: 'south' },
};

/** Rotates a single (x, z) point clockwise (viewed from above) around the block center (8, 8)
 *  by a multiple of 90°. Standard vanilla blockstate "y" rotation convention. */
function rotatePointY(x: number, z: number, degrees: YRotation): [number, number] {
  switch (degrees) {
    case 0:
      return [x, z];
    case 90:
      return [z, 16 - x];
    case 180:
      return [16 - x, 16 - z];
    case 270:
      return [16 - z, x];
  }
}

/**
 * Rotates an element around the vertical (Y) axis by a multiple of 90°, per the blockstate
 * "y" rotation used pervasively by facing-dependent blocks (ladder, fence sides, repeater, ...).
 *
 * "uvlock" (keeping a texture visually static across rotation instead of rotating with the
 * geometry) is not implemented — textures rotate along with their face, which is vanilla's
 * default (non-uvlock) behavior and good enough for a recognizable megablock.
 */
export function rotateElementY(element: BlockModelElement, degrees: YRotation): BlockModelElement {
  if (degrees === 0) return element;

  const [fx, fy, fz] = element.from;
  const [tx, ty, tz] = element.to;
  const [rfx, rfz] = rotatePointY(fx, fz, degrees);
  const [rtx, rtz] = rotatePointY(tx, tz, degrees);

  const from: [number, number, number] = [Math.min(rfx, rtx), fy, Math.min(rfz, rtz)];
  const to: [number, number, number] = [Math.max(rfx, rtx), ty, Math.max(rfz, rtz)];

  const faceMap = FACE_ROTATION_MAP[degrees];
  const faces: BlockModelElement['faces'] = {};
  for (const [key, def] of Object.entries(element.faces)) {
    if (!def) continue;
    faces[faceMap[key as FaceName]] = def;
  }

  return { from, to, faces };
}

/** Rotates a single (y, z) point clockwise (viewed from the east, looking toward -X) around the
 *  block center (8, 8) by a multiple of 90°. Standard vanilla blockstate "x" rotation convention —
 *  the axis east/west sits on stays fixed. Derived (not guessed) by tracking where the bottom/top/
 *  north/south face *planes* land under this same coordinate transform (see rotateElementX below):
 *  e.g. at 90°, every point with y=0 (the "bottom" face) maps to z'=16 (landing on "south"). */
function rotatePointX(y: number, z: number, degrees: YRotation): [number, number] {
  switch (degrees) {
    case 0:
      return [y, z];
    case 90:
      return [z, 16 - y];
    case 180:
      return [16 - y, 16 - z];
    case 270:
      return [16 - z, y];
  }
}

const FACE_ROTATION_MAP_X: Record<YRotation, Record<FaceName, FaceName>> = {
  0: { top: 'top', bottom: 'bottom', north: 'north', south: 'south', east: 'east', west: 'west' },
  90: { top: 'north', bottom: 'south', north: 'bottom', south: 'top', east: 'east', west: 'west' },
  180: { top: 'bottom', bottom: 'top', north: 'south', south: 'north', east: 'east', west: 'west' },
  270: { top: 'south', bottom: 'north', north: 'top', south: 'bottom', east: 'east', west: 'west' },
};

/**
 * Rotates an element around the east-west (X) axis by a multiple of 90°, per the blockstate "x"
 * rotation — used far less often than "y", but not rare enough to skip: every "half=top" stair
 * variant (a real stair placed upside-down, extremely common for roof eaves/overhangs) applies
 * `x: 180` to flip a normal "half=bottom" stair's step from the top of the block to the bottom.
 * Skipping this made every upside-down roof stair render as a right-side-up one instead — visibly
 * wrong (a solid-looking block instead of an inverted step) exactly where real village roofs use
 * this constantly. 180° is direction-unambiguous (a half-turn looks the same either way); 90°/270°
 * matter far less in practice (the only common user is a horizontal log, which renders as an
 * identical-looking full cube regardless of which way "sideways" points).
 */
export function rotateElementX(element: BlockModelElement, degrees: YRotation): BlockModelElement {
  if (degrees === 0) return element;

  const [fx, fy, fz] = element.from;
  const [tx, ty, tz] = element.to;
  const [rfy, rfz] = rotatePointX(fy, fz, degrees);
  const [rty, rtz] = rotatePointX(ty, tz, degrees);

  const from: [number, number, number] = [fx, Math.min(rfy, rty), Math.min(rfz, rtz)];
  const to: [number, number, number] = [tx, Math.max(rfy, rty), Math.max(rfz, rtz)];

  const faceMap = FACE_ROTATION_MAP_X[degrees];
  const faces: BlockModelElement['faces'] = {};
  for (const [key, def] of Object.entries(element.faces)) {
    if (!def) continue;
    faces[faceMap[key as FaceName]] = def;
  }

  return { from, to, faces };
}

/** Shifts an element up (or down) by `dy` model-space units, leaving X/Z untouched. Used to
 *  stack a resolved "upper half" model on top of a "lower half" one (each half's own model JSON
 *  is authored in its own local 0-16 space, as if it were a standalone single block) so the
 *  combined result occupies 0-16 (lower) and 16-32 (upper) — one continuous 2-block-tall shape. */
export function shiftElementY(element: BlockModelElement, dy: number): BlockModelElement {
  const [fx, fy, fz] = element.from;
  const [tx, ty, tz] = element.to;
  return { from: [fx, fy + dy, fz], to: [tx, ty + dy, tz], faces: element.faces };
}
