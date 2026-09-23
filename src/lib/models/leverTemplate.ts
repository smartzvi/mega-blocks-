import type { BlockModelElement } from '../../types/item';
import type { HandAuthoredTemplate } from './handAuthoredTemplates';
import { rotateElementX, rotateElementY, type YRotation } from './rotateElement';

/**
 * Lever has real blockstate/model JSON (unlike chest/bed/shulker/sign/skull — see
 * handAuthoredTemplates.ts's own file header) — this exists for exactly the same reason
 * railTemplates.ts does: the real model's moving part uses a per-element
 * `"rotation": {origin, axis, angle, rescale}` this engine's `parseBlockModel.ts` doesn't parse at
 * all (silently dropped). Confirmed directly against the real 1.21.11 jar, not assumed:
 * `models/block/lever.json` and `lever_on.json` are IDENTICAL except for one element's rotation —
 * a 2x2x10 "arm" box at `from:[7,1,7] to:[9,11,9]`, rotated `angle: -45`/`+45` around `axis: "x"`
 * through `origin: [8,1,8]`. Without handling that rotation, both states voxelize as the exact same
 * straight vertical peg — on and off would look pixel-identical, defeating the point of a powered
 * toggle entirely.
 *
 * Same call as rails: rather than teach the shared rasterizer real element rotation
 * (rasterizeModel.ts's own doc: changes there need diffing every blockstate in the jar), this hand-
 * authors just the arm as a *stepped* approximation — the same "slice into thin unit boxes, rotate
 * each slice's own corners by hand, take its axis-aligned bounding box" technique railTemplates.ts's
 * `rampElements` uses for ascending rail, just applied once per unit of the arm's own local height
 * instead of across a full 16-unit ramp run.
 *
 * The blockstate's OWN whole-model `x`/`y` rotation (what actually orients a floor/wall/ceiling
 * lever to its real `face`+`facing`) is a completely different, already-fully-supported feature —
 * `rotateElementX`/`rotateElementY` (rotateElement.ts) handle any multiple of 90°, which is all real
 * vanilla blockstates ever use (including lever's own real `x: 90`/`180` values). Since hand-
 * authoring bypasses `resolveItemModel.ts` entirely (same as chest bypassing it for `facing` — see
 * `chestTemplateFor`), this template re-applies that rotation itself, using the real per-face/
 * facing (x, y) pairs read directly off the real jar's `blockstates/lever.json` (see
 * FACE_FACING_ROTATION's own doc) rather than re-deriving them.
 */

// Real UV rect the vanilla model's arm element uses for every side face: `[7,6,9,16]` on
// `block/lever` (the `up` face alone narrows to `[7,6,9,8]`, but one shared rect keeps every
// stepped slice's 6 faces uniform, and there's no visual loss — `lever.png` is flat within this
// column anyway, see below). Confirmed fully opaque by decoding the real texture directly and
// scanning alpha across the entire 16x16 image: only columns x=7-8 are ever opaque, rows y=6-15 —
// exactly this rect. Inset by 1px on every edge (7,7 to 9,15) so no interpolated UV can round onto
// an unverified neighboring (transparent) pixel.
const POLE_UV: [number, number, number, number] = [7, 7, 9, 15];

function uniformFaces(uv: [number, number, number, number], textureVar: string): BlockModelElement['faces'] {
  const def = { uv, texture: `#${textureVar}` };
  return { top: def, bottom: def, north: def, south: def, east: def, west: def };
}

// A plain full-texture rect for the small cobblestone mounting nub — cobblestone has no
// directional pattern, so (unlike the real model's own per-face UV split) one shared rect across
// all 6 faces looks identical to the real per-face mapping.
const BASE_UV: [number, number, number, number] = [0, 0, 16, 16];

// `minecraft:cobblestone` itself isn't in this app's curated ~123-block palette (confirmed
// directly), so without a restriction the base nub's real per-pixel cobblestone texture — genuinely
// gray, average RGB (128,127,128), confirmed by decoding it directly — free-matches across whatever
// palette entries happen to be nearest in raw Lab distance, which pulled in `cyan_terracotta` for
// ~23% of the nub's voxels: a real closest-Lab match (lightness-dominated) but a visibly wrong
// *material*, the same "matched but mismatched-looking" class of fix skeleton_skull's
// SKULL_GRAYSCALE_PALETTE and beacon's crystal already needed elementPaletteRestrictions for — per
// user feedback that the base didn't read as recognizable stone at all. Restricted to the palette's
// own `stone_deepslate` family (confirmed via a real palette dump), minus the two glass entries that
// family also contains (a shiny/translucent-styled block would look wrong for a matte stone nub,
// same reasoning glassSource.ts already excludes glass from every non-glass item's matches).
const LEVER_BASE_PALETTE = [
  'minecraft:andesite',
  'minecraft:cobbled_deepslate',
  'minecraft:deepslate',
  'minecraft:deepslate_bricks',
  'minecraft:deepslate_tiles',
  'minecraft:diorite',
  'minecraft:dripstone_block',
  'minecraft:granite',
  'minecraft:polished_andesite',
  'minecraft:polished_deepslate',
  'minecraft:polished_diorite',
  'minecraft:polished_granite',
  'minecraft:polished_tuff',
  'minecraft:smooth_stone',
  'minecraft:stone',
  'minecraft:tuff',
  'minecraft:tuff_bricks',
];

function rotateYZ(y: number, z: number, originY: number, originZ: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dy = y - originY;
  const dz = z - originZ;
  return [originY + dy * cos - dz * sin, originZ + dy * sin + dz * cos];
}

const POLE_FROM_Y = 1;
const POLE_TO_Y = 11;
const POLE_ORIGIN_Y = 1;
const POLE_ORIGIN_Z = 8;
const POLE_Z0 = 7;
const POLE_Z1 = 9;

/**
 * The stepped arm: slices the real element's own local Y range (1 to 11, height 10) into unit-tall
 * boxes, rotates each slice's 4 relevant corners (X never moves — the rotation axis is always
 * "x") by hand around the real element's own real origin/angle, and takes the axis-aligned
 * bounding box of the rotated corners as that slice's element. Adjacent slices' rotated boxes
 * overlap substantially (an expected, harmless consequence of slicing a THIN box before rotating
 * it — the same tradeoff rail's ramp makes), which is exactly what makes the stack read as one
 * continuous diagonal arm instead of a dotted line of disconnected boxes.
 */
function tiltedPoleElements(angleDeg: number, textureVar: string): BlockModelElement[] {
  const elements: BlockModelElement[] = [];
  for (let y0 = POLE_FROM_Y; y0 < POLE_TO_Y; y0++) {
    const y1 = y0 + 1;
    const corners = [
      rotateYZ(y0, POLE_Z0, POLE_ORIGIN_Y, POLE_ORIGIN_Z, angleDeg),
      rotateYZ(y0, POLE_Z1, POLE_ORIGIN_Y, POLE_ORIGIN_Z, angleDeg),
      rotateYZ(y1, POLE_Z0, POLE_ORIGIN_Y, POLE_ORIGIN_Z, angleDeg),
      rotateYZ(y1, POLE_Z1, POLE_ORIGIN_Y, POLE_ORIGIN_Z, angleDeg),
    ];
    const ys = corners.map((c) => c[0]);
    const zs = corners.map((c) => c[1]);
    const from: [number, number, number] = [POLE_Z0, Math.min(...ys), Math.min(...zs)];
    const to: [number, number, number] = [POLE_Z1, Math.max(...ys), Math.max(...zs)];
    elements.push({ from, to, faces: uniformFaces(POLE_UV, textureVar) });
  }
  return elements;
}

type LeverFace = 'floor' | 'wall' | 'ceiling';
type LeverFacing = 'north' | 'east' | 'south' | 'west';

/**
 * Real (x, y) whole-model rotation per real `face`+`facing` combination, read directly off the
 * real jar's `blockstates/lever.json` (dumped and cross-checked by hand, not re-derived): floor and
 * wall share the same y-per-facing mapping (0/90/180/270 for north/east/south/west) with only x
 * differing (0 vs 90); ceiling's y-per-facing is shifted +180 from floor/wall's (north=180 instead
 * of 0, etc.) — flipping the block upside-down (x=180) mirrors which way "facing" reads from below,
 * so ceiling needs that extra half-turn to compensate. Kept as an explicit real-data table rather
 * than a formula so it can't silently drift from what the jar actually says.
 */
const FACE_FACING_ROTATION: Record<LeverFace, Record<LeverFacing, { x: YRotation; y: YRotation }>> = {
  floor: { north: { x: 0, y: 0 }, east: { x: 0, y: 90 }, south: { x: 0, y: 180 }, west: { x: 0, y: 270 } },
  wall: { north: { x: 90, y: 0 }, east: { x: 90, y: 90 }, south: { x: 90, y: 180 }, west: { x: 90, y: 270 } },
  ceiling: { north: { x: 180, y: 180 }, east: { x: 180, y: 270 }, south: { x: 180, y: 0 }, west: { x: 180, y: 90 } },
};

const VALID_FACES = new Set<LeverFace>(['floor', 'wall', 'ceiling']);
const VALID_FACINGS = new Set<LeverFacing>(['north', 'east', 'south', 'west']);

function isLeverFace(value: string | undefined): value is LeverFace {
  return value !== undefined && VALID_FACES.has(value as LeverFace);
}

function isLeverFacing(value: string | undefined): value is LeverFacing {
  return value !== undefined && VALID_FACINGS.has(value as LeverFacing);
}

/** Item mode's bare-name default (no real placed instance to know `face`/`facing`/`powered` from):
 *  a lever standing on the floor, facing north, unpowered — the same "deterministic, recognizable
 *  default" precedent `DEFAULT_RAIL_SHAPE` and chest's `facing=north` convention set. */
export const DEFAULT_LEVER_FACE: LeverFace = 'floor';
export const DEFAULT_LEVER_FACING: LeverFacing = 'north';
export const DEFAULT_LEVER_POWERED = false;

export function isLever(itemName: string): boolean {
  return itemName.replace(/^minecraft:/, '') === 'lever';
}

/** Item mode's counterpart to itemConnectionProperties/railShapeProperties: a lever picked with no
 *  real neighbors has no real power state to fall back on, so LeverPoweredToggle.tsx lets the user
 *  pick it directly. Undefined for anything that isn't a lever. */
export function leverPoweredProperties(itemName: string, powered: boolean): Record<string, string> | undefined {
  return isLever(itemName) ? { powered: String(powered) } : undefined;
}

/**
 * Resolves a real lever instance's `face`/`facing`/`powered` (or the defaults above with no real
 * properties — item mode's bare-name pick) into full arm+base geometry. `powered`'s real angle
 * mapping is exactly what the real jar's blockstate says (see file header) — `powered=false` uses
 * `lever_on.json`'s `angle: 45`, `powered=true` uses `lever.json`'s `angle: -45` — kept as literal
 * real data rather than re-derived from the (confusingly inverted-sounding) model file names.
 */
export function leverTemplateFor(properties?: Record<string, string>): HandAuthoredTemplate {
  const face = isLeverFace(properties?.face) ? properties!.face : DEFAULT_LEVER_FACE;
  const facing = isLeverFacing(properties?.facing) ? properties!.facing : DEFAULT_LEVER_FACING;
  const powered = properties?.powered === undefined ? DEFAULT_LEVER_POWERED : properties.powered === 'true';
  const angle = powered ? -45 : 45;

  const rot = FACE_FACING_ROTATION[face][facing];

  const localElements: BlockModelElement[] = [
    { from: [5, 0, 4], to: [11, 3, 12], faces: uniformFaces(BASE_UV, 'base') },
    ...tiltedPoleElements(angle, 'lever'),
  ];

  const elements = localElements.map((el) => rotateElementY(rotateElementX(el, rot.x), rot.y));

  return {
    model: { textures: { base: 'cobblestone', lever: 'lever' }, elements },
    heightUnits: 16,
    depthUnits: 16,
    // Element 0 is always the base mounting nub (see localElements above) — rotation reorders
    // nothing, it only transforms each element's own coordinates in place.
    elementPaletteRestrictions: { 0: LEVER_BASE_PALETTE },
  };
}
