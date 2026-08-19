import type { FaceName, FaceTexture, PaletteEntry, VoxelGrid } from '../../types/minecraft';
import type { BlockModel, BlockModelElement } from '../../types/item';
import { rgbToLab } from '../color/lab';
import { rgbToHsv } from '../color/hsv';
import { matchPixel } from '../matching/matchFace';
import { FACE_AXES, FACE_PRIORITY, NEIGHBOR_OFFSET, axisValue } from './faceGeometry';
import { resolveTexturePath, texturePathToKey } from './resolveTextureVariable';

const MODEL_SPACE_SIZE = 16;

/** Returns null for a fully-transparent pixel — vanilla cutout textures (ladder's rung gaps,
 *  vines, etc.) aren't anti-aliased, so alpha=0 is a clean, reliable "no real color here" signal
 *  (same empirical finding lib/palette/opacity.ts used for full-cube exclusion; here we act on it
 *  per-pixel instead of rejecting the whole block, since an item's plane can legitimately have
 *  real holes in it). Without this, a transparent pixel's meaningless stored RGB (commonly black)
 *  gets matched as if it were real — the exact "mega torch" bug this engine's block-mode sibling
 *  was fixed to avoid, just reachable a different way here. */
function samplePixel(texture: FaceTexture, u: number, v: number): [number, number, number] | null {
  const px = Math.min(texture.width - 1, Math.max(0, Math.floor(u)));
  const py = Math.min(texture.height - 1, Math.max(0, Math.floor(v)));
  const i = (py * texture.width + px) * 4;
  if (texture.data[i + 3] === 0) return null;
  return [texture.data[i], texture.data[i + 1], texture.data[i + 2]];
}

/** Resolves one face's declared UV rect + texture variable to a sampled RGB color for the given
 *  voxel center, or null if the texture variable can't be resolved, its texture failed to
 *  decode, or the sampled pixel is fully transparent — callers fall back to a different face
 *  rather than treating this as fatal, since an arbitrary block model may reference a texture
 *  this engine couldn't load, or a decorative cutout texture may have a real gap at this spot. */
function resolveFaceColor(
  el: BlockModelElement,
  face: FaceName,
  cx: number,
  cy: number,
  cz: number,
  model: BlockModel,
  textures: Map<string, FaceTexture>
): [number, number, number] | null {
  const faceDef = el.faces[face];
  if (!faceDef) return null;

  let texture: FaceTexture | undefined;
  try {
    const path = resolveTexturePath(faceDef.texture, model.textures);
    texture = textures.get(texturePathToKey(path));
  } catch {
    return null;
  }
  if (!texture) return null;

  const { uAxis, uFlip, vAxis, vFlip } = FACE_AXES[face];
  const [fx0, fy0, fz0] = el.from;
  const [fx1, fy1, fz1] = el.to;

  const uSpan = axisValue(uAxis, fx1, fy1, fz1) - axisValue(uAxis, fx0, fy0, fz0);
  const vSpan = axisValue(vAxis, fx1, fy1, fz1) - axisValue(vAxis, fx0, fy0, fz0);
  let uT = uSpan === 0 ? 0 : (axisValue(uAxis, cx, cy, cz) - axisValue(uAxis, fx0, fy0, fz0)) / uSpan;
  let vT = vSpan === 0 ? 0 : (axisValue(vAxis, cx, cy, cz) - axisValue(vAxis, fx0, fy0, fz0)) / vSpan;
  uT = Math.min(1, Math.max(0, uT));
  vT = Math.min(1, Math.max(0, vT));
  if (uFlip) uT = 1 - uT;
  if (vFlip) vT = 1 - vT;

  const [u1, v1, u2, v2] = faceDef.uv;
  const u = u1 + uT * (u2 - u1);
  const v = v1 + vT * (v2 - v1);
  return samplePixel(texture, u, v);
}

/**
 * Rasterizes a resolved BlockModel (see resolveItemModel.ts) into a VoxelGrid, coloring each
 * exposed voxel face by sampling an owning element's declared UV rect out of its resolved
 * texture and running it through the same palette matcher the cube pipeline uses. `textures` must
 * already contain every texture key the model's faces resolve to (see buildItemVoxelGrid.ts,
 * which decodes them up front so this function stays synchronous).
 *
 * `modelHeightUnits`/`modelDepthUnits` are the model space's own Y/Z extents, in the same
 * 16-units-per-block scale as X: 16 for an ordinary single-block model, 32 for a combined
 * two-part block — a real door stitching its bottom and top halves into one genuinely
 * 2-block-tall shape (modelHeightUnits=32, see resolveItemModel.ts), or a hand-authored bed
 * stitching its head and foot halves into one genuinely 2-block-long shape (modelDepthUnits=32,
 * see handAuthoredTemplates.ts). X always stays one block wide (16 units); nothing in this engine
 * produces a block wider than one block.
 *
 * Vanilla models routinely stack multiple elements at the exact same position as layered
 * "overlay" textures — e.g. redstone_dust_dot.json puts an opaque "#line" element and a mostly
 * transparent "#overlay" tint element at the identical from/to. Keeping only the single
 * last-added element per voxel (as if layering never happens) meant a voxel whose only owner was
 * a mostly-transparent overlay layer never found a color anywhere and the whole block came out
 * empty. Every element occupying a voxel is tracked instead; the most-recently-added is tried
 * first (matching the "later element wins" visual stacking order) and earlier co-located
 * elements are used as a fallback when the later one can't resolve a color there.
 *
 * `elementPaletteOverrides`, when given, swaps in a different (usually narrower) palette for
 * whichever element index actually supplies a voxel's color — e.g. beacon's hand-authored crystal
 * element (handAuthoredTemplates.ts) is restricted to light-emitting blocks only, so it reads as
 * genuinely glowing rather than picking whatever wood/wool tone happens to be closest in color.
 * Elements with no entry in the map keep using the shared `palette`, unaffected.
 */
export function rasterizeItemModel(
  model: BlockModel,
  textures: Map<string, FaceTexture>,
  palette: PaletteEntry[],
  resolution: number,
  modelHeightUnits = MODEL_SPACE_SIZE,
  modelDepthUnits = MODEL_SPACE_SIZE,
  elementPaletteOverrides?: Map<number, PaletteEntry[]>
): VoxelGrid {
  const scale = resolution / MODEL_SPACE_SIZE;
  const resolutionY = Math.round(resolution * (modelHeightUnits / MODEL_SPACE_SIZE));
  const resolutionZ = Math.round(resolution * (modelDepthUnits / MODEL_SPACE_SIZE));

  const owners = new Map<number, number[]>();
  const index = (x: number, y: number, z: number) => (x * resolutionY + y) * resolutionZ + z;

  model.elements.forEach((el, elementIndex) => {
    const [rx0, ry0, rz0] = el.from.map((n) => Math.round(n * scale)) as [number, number, number];
    const [rx1, ry1, rz1] = el.to.map((n) => Math.round(n * scale)) as [number, number, number];
    // Vanilla allows (and uses, e.g. ladder.json) zero-thickness elements as flat overlay decals
    // — clamp every axis to at least 1 voxel thick so they stay visible instead of vanishing.
    const x1 = Math.max(rx1, rx0 + 1);
    const y1 = Math.max(ry1, ry0 + 1);
    const z1 = Math.max(rz1, rz0 + 1);

    for (let x = Math.max(0, rx0); x < Math.min(resolution, x1); x++) {
      for (let y = Math.max(0, ry0); y < Math.min(resolutionY, y1); y++) {
        for (let z = Math.max(0, rz0); z < Math.min(resolutionZ, z1); z++) {
          const idx = index(x, y, z);
          let list = owners.get(idx);
          if (!list) {
            list = [];
            owners.set(idx, list);
          }
          list.push(elementIndex);
        }
      }
    }
  });

  const isSolid = (x: number, y: number, z: number) =>
    x >= 0 && x < resolution && y >= 0 && y < resolutionY && z >= 0 && z < resolutionZ && owners.has(index(x, y, z));

  function colorVoxel(x: number, y: number, z: number): string | null {
    const ownerList = owners.get(index(x, y, z));
    if (!ownerList) return null;

    const exposedFaces = FACE_PRIORITY.filter((face) => {
      const [dx, dy, dz] = NEIGHBOR_OFFSET[face];
      return !isSolid(x + dx, y + dy, z + dz);
    });
    if (exposedFaces.length === 0) return null; // fully interior

    const cx = (x + 0.5) / scale;
    const cy = (y + 0.5) / scale;
    const cz = (z + 0.5) / scale;

    // Most-recently-added element first (the "top" layer), earlier co-located elements as
    // fallback. Within each element: prefer a genuinely exposed direction with a resolvable
    // texture; if none work, fall back to any other defined face on that element.
    for (let i = ownerList.length - 1; i >= 0; i--) {
      const elementIndex = ownerList[i];
      const el: BlockModelElement = model.elements[elementIndex];
      const candidates = [...exposedFaces, ...(Object.keys(el.faces) as FaceName[])];
      for (const face of candidates) {
        const color = resolveFaceColor(el, face, cx, cy, cz, model, textures);
        if (color) {
          const [r, g, b] = color;
          const effectivePalette = elementPaletteOverrides?.get(elementIndex) ?? palette;
          return matchPixel(rgbToLab(r, g, b), rgbToHsv(r, g, b), face, effectivePalette).id;
        }
      }
    }
    return null;
  }

  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < resolution; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < resolutionY; y++) {
      const column: (string | null)[] = [];
      for (let z = 0; z < resolutionZ; z++) {
        column.push(colorVoxel(x, y, z));
      }
      plane.push(column);
    }
    voxels.push(plane);
  }

  return { sizeX: resolution, sizeY: resolutionY, sizeZ: resolutionZ, voxels };
}
