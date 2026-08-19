import type { FaceName } from '../../types/minecraft';
import type { BlockModel, BlockModelElement } from '../../types/item';
import { FACE_AXES, axisValue } from './faceGeometry';

// Vanilla model JSON face keys -> our internal FaceName vocabulary.
const RAW_FACE_TO_FACE_NAME: Record<string, FaceName> = {
  up: 'top',
  down: 'bottom',
  north: 'north',
  south: 'south',
  east: 'east',
  west: 'west',
};

interface RawFace {
  uv?: [number, number, number, number];
  texture?: string;
}

interface RawElement {
  from?: unknown;
  to?: unknown;
  faces?: Record<string, RawFace>;
}

interface RawModel {
  parent?: string;
  textures?: Record<string, string>;
  elements?: RawElement[];
}

function readVec3(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || value.some((n) => typeof n !== 'number')) {
    throw new Error(`Block model element has an invalid "${label}" — expected a [x, y, z] number triple.`);
  }
  return [value[0], value[1], value[2]];
}

/**
 * Vanilla auto-generates a face's UV rect from the element's own bounds when the model omits an
 * explicit `uv` (used pervasively by e.g. cauldron.json). Project the element's from/to onto that
 * face's two in-plane axes, using the same axis choice rasterizeModel samples with later — the
 * exact flip doesn't matter here since sampling re-applies FACE_AXES' flip consistently.
 */
function autoUv(face: FaceName, from: [number, number, number], to: [number, number, number]): [number, number, number, number] {
  const { uAxis, vAxis } = FACE_AXES[face];
  return [
    axisValue(uAxis, ...from),
    axisValue(vAxis, ...from),
    axisValue(uAxis, ...to),
    axisValue(vAxis, ...to),
  ];
}

/**
 * Parses a raw block model JSON (as found at assets/minecraft/models/block/<name>.json) into a
 * BlockModel. Only self-contained models are supported — a model whose geometry lives entirely in
 * its own `elements` array. A model with a `parent` and no local `elements` throws clearly rather
 * than silently producing an empty/wrong shape; resolving the parent chain is resolveModelFile's
 * job (lib/models/resolveModelFile.ts), not this function's — call that first for a model with a
 * `parent`.
 */
export function parseBlockModel(json: unknown): BlockModel {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Block model JSON is not an object.');
  }
  const raw = json as RawModel;

  const rawElements = raw.elements ?? [];
  if (rawElements.length === 0) {
    if (raw.parent) {
      throw new Error(
        `Block model only defines a "parent" (${raw.parent}) with no local "elements" — call resolveModelFile to follow the parent chain first.`
      );
    }
    throw new Error('Block model has no "elements" to voxelize.');
  }

  const elements: BlockModelElement[] = rawElements.map((el, i) => {
    const from = readVec3(el.from, `elements[${i}].from`);
    const to = readVec3(el.to, `elements[${i}].to`);

    const faces: BlockModelElement['faces'] = {};
    for (const [rawKey, rawFace] of Object.entries(el.faces ?? {})) {
      const faceName = RAW_FACE_TO_FACE_NAME[rawKey];
      if (!faceName || !rawFace.texture) continue;
      faces[faceName] = { uv: rawFace.uv ?? autoUv(faceName, from, to), texture: rawFace.texture };
    }

    return { from, to, faces };
  });

  return { textures: raw.textures ?? {}, elements };
}
