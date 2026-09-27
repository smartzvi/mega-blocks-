import type { FaceName } from '../../types/minecraft';
import type { BlockModelElement } from '../../types/item';

export type UvRect = [number, number, number, number];

export interface FaceUv {
  uv: UvRect;
  /** Turns the texture on this face clockwise (see BlockModelElement's `uvRotation`). */
  rotation?: 0 | 90 | 180 | 270;
}

/**
 * A box whose faces each sample an explicit, hand-picked UV rect — with `fallback` on any face not
 * listed. Minecart and boat are built entirely from thin plates, and their real textures are box-UV
 * atlases laid out for each plate's *own* local axes, which don't line up with how a plate sits in
 * this engine's block space (a boat's bottom is a 28x16 plate lying flat, its atlas region is
 * upright). So each large face is pointed at its real atlas region by hand, and the small edge
 * faces just reuse an opaque rect from the same plate — every rect used has to be checked fully
 * opaque against the real texture (a transparent texel becomes air; see CLAUDE.md).
 */
export function plate(
  from: [number, number, number],
  to: [number, number, number],
  textureVar: string,
  fallback: UvRect,
  faces: Partial<Record<FaceName, FaceUv>> = {}
): BlockModelElement {
  const texture = `#${textureVar}`;
  const out: BlockModelElement['faces'] = {};
  for (const face of ['top', 'bottom', 'north', 'south', 'east', 'west'] as FaceName[]) {
    const own = faces[face];
    out[face] = own ? { uv: own.uv, texture, ...(own.rotation ? { uvRotation: own.rotation } : {}) } : { uv: fallback, texture };
  }
  return { from, to, faces: out };
}
