import type { BlockTextureSet, FaceTexture } from '../../types/minecraft';
import { FACE_NAMES } from '../../types/minecraft';

function isFaceFullyOpaque(texture: FaceTexture): boolean {
  const { data } = texture;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return false;
  }
  return true;
}

/**
 * Whether every face of this block's texture is fully opaque (no transparent pixels at all).
 *
 * This is the signal used to tell a genuine full-cube block (stone, oak_planks, black_concrete
 * — every one of these is 0% transparent, verified against a real 1.21.8 jar) apart from a
 * sprite/overlay-style block (torch, rail, lever, flowers, doors, trapdoors, ladders, vines —
 * every one of these has meaningful transparency, from ~9% up to ~92%, since their texture is a
 * cutout drawn on an otherwise-transparent canvas, not a real cube face). Vanilla never
 * anti-aliases these cutouts, so the check is a clean, exact "any transparent pixel at all"
 * rather than a fuzzy threshold.
 *
 * Blocks that fail this check aren't offered as a source to replicate: their single flat sprite
 * texture, stretched across a cube's 6 faces, produces mostly-transparent pixels that would
 * otherwise be matched using their meaningless stored RGB (commonly black) instead of a real
 * color — the result reads as "a black cube with a faint smudge", not a recognizable giant
 * version of the block, and isn't something a shape this tool builds (a solid cube/slab/
 * stair/door) could ever represent faithfully anyway.
 */
export function isFullyOpaque(textureSet: BlockTextureSet): boolean {
  return FACE_NAMES.every((face) => isFaceFullyOpaque(textureSet[face]));
}
