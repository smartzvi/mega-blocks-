import type { BlockModelElement } from '../../types/item';
import type { RailShape } from '../../types/minecraft';
import type { HandAuthoredTemplate } from './handAuthoredTemplates';

export type { RailShape };

/**
 * Rail (`rail`, `powered_rail`, `detector_rail`, `activator_rail`) has real blockstate/model JSON
 * (unlike chest/bed/shulker/sign/skull — see handAuthoredTemplates.ts's own file header), so this
 * doesn't exist because rails have no data to drive from. It exists because the real ascending
 * (sloped) shapes use a real vanilla model feature this engine doesn't parse at all: a per-element
 * `"rotation": {origin, axis, angle, rescale}` — confirmed directly against the real jar's
 * `template_rail_raised_ne.json`/`template_rail_raised_sw.json`, not assumed. `parseBlockModel.ts`
 * only ever reads an element's `from`/`to`/`faces`; `rotation` is silently dropped, so an ascending
 * rail resolved through the generic engine would voxelize as a flat plane sitting at y=9 — not
 * sloped at all.
 *
 * Real per-element rotation is a shared-engine feature (rasterizeModel.ts would need to inverse-
 * transform each voxel's sample point through the rotation to fill a tilted box correctly), and
 * rasterizeModel.ts's own doc is explicit that changes there need diffing across every blockstate
 * in the jar before/after. Rails are the only block in the curated set that needs this, so — same
 * call already made for chest/bed/shulker's own non-standard geometry — this hand-authors just the
 * ascending shapes as a *stepped* ramp instead: a "staircase" of solid boxes, each one native unit
 * along the climb axis, rising one row at a time from the flat rail's own resting height (y=1) up
 * toward the block's ceiling. Confirmed by rotating the real template's flat plane by hand (a flat
 * y=9 plane, rotated ±45° around X through its own center (8,9,8), lands one Z (or X) edge at y=17
 * and the opposite edge at y=1 before the engine's own per-item clamp at y=16 trims the last unit)
 * — not guessed.
 *
 * The non-ascending shapes (`north_south`/`east_west`/the 4 curves) are geometrically identical in
 * real vanilla too — `rail_flat.json` and `rail_curved.json` are both one full 16×16 flat plane at
 * y=1, and the 4 curve shapes are the exact same plane, just with the `rail_corner` texture instead
 * of `rail`. So they're hand-authored here as one shared flat element per rail type (straight
 * texture for north_south/east_west, corner texture for the 4 curves — plain `rail` only, since
 * `powered_rail`/`detector_rail`/`activator_rail`'s real blockstates have no curve shapes at all,
 * confirmed directly), rather than a real per-shape UV rotation of the asymmetric tie pattern —
 * this engine's `rotateElementY` (rotateElement.ts) only relabels which *side* face a box's
 * north/east/south/west definition moves to under a 90° turn, it doesn't rotate a horizontal
 * top/bottom face's own in-plane UV, so getting the tie pattern itself to visibly rotate would need
 * new rotation math of its own — not worth it for a cosmetic-only difference (the real per-shape
 * texture is still used, so real color data drives the match either way; only the tie-mark
 * orientation is approximated, the same "recognizable, not pixel-perfect" tradeoff already made for
 * the shulker box).
 */

export const ALL_RAIL_SHAPES: RailShape[] = [
  'north_south',
  'east_west',
  'north_east',
  'north_west',
  'south_east',
  'south_west',
  'ascending_north',
  'ascending_south',
  'ascending_east',
  'ascending_west',
];

const CURVE_SHAPES: ReadonlySet<RailShape> = new Set(['north_east', 'north_west', 'south_east', 'south_west']);

/** A block's own default shape when item mode has no real placed instance to know about (no
 *  properties given). The generic engine's own no-properties fallback (`pickVariantKey`,
 *  parseBlockState.ts) would pick whichever variant key sorts alphabetically first, which for every
 *  rail blockstate happens to be an `ascending_*` shape — a much less useful/recognizable default
 *  preview than a plain straight rail, so this overrides it with a deliberate, sensible choice
 *  instead of inheriting that generic tie-break. Exported so RailShapeToggle.tsx and AppContext.tsx
 *  start from the exact same default this template itself falls back to. */
export const DEFAULT_RAIL_SHAPE: RailShape = 'north_south';

/** The 4 rail-family block names, real blockstates confirmed directly against the jar (see this
 *  file's own header doc) — used by ItemPicker.tsx to know when to send a real `shape` property and
 *  by RailShapeToggle.tsx to know when to show itself. */
const RAIL_FAMILY_NAMES = new Set(['rail', 'powered_rail', 'detector_rail', 'activator_rail']);

export function isRailFamily(itemName: string): boolean {
  return RAIL_FAMILY_NAMES.has(itemName.replace(/^minecraft:/, ''));
}

/** Item mode's counterpart to itemConnections.ts's `itemConnectionProperties`: a rail picked with
 *  no real neighbors has no real shape to fall back on, so RailShapeToggle.tsx lets the user pick
 *  one directly. Undefined for anything that isn't rail-family, so ItemPicker.tsx can pass this
 *  straight through as `options.properties` alongside the connection-family check without the two
 *  ever needing to know about each other (a block is never both). */
export function railShapeProperties(itemName: string, shape: RailShape): Record<string, string> | undefined {
  return isRailFamily(itemName) ? { shape } : undefined;
}

const RAMP_STEPS = 16;
/** The flat rail's own resting height (rail_flat.json: `from:[0,1,0] to:[16,1,16]`) — the ramp's
 *  low end matches it exactly so an ascending rail's base sits flush with an adjoining straight one. */
const RAIL_BASE_Y = 1;
/** The block's own true ceiling. Real vanilla's true high edge climbs to y=17 (one unit into the
 *  next block up, see this file's own header doc), which this engine's per-item resolution clamp
 *  would trim to 16 anyway, so 16 is the closest representable high end, not an extra margin of
 *  safety — `to: 16` is an ordinary, safe upper bound for an element here (a full cube's own faces
 *  already reach it). Chosen together with RAMP_STEPS so the total rise (16 - 1 = 15) divides
 *  evenly by the number of steps between them (RAMP_STEPS - 1 = 15) — exactly 1 unit of rise per
 *  step, with no rounding — see rampElements' own doc for why an uneven rise was the actual cause
 *  of a reported "2-voxel-thick, off-centre" tie: rounding a 14-unit rise over 15 transitions
 *  produced one step that didn't rise at all, i.e. two full-width steps landing at the exact same
 *  height, right around the middle of the ramp. */
const RAMP_TOP_Y = 16;

function flatFace(uv: [number, number, number, number]): BlockModelElement['faces'] {
  return {
    top: { uv, texture: '#main' },
    bottom: { uv: [uv[0], uv[3], uv[2], uv[1]], texture: '#main' }, // v-flipped, matching rail_flat.json's own down face
  };
}

/** The shared flat plane every non-ascending shape uses — real vanilla geometry exactly (a full
 *  16×16 plane at y=1), one shared element regardless of which of the 6 flat shapes it's for (see
 *  this file's own header doc on why the tie-pattern's own rotation is skipped). */
function flatRailElement(): BlockModelElement {
  return { from: [0, RAIL_BASE_Y, 0], to: [16, RAIL_BASE_Y, 16], faces: flatFace([0, 0, 16, 16]) };
}

/**
 * The stepped ascending ramp: `climbAxis` is which axis the slope runs along ('z' for
 * ascending_north/south, 'x' for ascending_east/west — real vanilla's raised_ne/raised_sw templates
 * both tilt around the X axis, i.e. slope along Z, and the real blockstate's own `y: 90` for
 * ascending_east/west is exactly a quarter-turn of that same ramp onto the X axis instead);
 * `highAtMax` is whether the climb's high end sits at that axis's 16 end or its 0 end (derived by
 * hand-rotating the real template's flat plane — see this file's own header doc — not guessed):
 * ascending_north → highAtMax=false (real high edge is z=0, north), ascending_south → true (z=16),
 * ascending_east → true (x=16), ascending_west → false (x=0).
 *
 * Each step is a thin box sitting directly on top of the previous step's own top, not filled all
 * the way down to the ground — per explicit feedback, an earlier revision filled every step solid
 * from the rail's resting height up to its own row, which reads as a solid right-triangle support
 * frame (base bars, vertical pillars) real vanilla doesn't have: an ascending rail is only ever the
 * thin diagonal track itself, with no frame of its own (any real support comes from the actual
 * block underneath, which isn't part of this model). Stacking each step on the last, rather than
 * on the ground, also fixed a second reported symptom for free: RAMP_TOP_Y/RAMP_STEPS are chosen so
 * the rise divides evenly with no rounding (see RAMP_TOP_Y's own doc), so every step is now exactly
 * 1 unit of rise — the old rounding could otherwise land two consecutive steps at the identical
 * height, which (filled solid to the ground) read as one double-width tie, roughly in the middle of
 * the ramp where the rounding error happened to accumulate.
 *
 * Every step's top face samples the real rail texture's own corresponding horizontal slice (a
 * direct 1:1 pass-through of the real UV, the same mapping rail_flat.json's own top face uses), so
 * the real tie pattern still varies along the ramp's length even though this is a stepped, not
 * smoothly tilted, approximation.
 */
function rampElements(climbAxis: 'x' | 'z', highAtMax: boolean): BlockModelElement[] {
  const elements: BlockModelElement[] = [];
  // Walk the physical positions in low-to-high order (whichever direction that is), stacking each
  // step directly on the previous one's own top — only the very first step touches RAIL_BASE_Y.
  let fromY = RAIL_BASE_Y;
  for (let step = 0; step < RAMP_STEPS; step++) {
    const i = highAtMax ? step : RAMP_STEPS - 1 - step; // physical position along the climb axis
    // RAMP_TOP_Y/RAMP_STEPS are chosen so (RAMP_TOP_Y - RAIL_BASE_Y) divides evenly by
    // (RAMP_STEPS - 1) — Math.round is a no-op here (exact integers throughout), kept only so
    // this still degrades gracefully if either constant ever changes to values that don't divide
    // evenly.
    const toY = RAIL_BASE_Y + Math.round((step / (RAMP_STEPS - 1)) * (RAMP_TOP_Y - RAIL_BASE_Y));
    const lo = i;
    const hi = i + 1;

    const from: [number, number, number] = climbAxis === 'z' ? [0, fromY, lo] : [lo, fromY, 0];
    const to: [number, number, number] = climbAxis === 'z' ? [16, toY, hi] : [hi, toY, 16];
    const uv: [number, number, number, number] = climbAxis === 'z' ? [0, lo, 16, hi] : [lo, 0, hi, 16];

    elements.push({ from, to, faces: flatFace(uv) });
    fromY = toY;
  }
  return elements;
}

const RAMP_BY_SHAPE: Record<'ascending_north' | 'ascending_south' | 'ascending_east' | 'ascending_west', () => BlockModelElement[]> = {
  ascending_north: () => rampElements('z', false),
  ascending_south: () => rampElements('z', true),
  ascending_east: () => rampElements('x', true),
  ascending_west: () => rampElements('x', false),
};

function elementsForShape(shape: RailShape): BlockModelElement[] {
  if (shape in RAMP_BY_SHAPE) return RAMP_BY_SHAPE[shape as keyof typeof RAMP_BY_SHAPE]();
  return [flatRailElement()];
}

/**
 * Resolves one rail-family block (`rail`, `powered_rail`, `detector_rail`, `activator_rail`) for a
 * real instance's `shape` (and, for the powered trio, `powered`) properties, or `DEFAULT_RAIL_SHAPE`
 * with no properties (item mode's bare-name pick). `cornerTextureKey`, when given, is used for the
 * 4 curve shapes (plain `rail` only — confirmed the other three blockstates define no curve shapes
 * at all); anything else falls back to `textureKey` even for a curve shape, so a caller that has no
 * real corner texture (there isn't one) never ends up with an unresolvable texture reference.
 */
export function railTemplateFor(textureKey: string, properties: Record<string, string> | undefined, cornerTextureKey?: string): HandAuthoredTemplate {
  const shape = (properties?.shape as RailShape | undefined) ?? DEFAULT_RAIL_SHAPE;
  const useCorner = CURVE_SHAPES.has(shape) && cornerTextureKey !== undefined;
  const elements = elementsForShape(shape);
  return {
    model: { textures: { main: useCorner ? cornerTextureKey! : textureKey }, elements },
    heightUnits: 16,
    depthUnits: 16,
  };
}
