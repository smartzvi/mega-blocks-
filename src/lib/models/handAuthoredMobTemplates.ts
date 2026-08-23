import type { FaceName } from '../../types/minecraft';
import type { BlockModelElement } from '../../types/item';
import { boxElement, stretchedBox } from './handAuthoredTemplates';
import type { HandAuthoredTemplate } from './handAuthoredTemplates';

/**
 * Mobs have no model JSON anywhere in the jar at all — vanilla entity geometry is hardcoded in the
 * Minecraft Java client's compiled code, confirmed by directly inspecting the real 1.21.8 jar (no
 * `models/entity/` directory exists, unlike `models/block/`). So, like chest/shulker/bed/sign in
 * handAuthoredTemplates.ts, every mob here is hand-authored — but instead of reverse-engineering
 * UV boundaries from raw texture pixels (as those did), the cuboid geometry itself was sourced
 * directly from Mojang's public bedrock-samples repo (`resource_pack/models/entity/<mob>.geo.json`),
 * which documents exact `origin`/`size`/`uv` per cube in the same box-UV convention Java models use
 * — far less ambiguous than reverse-engineering pivot/rotation math from decompiled Java. Every
 * number below is transcribed directly from that source, not estimated.
 *
 * Two real gotchas found while transcribing, not assumed away:
 * - Pig's "body" bone has a `bind_pose_rotation: [90,0,0]` — authored as a tall vertical box, then
 *   rotated 90° around the X axis to lie flat as a horizontal barrel in the final pose. Skipping
 *   this would render it with a tall block-shaped torso instead of a horizontal one. The box-UV
 *   rect must still be derived from the box's PRE-rotation size (the texture atlas was laid out
 *   assuming that shape) — verified directly against the real pig texture (a 64×64 canvas, only
 *   the top ~37 rows actually painted): the pre-rotation size lands exactly at the real painted
 *   content's edges.
 * - Every other bone (heads, legs, wings, arms, chicken's beak/comb) has no rotation at all — the
 *   fetched data confirms this explicitly rather than assuming an absent field means zero rotation.
 * - box-UV's "south" texture region assumes it lands on the real Minecraft-compass +Z face, but
 *   every model here puts its head/front anatomy at Z=0 (the opposite end) — confirmed by directly
 *   sampling the real pig texture, its eyes sit inside the "south"-computed UV rect, yet were
 *   rendering on the physical back of the head until `mirrorFrontBack` below corrected it.
 *
 * Cow was pulled from the v1 starter list (see [[mob_geometry_bedrock_geo_json_sourcing]] for the
 * full investigation) — its geometry was real and verified correct, but its default preview angle
 * never read as a recognizable cow, and revisiting its UV mapping wasn't worth blocking the other
 * four mobs. Reintroducing it later means restoring `cowModel`/`insetX` from git history.
 *
 * Second batch (originally villager, sheep, iron golem, snow golem, slime — villager and slime
 * were later removed per user request, see below) added a few more real gotchas:
 * - Sheep's body bone has the same `bind_pose_rotation: [90,0,0]` as pig — `rotatedBodyElement`
 *   reused as-is. Sheep also has a second, separate "wool" geometry (its own bone tree reusing the
 *   same pivots, rendered as a second texture layer over the base body) — this is a real second
 *   texture (`sheep/sheep_wool`), not a recolor, so `normalizeMobModel` takes a `textures` map now
 *   instead of a single key; every other mob just passes `{ main: textureKey }`.
 * - Sheep's wool cubes use Bedrock's `inflate` field — grows a cube outward by a fixed amount on
 *   every side without changing which texture pixels it samples. `inflateBounds` expands an
 *   already-built element's `from`/`to` after the fact, deliberately *not* touching its `faces` —
 *   box-UV's rect is computed from the cube's declared (pre-inflate) size, so recomputing it from
 *   the grown size would sample real texture pixels the original authoring never intended for that
 *   face (the same class of bug `insetX` avoided for cow's udder).
 * - Iron golem, snow golem, and (third batch) panda are all wider than one block: iron golem's arms
 *   sit at real X ±13, snow golem's stick arms happen to land on the exact same ±13 (26-unit span),
 *   panda's body is 19 units wide at the belly — but `rasterizeItemModel` hardcodes model-space X to
 *   exactly 0-16 with no 2-block-wide equivalent of `heightUnits`/`depthUnits`, so anything past 16
 *   silently clips. The first fix attempt (`scaleXBounds`, since removed) compressed only X, leaving
 *   Y/Z at full real scale — a real user screenshot showed this reads as an unrecognizably tall,
 *   thin figure with arms sticking out from a skinny body, not a stocky golem. `scaleBounds` scales
 *   every axis by the same factor instead (per mob: 8/13 for both golems, 16/19 for panda — landing
 *   the widest real span exactly at the 16-unit ceiling), preserving the true width:height:depth
 *   ratio at the cost of each ending up shorter than its real absolute in-game height — again
 *   leaving `faces` untouched so real UV mapping stays correct.
 * - Snow golem's two arm bones are, bewilderingly, defined with byte-identical origin/size/uv in
 *   the raw geo.json (confirmed by fetching the exact raw JSON twice, since one arm's data looked
 *   like a copy-paste of the other) — rendering both literally would put two overlapping sticks on
 *   the same side rather than one on each side, which doesn't match how snow golems actually look
 *   in-game. Whatever mirrors the second arm in the real client happens outside this base pose data
 *   (likely a runtime animation-controller transform Bedrock's format allows but this file doesn't
 *   parse), so the second arm is mirrored explicitly here with `mirrorX` (a small local helper that
 *   reflects a cube's origin across X while reusing its exact UV rect — also used by zombie/
 *   skeleton's shared-limb-texture), matching the visually-correct two-arms-akimbo silhouette
 *   rather than the literal (but misleading) raw data.
 *
 * Third batch — panda replaces villager and slime (removed per user request; their geometry can be
 * restored from git history if reintroduced later). Panda's body has the same `bind_pose_rotation`
 * as pig/sheep and needed `scaleBounds` (above) for its overweight body — no other new technique;
 * every leg and ear has its own explicit origin in the real geo.json (no `"mirror": true` flag the
 * way villager's did), so each is transcribed literally rather than built from one side via
 * `mirrorX`. Its black eye patches and belly patch are baked into the texture, not separate
 * geometry — the same "no geometry needed" pattern slime's core used to be.
 *
 * Coordinates are transcribed in each mob's own raw geo.json space (not yet shifted into the
 * non-negative range `BlockModelElement.from/to` needs — `rasterizeItemModel` silently clips
 * negative coordinates to 0, so failing to shift would silently lose geometry) — `normalizeMobModel`
 * computes each model's real bounding box and shifts every element into place, deriving
 * `heightUnits`/`depthUnits` from that same box rather than a hardcoded guess. Model-space X is
 * always exactly 0-16 (matching every other hand-authored template) with no equivalent "widthUnits"
 * — mobs whose raw data is wider than that (iron golem, snow golem, panda) go through `scaleBounds`
 * first so every element ends up within 0-16 before `normalizeMobModel` ever runs.
 */

interface RawCube {
  origin: [number, number, number];
  size: [number, number, number];
  uv: [number, number];
}

function cubeElement(cube: RawCube, textureVar: string): BlockModelElement {
  const [ox, oy, oz] = cube.origin;
  const [sx, sy, sz] = cube.size;
  return boxElement([ox, oy, oz], [ox + sx, oy + sy, oz + sz], cube.uv, textureVar);
}

/** Mirrors a cube across X (left<->right), reusing the exact same UV rect — the real box-UV
 *  layout vanilla uses for any part that's authored once and rendered twice (zombie/skeleton's
 *  arms and legs, villager's arms and legs). */
function mirrorX(cube: RawCube): RawCube {
  return { origin: [-cube.origin[0] - cube.size[0], cube.origin[1], cube.origin[2]], size: cube.size, uv: cube.uv };
}

/** Maps a box-UV face set through the same relabeling a +90°-around-X rotation produces (top
 *  becomes the new south-facing side, etc.) — see rotateElementX in rotateElement.ts, whose
 *  FACE_ROTATION_MAP_X[90] this mirrors; not imported directly since that function also recomputes
 *  from/to around a fixed (8,8) pivot, which doesn't match a mob's own geo.json pivot. */
function faceMapForBodyRotation(faces: BlockModelElement['faces']): BlockModelElement['faces'] {
  const map: Partial<Record<FaceName, FaceName>> = { top: 'south', bottom: 'north', north: 'top', south: 'bottom', east: 'east', west: 'west' };
  const rotated: BlockModelElement['faces'] = {};
  for (const [face, def] of Object.entries(faces)) {
    if (!def) continue;
    rotated[map[face as FaceName]!] = def;
  }
  return rotated;
}

/**
 * A "body" bone rotated 90° around the X axis about its real geo.json pivot (pig uses exactly
 * this). `cube` is in the bone's own pre-rotation local space (matching the raw fetched
 * data); `pivot` is that bone's [pivotY, pivotZ]. Builds the box-UV faces from the cube's real
 * (pre-rotation) size — see file header — then computes the actual rotated Y/Z bounds directly:
 * for a +90° rotation around (pivotY, pivotZ), `y' = pivotY + (z - pivotZ)`, `z' = pivotZ - (y - pivotY)`
 * (verified by hand against the real pig data: legs top out at y=6, and this formula places the
 * rotated body's bottom edge at exactly y=6 too — a physically-required seam, not a coincidence).
 */
function rotatedBodyElement(cube: RawCube, pivot: [number, number], textureVar: string): BlockModelElement {
  const [ox, oy, oz] = cube.origin;
  const [sx, sy, sz] = cube.size;
  const base = boxElement([0, 0, 0], [sx, sy, sz], cube.uv, textureVar);
  const faces = faceMapForBodyRotation(base.faces);

  // y' depends only on the original z, and z' only on the original y (a +90° rotation around X
  // swaps which axis each depends on), so each only needs the 2 extremes of its own source axis.
  const [pivotY, pivotZ] = pivot;
  const yCorners = [oz, oz + sz].map((z) => pivotY + (z - pivotZ));
  const zCorners = [oy, oy + sy].map((y) => pivotZ - (y - pivotY));

  return {
    from: [ox, Math.min(...yCorners), Math.min(...zCorners)],
    to: [ox + sx, Math.max(...yCorners), Math.max(...zCorners)],
    faces,
  };
}

/**
 * Vanilla box-UV assumes a box's own "south" texture region shows on the real Minecraft-compass
 * +Z face — but every mob model here places its head/front-facing anatomy at the LOW end of its
 * own Z range (Z=0), opposite that convention. Found by sampling the real decoded pig texture
 * directly (not guessed): its eyes land squarely inside the UV rect `boxElement` computes as
 * "south", yet with head at Z=0 that rect was rendering on the physical BACK of the head (touching
 * the neck), not the front. Swapping north<->south AND east<->west (a true 180°
 * turn, not a single-axis label flip that would leave left/right inconsistently mirrored)
 * corrects this — applied uniformly to every element in normalizeMobModel, since the same "head
 * end is Z=0" layout choice was used for every mob's whole coordinate system, not just the head.
 */
function mirrorFrontBack(faces: BlockModelElement['faces']): BlockModelElement['faces'] {
  const map: Partial<Record<FaceName, FaceName>> = { north: 'south', south: 'north', east: 'west', west: 'east', top: 'top', bottom: 'bottom' };
  const mirrored: BlockModelElement['faces'] = {};
  for (const [face, def] of Object.entries(faces)) {
    if (!def) continue;
    mirrored[map[face as FaceName]!] = def;
  }
  return mirrored;
}

function boundsOf(elements: BlockModelElement[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const el of elements) {
    for (const p of [el.from, el.to]) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
      minZ = Math.min(minZ, p[2]);
      maxZ = Math.max(maxZ, p[2]);
    }
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function shiftElement(el: BlockModelElement, offset: [number, number, number]): BlockModelElement {
  return {
    from: [el.from[0] + offset[0], el.from[1] + offset[1], el.from[2] + offset[2]],
    to: [el.to[0] + offset[0], el.to[1] + offset[1], el.to[2] + offset[2]],
    faces: el.faces,
  };
}

/** Grows an already-built element's `from`/`to` outward by `inflate` units on every side, without
 *  touching `faces` — Bedrock's `inflate` field only grows the *rendered* box, it doesn't change
 *  which texture pixels get sampled, so recomputing UV from the grown size (as calling
 *  `cubeElement`/`rotatedBodyElement` with a pre-grown size would) sample real texture pixels the
 *  original authoring never intended for that face. Used for sheep's wool overlay and villager's
 *  outer robe cube. */
function inflateBounds(el: BlockModelElement, inflate: number): BlockModelElement {
  return {
    from: [el.from[0] - inflate, el.from[1] - inflate, el.from[2] - inflate],
    to: [el.to[0] + inflate, el.to[1] + inflate, el.to[2] + inflate],
    faces: el.faces,
  };
}

/** Like `inflateBounds`, but leaves the Z-low edge (`from[2]`) untouched — every mob's front-facing
 *  anatomy sits at its own low-Z end (see the file header), so for a head this is specifically the
 *  face. Used only for sheep's wool head: the real (un-inflated) wool-head cube already stops a
 *  full 2 units short of the base head's own front edge, matching real Minecraft's bare-face-under-
 *  the-wool look — but a uniform `inflateBounds` pushes that front edge forward too, eating most of
 *  that 2-unit gap (down to 1.4 units) and, once rounded to a handful of voxels at typical output
 *  resolutions, wool ends up covering nearly the whole face instead of a thin rim around it. Only
 *  the front stays un-inflated; top/bottom/sides/back still puff outward normally. */
function inflateBoundsKeepFront(el: BlockModelElement, inflate: number): BlockModelElement {
  return {
    from: [el.from[0] - inflate, el.from[1] - inflate, el.from[2]],
    to: [el.to[0] + inflate, el.to[1] + inflate, el.to[2] + inflate],
    faces: el.faces,
  };
}

/**
 * Scales an already-built element's from/to on all 3 axes by the same factor, again leaving
 * `faces` untouched for the same reason `inflateBounds` does — used to compress iron golem's and
 * snow golem's real (wider-than-one-block) X span down to fit `rasterizeItemModel`'s hardcoded
 * 0-16 model-space X range, which has no 2-block-wide equivalent of `heightUnits`/`depthUnits` for
 * X. Scaling *only* X (an earlier version of this helper did exactly that) leaves Y/Z at full real
 * scale while X shrinks by ~40% — a real user screenshot confirmed this reads as an unrecognizably
 * tall, narrow figure with arms sticking way out from a skinny body, not a proportioned golem.
 * Scaling every axis by the same factor keeps the true width:height:depth ratio (the golem just
 * ends up shorter overall than its real absolute in-game height) — because every cube here is
 * still in real, un-shifted world-space coordinates when this runs, uniformly scaling all of them
 * around the same origin preserves every touching seam between parts exactly (if two boxes touch
 * at y=Y0 before scaling, they still touch at y=Y0*factor after — ordinary linear algebra, not
 * something that needs re-deriving per mob).
 */
function scaleBounds(el: BlockModelElement, factor: number): BlockModelElement {
  return {
    from: [el.from[0] * factor, el.from[1] * factor, el.from[2] * factor],
    to: [el.to[0] * factor, el.to[1] * factor, el.to[2] * factor],
    faces: el.faces,
  };
}

/** Expands an already-built element's from/to by `amount` on exactly one axis (split evenly around
 *  the axis's original, already-equal from/to value) — leaves `faces` untouched, same reasoning as
 *  `inflateBounds`. Bee's legs and stinger are genuinely zero-thickness flat planes in the real
 *  geo.json (Bedrock renders them as double-sided quads, which this engine has no equivalent for —
 *  it only voxelizes real 3D volume), so each needs a small physical thickness along its flat axis
 *  before it can be voxelized at all; the real box-UV faces were already computed from the
 *  (zero-thickness) pre-thicken size, and are kept exactly as-is. */
function thickenAxis(el: BlockModelElement, axis: 0 | 1 | 2, amount: number): BlockModelElement {
  const from: [number, number, number] = [...el.from];
  const to: [number, number, number] = [...el.to];
  const center = (from[axis] + to[axis]) / 2;
  from[axis] = center - amount / 2;
  to[axis] = center + amount / 2;
  return { from, to, faces: el.faces };
}

/** Extends an already-built element's Z-low ("front", per this file's convention) edge outward by
 *  `amount`, leaving every other bound and `faces` untouched — same "touch geometry only, keep the
 *  real UV mapping" reasoning as `inflateBounds`/`thickenAxis`. Used for wolf's `upperBody`: the
 *  real geo.json leaves a genuine 4-unit empty gap between the head's rear edge (Z=-5) and
 *  upperBody's front edge (Z=-1) — real Minecraft's neck/head animation and shading bridge it
 *  visually, but voxelized literally (a static model, no animation) that gap reads as a floating,
 *  disconnected head, confirmed by real user feedback. */
function extendFront(el: BlockModelElement, amount: number): BlockModelElement {
  return { from: [el.from[0], el.from[1], el.from[2] - amount], to: el.to, faces: el.faces };
}

/** Same as `extendFront`, but grows the Z-high ("back") edge instead. Used for wolf's `upperBody`:
 *  its real rear edge (Z=6) merely touches the rear legs' own front edge (Z=6) at a single
 *  boundary plane rather than overlapping them the way the front-edge fix overlaps the front legs
 *  (comfortably inside upperBody's Z range after `extendFront`) — a boundary-only touch can still
 *  voxelize to a visible gap depending on how each side rounds to the grid, confirmed by real user
 *  feedback that the rear legs specifically (not the front ones) read as disconnected. */
function extendBack(el: BlockModelElement, amount: number): BlockModelElement {
  return { from: el.from, to: [el.to[0], el.to[1], el.to[2] + amount], faces: el.faces };
}

/** Shifts every element so the model's own bounding box starts at (0, 0, 0) — required since
 *  `rasterizeItemModel` silently clips negative coordinates — and derives `heightUnits`/`depthUnits`
 *  from that same real bounding box instead of a hardcoded per-mob guess. `textures` is a full map
 *  (not a single key) since sheep needs a second real texture layer for its wool, not a recolor.
 *  `elementPaletteRestrictions`, when given, is passed straight through — see its doc on
 *  `HandAuthoredTemplate` (handAuthoredTemplates.ts); indices refer to `rawElements`' own order,
 *  which mirroring/shifting never reorders. */
function normalizeMobModel(
  rawElements: BlockModelElement[],
  textures: Record<string, string>,
  elementPaletteRestrictions?: Record<number, string[]>
): HandAuthoredTemplate {
  const mirrored = rawElements.map((el) => ({ from: el.from, to: el.to, faces: mirrorFrontBack(el.faces) }));
  const b = boundsOf(mirrored);
  const offset: [number, number, number] = [-b.minX, -b.minY, -b.minZ];
  return {
    model: { textures, elements: mirrored.map((el) => shiftElement(el, offset)) },
    heightUnits: b.maxY - b.minY,
    depthUnits: b.maxZ - b.minZ,
    elementPaletteRestrictions,
  };
}

function pigModel(textureKey: string): HandAuthoredTemplate {
  const pivot: [number, number] = [13, 2]; // body bone pivot [y, z]
  const elements = [
    rotatedBodyElement({ origin: [-5, 7, -5], size: [10, 16, 8], uv: [28, 8] }, pivot, 'main'),
    cubeElement({ origin: [-4, 8, -14], size: [8, 8, 8], uv: [0, 0] }, 'main'), // head
    cubeElement({ origin: [-2, 9, -15], size: [4, 3, 1], uv: [16, 16] }, 'main'), // snout
    cubeElement({ origin: [-5, 0, 5], size: [4, 6, 4], uv: [0, 16] }, 'main'), // front-left leg
    cubeElement({ origin: [1, 0, 5], size: [4, 6, 4], uv: [0, 16] }, 'main'), // front-right leg
    cubeElement({ origin: [-5, 0, -7], size: [4, 6, 4], uv: [0, 16] }, 'main'), // back-left leg
    cubeElement({ origin: [1, 0, -7], size: [4, 6, 4], uv: [0, 16] }, 'main'), // back-right leg
  ];
  return normalizeMobModel(elements, { main: textureKey });
}

function chickenModel(textureKey: string): HandAuthoredTemplate {
  // No rotated bones — every cube is used exactly as authored.
  const elements = [
    cubeElement({ origin: [-3, 4, -3], size: [6, 8, 6], uv: [0, 9] }, 'main'), // body
    cubeElement({ origin: [-2, 9, -6], size: [4, 6, 3], uv: [0, 0] }, 'main'), // head
    cubeElement({ origin: [-1, 9, -7], size: [2, 2, 2], uv: [14, 4] }, 'main'), // comb
    cubeElement({ origin: [-2, 11, -8], size: [4, 2, 2], uv: [14, 0] }, 'main'), // beak
    cubeElement({ origin: [-3, 0, -2], size: [3, 5, 3], uv: [26, 0] }, 'main'), // left leg
    cubeElement({ origin: [0, 0, -2], size: [3, 5, 3], uv: [26, 0] }, 'main'), // right leg
    cubeElement({ origin: [-4, 7, -3], size: [1, 4, 6], uv: [24, 13] }, 'main'), // left wing
    cubeElement({ origin: [3, 7, -3], size: [1, 4, 6], uv: [24, 13] }, 'main'), // right wing
  ];
  return normalizeMobModel(elements, { main: textureKey });
}

/**
 * Zombie and skeleton share the exact same head/body cubes (both really are the vanilla base
 * "biped" rig) and differ only in their limb cubes — skeleton's arms/legs are genuinely thinner
 * AND spaced further apart, not just a uniform width scale, so this takes the real limb cube data
 * for each rather than a single "limbWidth" parameter. `hat`/`waist`/held-item bones are skipped —
 * no equipment/overlay rendering, per the v1 non-goals.
 */
function bipedModel(textureKey: string, limbs: { arm: RawCube; leg: RawCube }): HandAuthoredTemplate {
  const elements = [
    cubeElement({ origin: [-4, 24, -4], size: [8, 8, 8], uv: [0, 0] }, 'main'), // head
    cubeElement({ origin: [-4, 12, -2], size: [8, 12, 4], uv: [16, 16] }, 'main'), // body
    cubeElement(limbs.arm, 'main'), // right arm
    cubeElement(mirrorX(limbs.arm), 'main'), // left arm
    cubeElement(limbs.leg, 'main'), // right leg
    cubeElement(mirrorX(limbs.leg), 'main'), // left leg
  ];
  return normalizeMobModel(elements, { main: textureKey });
}

function zombieModel(textureKey: string): HandAuthoredTemplate {
  return bipedModel(textureKey, {
    arm: { origin: [-8, 12, -2], size: [4, 12, 4], uv: [40, 16] },
    leg: { origin: [-3.9, 0, -2], size: [4, 12, 4], uv: [0, 16] },
  });
}

function skeletonModel(textureKey: string): HandAuthoredTemplate {
  return bipedModel(textureKey, {
    arm: { origin: [-6, 12, -1], size: [2, 12, 2], uv: [40, 16] },
    leg: { origin: [-3, 0, -1], size: [2, 12, 2], uv: [0, 16] },
  });
}

// Snow golem's stick arms reach real X ±13 (the same 26-unit total span iron golem's arms happen
// to land on) — another mob wider than one block. See `scaleBounds` and the file header.
const SNOW_GOLEM_SCALE = 16 / 26;

function snowGolemModel(textureKey: string): HandAuthoredTemplate {
  // No rotated bones. The real geo.json's two arm bones are byte-identical (same origin/size/uv) —
  // confirmed by reading the raw JSON directly, not a transcription slip on this end — so arm2 is
  // deliberately mirrored here (see file header) rather than transcribed literally, matching how
  // snow golems actually look (one stick arm on each side, not two stacked on one side).
  const arm: RawCube = { origin: [1, 20, -1], size: [12, 2, 2], uv: [32, 0] };
  const scaled = (cube: RawCube) => scaleBounds(cubeElement(cube, 'main'), SNOW_GOLEM_SCALE);
  const elements = [
    scaled({ origin: [-6, 0, -6], size: [12, 12, 12], uv: [0, 36] }), // base
    scaled({ origin: [-5, 11, -5], size: [10, 10, 10], uv: [0, 16] }), // torso
    scaled({ origin: [-4, 20, -4], size: [8, 8, 8], uv: [0, 0] }), // head
    scaled(arm), // right arm
    scaled(mirrorX(arm)), // left arm
  ];
  return normalizeMobModel(elements, { main: textureKey });
}

/**
 * Sheep's base body has the same 90°-around-X `bind_pose_rotation` as pig — `rotatedBodyElement`
 * reused as-is with sheep's own real pivot. The wool coat is a second, genuinely separate geometry
 * (its own bone tree in the real geo.json, reusing the same pivots) rendered as a second texture
 * layer over the base body, each wool cube `inflate`d outward from its matching base cube by a
 * real, different amount per part (0.5-1.75) — not a uniform "puffiness" constant.
 *
 * The wool UV origins here (0,0 / 28,8 / 0,16) are NOT what the raw Bedrock geo.json transcribes
 * (32,40,48 respectively) — those values, applied to the real `sheep/sheep_wool` texture (64x32,
 * confirmed by decoding it directly), request rows up to v=62, more than the texture's actual 32
 * rows tall: every sample clamps to the same fully-transparent last row, so the wool layer
 * rendered as literally nothing. Because `owners` ownership doesn't depend on whether a color was
 * ever found, the invisible wool still occupied every position it geometrically covers, blocking
 * `colorVoxel`'s same-position fallback from ever reaching the base body/head/legs underneath
 * either — the combined effect (confirmed against a real user screenshot) was the sheep's entire
 * torso being empty, just a floating head and wool-capped legs with nothing connecting them.
 * Re-derived by decoding the real wool texture and mapping its actual opaque pixel runs back to a
 * box-UV layout per cube (`origin`/`size` unchanged, only these 3 origins corrected) — each
 * differs from the raw geo.json value by exactly -32 in V, consistent with the source data
 * assuming a taller atlas than the real Java texture actually is.
 */
function sheepModel(bodyTextureKey: string, woolTextureKey: string): HandAuthoredTemplate {
  const pivot: [number, number] = [19, 2]; // body bone pivot [y, z]
  const elements = [
    rotatedBodyElement({ origin: [-4, 13, -5], size: [8, 16, 6], uv: [28, 8] }, pivot, 'main'),
    cubeElement({ origin: [-3, 16, -14], size: [6, 6, 8], uv: [0, 0] }, 'main'), // head
    cubeElement({ origin: [-5, 0, 5], size: [4, 12, 4], uv: [0, 16] }, 'main'), // back-left leg
    cubeElement({ origin: [1, 0, 5], size: [4, 12, 4], uv: [0, 16] }, 'main'), // back-right leg
    cubeElement({ origin: [-5, 0, -7], size: [4, 12, 4], uv: [0, 16] }, 'main'), // front-left leg
    cubeElement({ origin: [1, 0, -7], size: [4, 12, 4], uv: [0, 16] }, 'main'), // front-right leg
    inflateBounds(rotatedBodyElement({ origin: [-4, 13, -5], size: [8, 16, 6], uv: [28, 8] }, pivot, 'wool'), 1.75),
    // Front (Z-low, the face) left un-inflated — see inflateBoundsKeepFront's doc: pushing it
    // forward too eats most of the real bare-face gap the un-inflated geometry already provides.
    inflateBoundsKeepFront(cubeElement({ origin: [-3, 16, -12], size: [6, 6, 6], uv: [0, 0] }, 'wool'), 0.6), // wool head
    inflateBounds(cubeElement({ origin: [-5, 6, 5], size: [4, 6, 4], uv: [0, 16] }, 'wool'), 0.5), // wool back-left leg
    inflateBounds(cubeElement({ origin: [1, 6, 5], size: [4, 6, 4], uv: [0, 16] }, 'wool'), 0.5), // wool back-right leg
    inflateBounds(cubeElement({ origin: [-5, 6, -7], size: [4, 6, 4], uv: [0, 16] }, 'wool'), 0.5), // wool front-left leg
    inflateBounds(cubeElement({ origin: [1, 6, -7], size: [4, 6, 4], uv: [0, 16] }, 'wool'), 0.5), // wool front-right leg
  ];
  // The 4 base legs' real texture is a smooth tan-to-dark-hoof gradient (confirmed by decoding
  // sheep/sheep directly), but per user feedback the matched megablock legs looked high-contrast
  // and noisy — the palette's nearest raw-color matches for that tan bounce between
  // white_terracotta and several visually-unrelated wood planks/logs (jungle_planks,
  // stripped_jungle_log, ...) for barely-different source pixels, since there's no dedicated
  // skin-tone block in the curated palette. Restricting to just the two terracotta shades that
  // actually span the leg's real light-tan-to-dark-brown range keeps it a smooth two-tone
  // gradient instead of scattering across mismatched wood grain.
  const legRestriction = ['minecraft:white_terracotta', 'minecraft:brown_terracotta'];
  return normalizeMobModel(elements, { main: bodyTextureKey, wool: woolTextureKey }, { 2: legRestriction, 3: legRestriction, 4: legRestriction, 5: legRestriction });
}

// Widest real point across every iron golem cube (the arms, at X ±13 — 26 units total) divided
// into the 16-unit model-space X ceiling every other mob fits inside natively. See `scaleBounds`.
const IRON_GOLEM_SCALE = 16 / 26;

/**
 * The first mob wider than one block — no bind_pose_rotation anywhere, so every cube is a plain
 * `cubeElement`, but every single one needs `scaleBounds` to bring the model's real ±13 arm span
 * down to fit inside this engine's fixed 0-16 X range. Scaled uniformly on every axis rather than
 * X-only — an X-only version of this shrunk the shoulders to fit but left the real (43-unit-tall)
 * height untouched, and a real screenshot confirmed that reads as an unrecognizably tall, thin
 * figure, not a stocky golem. Scaling every axis together means the golem ends up shorter than its
 * real absolute in-game height, but keeps its true width:height:depth ratio — the shape that
 * actually reads as "iron golem" to a human viewer.
 */
function ironGolemModel(textureKey: string): HandAuthoredTemplate {
  const scaled = (cube: RawCube) => scaleBounds(cubeElement(cube, 'main'), IRON_GOLEM_SCALE);
  const elements = [
    scaled({ origin: [-9, 21, -6], size: [18, 12, 11], uv: [0, 40] }), // torso
    scaled({ origin: [-4.5, 16, -3], size: [9, 5, 6], uv: [0, 70] }), // hips
    scaled({ origin: [-4, 33, -7.5], size: [8, 10, 8], uv: [0, 0] }), // head
    scaled({ origin: [-1, 32, -9.5], size: [2, 4, 2], uv: [24, 0] }), // nose
    scaled({ origin: [-13, 3.5, -3], size: [4, 30, 6], uv: [60, 21] }), // left arm
    scaled({ origin: [9, 3.5, -3], size: [4, 30, 6], uv: [60, 58] }), // right arm
    scaled({ origin: [-7.5, 0, -3], size: [6, 16, 5], uv: [37, 0] }), // left leg
    scaled({ origin: [1.5, 0, -3], size: [6, 16, 5], uv: [60, 0] }), // right leg
  ];
  return normalizeMobModel(elements, { main: textureKey });
}

// Panda's body is 19 units wide at its widest real point (the belly, per the raw geo.json),
// exceeding the 16-unit model-space X ceiling — the same "wider than one block" situation as iron
// golem/snow golem. See `scaleBounds`.
const PANDA_SCALE = 16 / 19;

// Confirmed-solid small texture patches used to redesign the body/head below (see the doc on
// pandaModel) — each was found by decoding the real `panda/panda` texture directly and scanning
// for a rectangle that's uniformly one color, not guessed: PANDA_WHITE sits inside a 14-row-tall
// all-white band, PANDA_BLACK inside a 10-row-tall all-black band, both within the real body's
// own box-UV side-cell region.
const PANDA_WHITE: [number, number, number, number] = [50, 55, 52, 57];
const PANDA_BLACK: [number, number, number, number] = [48, 42, 50, 44];

/**
 * Panda's body bone has the same 90°-around-X `bind_pose_rotation` as pig/sheep, and every cube
 * (like every other cube here) is uniformly `scaleBounds`-ed down to fit the 16-unit X ceiling.
 *
 * The body and head are hand-redesigned rather than a literal geo.json transcription, per real
 * user feedback comparing a render against the official reference: the body bone's own natural
 * box-UV wrap (`rotatedBodyElement` + the raw `origin`/`size`/`uv`, still used for every OTHER mob
 * here) puts a real, confirmed-genuine black band across ~38% of the body's length (verified by
 * decoding the real texture row-by-row: the region our rotation math correctly maps to the
 * dorsal/top surface has a clean 2-white/10-black/14-white row pattern, out of 26 total) — far
 * wider than the reference's narrow shoulder saddle. Rather than trust a single monolithic box's
 * texture-wrap proportions (which don't cleanly separate "top" from "sides wrapping down" the way
 * a flat box-UV rect assumes for a real photographically-painted animal), the torso is now two
 * separate `stretchedBox` elements sharing the body bone's exact real rotated bounds (computed by
 * hand from `rotatedBodyElement`'s own y'/z' formulas, since only the color source needs to
 * differ): a plain white main torso, and a black saddle band deliberately narrowed to ~19% of the
 * body's real length (5 of 26 units), positioned flush against the body's front edge (i.e. right
 * behind the head, matching the reference). Both use confirmed solid-color patches
 * (`PANDA_WHITE`/`PANDA_BLACK`) instead of the natural wrap, so their color no longer depends on
 * exactly which box-UV cell the rotation math selects.
 *
 * The head is the same fix as the torso, for the same reason: its real box-UV wrap DOES contain
 * reasonably-proportioned eye patches (confirmed by decoding the region directly — two ~5×3
 * roughly square black patches, not stretched lines) — but a first attempt that kept the head's
 * natural wrap *and* added dedicated eye elements on top produced eye patches wider than intended,
 * because the head's own pre-existing black eye-region and the new dedicated eye elements
 * overlapped at the same rough position without one fully overriding the other (the dedicated
 * elements are narrower than the full head width, so the head's own wrap still showed through
 * outside them). Fixed by making the head a plain white `stretchedBox` too, same as the torso, so
 * ALL head detail — both eyes and the nose — now comes exclusively from dedicated elements with
 * exact, predictable proportions: `stretchedBox` eye patches protruding slightly in front of the
 * head's own face, and a thickened snout (depth doubled from the real 2 units to 4, extended
 * further forward rather than just resized in place, so it reads as a real 3D protrusion instead
 * of a nearly-flat decal) — the latter a deliberate proportion departure from the literal
 * geo.json, same class of adjustment already made for iron golem/snow golem/panda's own body
 * scale, where a literal transcription didn't hold up against real visual testing.
 *
 * No mirrored limbs or ears — each leg and ear has its own explicit origin in the real geo.json (no
 * `"mirror": true` flag the way villager's did), so every cube is transcribed literally rather than
 * built from one side via `mirrorX`. Sourced from Mojang's `bedrock-samples` `panda.geo.json`
 * (declared texture_width/height 64x64, confirmed) — every bone was checked explicitly for a
 * rotation/bind_pose_rotation field rather than assuming absence means zero, per this file's
 * established method; only the body bone has one.
 */
function pandaModel(textureKey: string): HandAuthoredTemplate {
  const scaledCube = (cube: RawCube) => scaleBounds(cubeElement(cube, 'main'), PANDA_SCALE);
  const scaledStretch = (from: [number, number, number], to: [number, number, number], rect: [number, number, number, number]) =>
    scaleBounds(stretchedBox(from, to, rect, 'main'), PANDA_SCALE);

  // Body bone's real rotated (pre-scale) bounds — hand-derived from rotatedBodyElement's own
  // formula for origin [-9.5,1,-6.5] size [19,26,13] pivot [14,0]: y' = 14+(z-0), z' = 0-(y-14).
  const TORSO_X: [number, number] = [-9.5, 9.5];
  const TORSO_Y: [number, number] = [7.5, 20.5];
  const TORSO_Z_FRONT = -13; // flush against the head's own back edge (head spans Z -21 to -12)
  const TORSO_Z_BACK = 13;
  const SADDLE_Z_BACK = TORSO_Z_FRONT + 5; // ~19% of the real 26-unit body length, not ~38%

  // Snout's own front-facing ("south", pre-mirror — mirrorFrontBack flips it to physical "north"
  // matching this file's front=Z-low convention, same reasoning as boxElement's south assumption)
  // gets the confirmed nose patch; every other face gets the confirmed white patch.
  const snoutNoseFace = { uv: PANDA_BLACK, texture: '#main' };
  const snoutWhiteFace = { uv: PANDA_WHITE, texture: '#main' };
  const snout: BlockModelElement = {
    from: [-3.5, 7.5, -25],
    to: [3.5, 12.5, -21], // depth doubled from the real 2 units to 4, extended further forward
    faces: { top: snoutWhiteFace, bottom: snoutWhiteFace, south: snoutNoseFace, north: snoutWhiteFace, east: snoutWhiteFace, west: snoutWhiteFace },
  };

  const elements = [
    scaledStretch([TORSO_X[0], TORSO_Y[0], TORSO_Z_FRONT], [TORSO_X[1], TORSO_Y[1], TORSO_Z_BACK], PANDA_WHITE), // torso
    scaledStretch([TORSO_X[0], TORSO_Y[0], TORSO_Z_FRONT], [TORSO_X[1], TORSO_Y[1], SADDLE_Z_BACK], PANDA_BLACK), // saddle band
    scaledStretch([-6.5, 7.5, -21], [6.5, 17.5, -12], PANDA_WHITE), // head — plain white, real eye detail comes from the dedicated eye/nose elements below instead of the head's own natural box-UV wrap (which duplicated them at a wider, less controlled proportion)
    scaleBounds(snout, PANDA_SCALE),
    scaledStretch([-5.5, 12, -21.5], [-1.5, 15, -21], PANDA_BLACK), // left eye patch
    scaledStretch([1.5, 12, -21.5], [5.5, 15, -21], PANDA_BLACK), // right eye patch
    scaledCube({ origin: [-8.5, 16.5, -18], size: [5, 4, 1], uv: [52, 25] }), // left ear
    scaledCube({ origin: [3.5, 16.5, -18], size: [5, 4, 1], uv: [52, 25] }), // right ear
    scaledCube({ origin: [-8.5, 0, 6], size: [6, 9, 6], uv: [40, 0] }), // back-left leg
    scaledCube({ origin: [2.5, 0, 6], size: [6, 9, 6], uv: [40, 0] }), // back-right leg
    scaledCube({ origin: [-8.5, 0, -12], size: [6, 9, 6], uv: [40, 0] }), // front-left leg
    scaledCube({ origin: [2.5, 0, -12], size: [6, 9, 6], uv: [40, 0] }), // front-right leg
  ];
  return normalizeMobModel(elements, { main: textureKey });
}

// Forced-color restrictions for bee's small accent parts (see beeModel's doc) — the natural
// box-UV wrap for these tiny elements was landing on stray, visually-wrong colors (most visibly,
// the antennae reading as isolated teal/cyan "eye" spots, from `lightSource` entries and other
// near-matches unrelated to a bee's actual accent color), per real user feedback on a screenshot.
// Restricting guarantees the requested color regardless of what the underlying (irrelevant, once
// restricted) UV sample happens to be — same mechanism sheep's legs use. Legs stay dark-brown
// (never flagged as wrong); stinger and antennae were moved to black per a later round of feedback
// ("the stem and tentacles should be black").
const BEE_DARK_BROWN_PALETTE = ['minecraft:brown_terracotta', 'minecraft:brown_concrete'];
const BEE_BLACK_PALETTE = ['minecraft:black_concrete', 'minecraft:black_wool', 'minecraft:black_terracotta'];

// Curated allow-list for the body — originally scoped to the body's *natural* box-UV wrap (to
// remove `mangrove_log`/`warped_stem` specifically), kept as a safety net now that the body is a
// flat `stretchedBox` (see `BEE_YELLOW`/`bodyBand` below): with a single small sampled rect, the
// matched color is nearly constant regardless of resource pack, but restricting still guarantees
// it lands on a real on-theme yellow rather than whatever's raw-closest in an unfamiliar pack.
const BEE_BODY_PALETTE = [
  'minecraft:yellow_wool',
  'minecraft:yellow_concrete',
  'minecraft:yellow_terracotta',
  'minecraft:white_wool',
  'minecraft:black_wool',
  'minecraft:black_concrete',
  'minecraft:black_terracotta',
  'minecraft:brown_terracotta',
  'minecraft:brown_concrete',
  'minecraft:orange_terracotta',
  'minecraft:red_sandstone',
  'minecraft:bamboo_planks',
];

// A confirmed clean, solid golden-yellow patch from the real `bee/bee` texture (decoded directly:
// UV rows v6-v9 within the body's own top-face region are uniformly warm yellow, RGB roughly
// 228-254/174-214/59-104, no black/brown contamination) — used to flatten the body to one smooth
// color instead of its natural per-voxel box-UV wrap. See the doc on `beeModel` for why: the
// natural wrap's real texture detail (used through round three) reads as a "messy" multi-block
// mosaic once matched per-voxel against even a restricted palette, and produced a stray pale
// artifact real users described as looking like blue "eyes" — both fixed by sourcing every body
// voxel from this one small rect instead.
const BEE_YELLOW: [number, number, number, number] = [10, 7, 17, 9];

// Curated allow-list for the wings — added alongside the body restriction above, once real-jar
// verification (after restricting the body) showed `mangrove_log` was still appearing in a built
// bee (the only unrestricted element left that could produce it): the wings' small real UV patch
// apparently contains an edge/shadow pixel whose raw color lands closer to mangrove_log than to
// any pale candidate. Restricted to plain pale/neutral tones — a real bee's wings are translucent
// white-gray, not brown — so no off-theme wood block can win there either.
const BEE_WING_PALETTE = ['minecraft:white_wool', 'minecraft:white_concrete', 'minecraft:light_gray_wool', 'minecraft:light_gray_concrete'];

/**
 * Fourth batch — bee, added per user request, then cleaned up across two further rounds of real
 * user feedback on screenshots. No `bind_pose_rotation` anywhere (the body bone is already
 * authored lying flat/horizontal in the raw geo.json, unlike pig/sheep/panda's vertical-then-
 * rotated body), so the body stays a single plain `cubeElement` using its real origin/size/uv
 * untouched — a clean solid cuboid with the real texture's natural yellow/black stripe pattern,
 * per the user's explicit request not to flatten it to a single color the way panda's torso/head
 * were.
 *
 * **Antennae/leg/stinger color cleanup (round two)**: the first version left these small accent
 * parts on the natural box-UV wrap, same as everything else — but for parts this small, the real
 * UV rect (`bee.geo.json`'s `uv:[2,0]`/`uv:[2,3]` for the antennae, a 1×2×3 region) samples only a
 * couple of real pixels, and a real screenshot showed this landing on stray, wrong-looking colors
 * (most visibly, the antennae reading as small teal/cyan "eye"-like spots). Restricting each
 * part's palette to a curated allow-list fixes this the same way sheep's legs were fixed — the
 * exact sampled color no longer matters once the candidate list is narrowed to only the intended
 * hues. Stinger and antennae were restricted to `BEE_DARK_BROWN_PALETTE` in round two, then moved
 * to `BEE_BLACK_PALETTE` in round three per further feedback ("the stem and tentacles should be
 * black" — "stem" = stinger, "tentacles" = antennae); legs stayed dark-brown throughout, never
 * flagged as wrong.
 *
 * **Tail cap (round two)**: per the user's explicit request ("the very back section must be solid
 * black"), a `tailCap` element covers the body's own rearmost 2 (real) units, sharing the same X/Y
 * footprint, restricted to `BEE_BLACK_PALETTE`. It's listed *after* the body in `elements`, so
 * `rasterizeItemModel`'s "most-recently-added owner wins" rule (see its own doc) makes it override
 * the body's natural coloring in the overlapping region — no need to shorten the body element
 * itself, which would've distorted its own real box-UV wrap for no benefit.
 *
 * **Body stripes (round three)**: the body's natural box-UV wrap paints its real yellow/black
 * detail as a mottled, roughly-diagonal pattern spread across the whole side panel, concentrated
 * toward the FRONT (head) end of the real texture region rather than reading as 2 clean stripes —
 * confirmed directly against the built grid (an ASCII side-view of the body's exposed east/west
 * panel showed the alternating dark/light columns clustered in the low-Z half, not the high-Z/tail
 * half). Per the user's explicit request ("the 2 strips... should be close to his back... and not
 * the head"), 2 dedicated `stretchedBox` stripe bands were added — same technique as the tail cap
 * — each spanning the body's full X/Y footprint over a real 1-unit Z slice, positioned in the REAR
 * half of the body (real Z 0-1 and Z 2-3, out of the body's real Z -5..5 range), with the second
 * stripe flush against the tail cap's own front edge (Z=3). Both restricted to `BEE_BLACK_PALETTE`.
 *
 * **Body flattened to a solid color (round four)**: round three kept the body's natural per-voxel
 * box-UV wrap everywhere outside the 2 new rear stripes — but per further real user feedback on a
 * screenshot ("the eye color is blue, smooth the body color is look like a mess"), that natural
 * wrap was still the problem, just relocated: (1) the real texture's per-pixel detail, matched
 * per-voxel even against the restricted `BEE_BODY_PALETTE`, produced a visually busy multi-block
 * mosaic across the body rather than a clean solid color; (2) a real-jar ASCII front-view check
 * found 2 symmetric single-voxel `white_wool` pixels landing right where a bee's eyes would
 * visually sit — a genuine artifact of the real texture's own antialiasing/highlight detail at
 * that exact spot (confirmed no `blue`/`cyan`/`light_blue` block appears anywhere in a built bee's
 * material list, so "blue eyes" was this pale highlight reading as cool-toned against the dark
 * head/collar patch around it, not an actual palette mismatch). Both traced to the same root cause
 * — the natural wrap's per-pixel detail — and both fixed the same way panda's torso/head were:
 * the body element itself is now a `stretchedBox` sourcing every voxel from one small confirmed
 * solid patch (`BEE_YELLOW`) instead of its natural per-voxel wrap, eliminating the mosaic and the
 * stray highlight in one change, and also making the 2 rear stripes read unambiguously as the
 * *only* 2 stripes (round three's stripes were real and correctly placed, but were easy to miss
 * amid the natural wrap's other black-ish patches elsewhere on the body).
 *
 * **Body palette restriction (round three, kept in round four)**: originally scoped to the body's
 * natural wrap, per the user's explicit request ("remove the usage of mangrove log and warped
 * stem, replace warped stem with black wool") — the natural wrap's near-black pixels were landing
 * on `mangrove_log`/`warped_stem`/`stripped_warped_stem` purely on raw Lab distance, despite being
 * off-hue (reddish/teal) for a real bee's neutral black-and-yellow coloring, the same "closest in
 * Lab distance isn't the same as looking right" class of problem `isWoodFamilySource`/
 * `isDirtFamilySource` (lightSourceExclusion.ts) already fix for light-source blocks specifically.
 * Now that the body is a flat `stretchedBox`, `BEE_BODY_PALETTE` mostly acts as a safety net (a
 * single small sampled rect already matches near-consistently), but is kept for the same
 * cross-resource-pack robustness reasoning, and `black_wool` stays in the allow-list as the
 * requested replacement, in case any resource pack's equivalent yellow patch samples darker than
 * this jar's.
 *
 * **Legs (round two)**: the original transcription used 3 full-width flat bars (`leg_front`/
 * `leg_mid`/`leg_back`, one per Z-depth, spanning the body's whole 7-unit X footprint) thickened
 * into thin slabs via `thickenAxis` — real geo.json data, but this app's universal hollow-shell
 * edge-culling (every mode hollows out any voxel whose neighbors are all solid, keeping only
 * surface voxels) hollowed out most of each bar's width once sandwiched between the body above and
 * neighboring bars, leaving a sparse, uneven residue rather than 6 clean legs. Per the user's
 * explicit request ("6 clean dark-brown 1x1 block pegs"), replaced with 6 small, fully-isolated peg
 * elements (2 per Z-depth, one hugging each of the body's left/right X edges) — small and isolated
 * enough that almost every voxel touches air on some side, so the same hollow-shell rule leaves
 * them intact instead of hollowing them out. `thickenAxis` is no longer needed for legs (each peg
 * is a normal nonzero-in-every-axis box from the start); it's kept only for the stinger below,
 * which is still a genuinely zero-width element in the real geo.json.
 *
 * **Stinger (unchanged geometry)**: still built from the real geo.json's `size:[0,1,2]` cube via
 * `thickenAxis` (its real X-width is zero — the same zero-thickness-flat-plane situation
 * documented for the original legs), positioned at real X 0.5 (the body's own X center) and Z 5-7
 * (flush against, and extending backward from, the tail cap's own back edge at Z=5) — already
 * satisfies "protruding directly from the center-back of the black rear section" without needing
 * to move it.
 *
 * The wings (`rightwing_bone`/`leftwing_bone`) are unchanged since round one — hand-redesigned
 * rather than transcribed literally, since each raw cube is zero-thickness (`size:[9,0,6]`) and
 * each wing bone additionally carries a real two-axis `rotation` field (`[15,-15,0]`/`[15,15,0]`)
 * with no dedicated rotation math in this file (only pig/sheep/panda body's single 90°-around-X
 * case is handled, via `rotatedBodyElement`) — and even correct rotation math would still have to
 * degrade to *some* axis-aligned bounding box for this voxel-grid engine, which is a poor visual
 * match for a large tilted flat plane regardless. The literal unrotated cube position was checked
 * and rejected: rightwing spans real X -10 to -1, leftwing X 2 to 11 — a 21-unit total wingspan,
 * wider than this engine's 16-unit X ceiling on its own, and visually a flat "spread eagle" pose,
 * not a resting bee. Each wing is instead placed and sized by hand to approximate the real
 * resting/folded silhouette: a short panel sitting on top of the body's back edge, extending only
 * modestly past the body's own footprint on each side. Real painted wing-texture color is still
 * sourced correctly — via `stretchedBox` with a rect read from each wing's own real UV "top"
 * region (`bee.geo.json`'s `uv:[0,18]`/`uv:[9,24]`, each with the real dx=9/dz=6 footprint — the
 * same box-UV top-face formula `boxElement` uses internally, computed by hand here since the box
 * being sampled no longer matches the real cube's size) rather than guessed. `bee` was also added
 * to `LIGHT_SOURCE_EXCLUDED_EXACT_NAMES` (lightSourceExclusion.ts) in round two — the wings' pale
 * color was pulling in a real chunk of froglight/sea_lantern (confirmed: ~8% of a built bee's
 * voxels at res 16), the same "pale surface reads as a light-source glow" pattern already fixed
 * for sheep's wool. In round three, once the body was restricted to `BEE_BODY_PALETTE`, real-jar
 * verification showed `mangrove_log` still appearing — the wings were the only remaining
 * unrestricted element, so their small real UV patch (likely an edge/shadow pixel) was the source.
 * Restricted to `BEE_WING_PALETTE` (plain pale/neutral tones) for the same reason as the body.
 */
function beeModel(textureKey: string): HandAuthoredTemplate {
  const rightWingRect: [number, number, number, number] = [6, 18, 15, 24]; // real uv:[0,18] top-face rect (u+dz,v)-(u+dz+dx,v+dz)
  const leftWingRect: [number, number, number, number] = [15, 24, 24, 30]; // real uv:[9,24] top-face rect

  const leg = (x0: number, z0: number) => cubeElement({ origin: [x0, 0, z0], size: [1, 2, 1], uv: [26, 1] }, 'main');
  // Body-footprint bands (stretchedBox — see doc above), all sharing the body's own real X/Y
  // range; only their Z slice and sampled rect differ. The stripe/cap bands' rect is irrelevant
  // (any valid uv works) since their palette restriction below forces black regardless — passed
  // BEE_YELLOW too just to keep every call site uniform.
  const bodyBand = (z0: number, z1: number) => stretchedBox([-3, 2, z0], [4, 9, z1], BEE_YELLOW, 'main');

  const elements = [
    bodyBand(-5, 5), // body — flattened to one solid color (BEE_YELLOW, restricted below) instead of its natural per-voxel wrap
    bodyBand(0, 1), // rear stripe 1 — forced black below
    bodyBand(2, 3), // rear stripe 2, flush against the tail cap — forced black below
    bodyBand(3, 5), // tail cap — same footprint as body's rear, forced solid black below
    thickenAxis(cubeElement({ origin: [0.5, 5, 5], size: [0, 1, 2], uv: [26, 7] }, 'main'), 0, 1), // stinger, forced black below
    cubeElement({ origin: [2, 7, -8], size: [1, 2, 3], uv: [2, 0] }, 'main'), // right antenna, forced black below
    cubeElement({ origin: [-2, 7, -8], size: [1, 2, 3], uv: [2, 3] }, 'main'), // left antenna, forced black below
    // 6 clean, isolated leg pegs (2 per Z-depth, hugging the body's left/right X edges) — not the
    // original full-width flat bars, which mostly hollowed out under this app's universal
    // edge-culling once sandwiched against the body and each other. All forced dark-brown below.
    leg(-3, -2.5), // front-left
    leg(3, -2.5), // front-right
    leg(-3, -0.5), // mid-left
    leg(3, -0.5), // mid-right
    leg(-3, 1.5), // back-left
    leg(3, 1.5), // back-right
    // Wings: hand-placed resting silhouette, not the literal (unrotated, 21-unit-wide) raw cubes — see doc above.
    stretchedBox([-7, 9, -3], [-3, 9.75, 3], rightWingRect, 'main'),
    stretchedBox([4, 9, -3], [8, 9.75, 3], leftWingRect, 'main'),
  ];
  const restrictions: Record<number, string[]> = {
    0: BEE_BODY_PALETTE, // body
    1: BEE_BLACK_PALETTE, // rear stripe 1
    2: BEE_BLACK_PALETTE, // rear stripe 2
    3: BEE_BLACK_PALETTE, // tail cap
    4: BEE_BLACK_PALETTE, // stinger
    5: BEE_BLACK_PALETTE, // right antenna
    6: BEE_BLACK_PALETTE, // left antenna
    7: BEE_DARK_BROWN_PALETTE,
    8: BEE_DARK_BROWN_PALETTE,
    9: BEE_DARK_BROWN_PALETTE,
    10: BEE_DARK_BROWN_PALETTE,
    11: BEE_DARK_BROWN_PALETTE,
    12: BEE_DARK_BROWN_PALETTE, // 6 leg pegs
    13: BEE_WING_PALETTE,
    14: BEE_WING_PALETTE, // 2 wings
  };
  return normalizeMobModel(elements, { main: textureKey }, restrictions);
}

/**
 * Fifth batch — wolf, added per user request. Sourced the same way as every mob here: fetched the
 * real `wolf.geo.json` from Mojang's `bedrock-samples` repo directly (not summarized/paraphrased —
 * `curl`'d the raw file so every origin/size/uv below is transcribed byte-for-byte, not read off an
 * AI-summarized version) and confirmed no bone anywhere has a `rotation`/`bind_pose_rotation` field
 * — the simplest case so far, same as chicken/bee: every cube is a plain `cubeElement` using its
 * real origin/size/uv untouched, no `rotatedBodyElement`/`scaleBounds` needed (widest real point is
 * `upperBody` at 8 units, well under the 16-unit X ceiling).
 *
 * Real bone layout: `head` (main skull + 2 ear cubes + a separate snout cube, all sharing the
 * head's local space, no per-cube rotation), `body` (a plain rear-torso box — present in the raw
 * geo.json, but deleted here; see round three's "low belly" fix below) and `upperBody` (a
 * separate, larger box for the raised chest/shoulder hump real wolves have — genuinely overlapped
 * `body` in the raw data), 4 independent `legN` bones (each its own explicit origin, no mirror
 * flag — `leg0`/`leg1` sit at the tail end (Z 6-8, i.e. the REAR legs) and `leg2`/`leg3` sit at the
 * head end (Z -5 to -3, the FRONT legs) — confirmed by comparing each leg's Z position against the
 * head's (Z -12 to -5) and tail's (Z 7-9), not assumed from bone-name order), and `tail` (a plain
 * vertical box at the rear, no rotation in the bind pose — real in-game wagging/angling is a
 * runtime animation this format doesn't carry).
 *
 * Verified against the real jar (`wolf/wolf.png`, 64×32 — matches the geo.json's own declared
 * `texture_width`/`texture_height` exactly, unlike sheep's wool texture which didn't) before
 * trusting the front/back orientation: sampled the head cube's own `boxElement`-computed "south"
 * rect (pre-mirror) directly and found a symmetric pair of near-black eye pixels flanked by white —
 * and the snout's own "south" rect shows a single dark nose-tip pixel plus a darker muzzle-
 * underside row. Same "eyes land in boxElement's south rect, corrected to the true front by
 * `normalizeMobModel`'s uniform `mirrorFrontBack`" pattern every other mob already relies on — no
 * special-casing needed here.
 *
 * **Round two, three real fixes from direct user feedback on the first build (no screenshot this
 * time, but concrete enough to act on directly):**
 * - **Tail "not oriented right"**: the raw geo.json tail bone has no rotation anywhere, authored as
 *   a literal vertical post (8 tall × 2 deep) directly behind the body — reads as a flagpole, not a
 *   tail, once voxelized with no animation to soften it. Same class of departure as panda's snout /
 *   bee's wings (hand-placed silhouette instead of literal transcription): rebuilt as a
 *   backward-and-slightly-up-pointing box (the opposite ratio) flush against the body's real rear
 *   edge. Built via `stretchedBox` sourcing one small confirmed-uniform real fur patch
 *   (`WOLF_TAIL_FUR_RECT`, decoded directly — the tail's real painted region is a flat light gray
 *   matching the body, no separate tip color to preserve) rather than `cubeElement`, since the
 *   redesigned box's proportions no longer match the real cube's own box-UV layout.
 * - **"Color grading is a bit off"**: an unrestricted real build leaned heavily on stark,
 *   manufactured-looking `white_concrete`/`diorite`/`smooth_stone` (confirmed: over 2200 of ~2960
 *   voxels) for what should read as soft fur — those are real, close color matches (the default
 *   wolf texture genuinely is quite pale), but the *material* reads wrong for skin/fur regardless
 *   of raw color accuracy, the same "matched but mismatched-looking" class of problem sheep's legs
 *   and beacon's crystal already needed `elementPaletteRestrictions` for. `WOLF_FUR_PALETTE`
 *   restricts the main fur-bearing elements (`upperBody`, all 4 legs — not ears/snout/tail, no
 *   evidence those specifically had the same problem) to wool/terracotta tones only, spanning the
 *   same real light-to-medium gray range without wandering into concrete/polished stone.
 *
 * **Round three, three more real fixes from a real screenshot:**
 * - **"Low belly, why 2 of them"**: `body` (the original separate rear-torso bone, Y 3-12) and
 *   `upperBody` (Y 7-13, added after so it wins their overlap) only share Y 7-12 — `body`'s own
 *   Y 3-7 slice sticks out below `upperBody` uncovered, narrower than `upperBody` above it, reading
 *   as a distinct low-hanging shelf along the belly (the "2 low bellies" — the step itself plus the
 *   torso above it reading as two stacked layers). Once that Y 3-7 slice is removed, `body`'s
 *   entire remaining footprint (X -3..3, Z -1..5) is already fully contained inside `upperBody`'s
 *   (X -4..4, Z -5.5..6 after the extendFront fix below) on every axis — completely hidden, so
 *   `body` is deleted outright rather than kept as dead geometry. This also means `extendFront`
 *   (used to close the real head/`upperBody` neck gap, still needed) is now the only thing standing
 *   in for the old `body`'s forward reach.
 * - **Tail too long**: shortened from 6 real units of backward reach to 4 (height shrunk too, from
 *   4 to 3, keeping Z-depth > Y-height so it still reads as backward-pointing rather than a post
 *   again) — same repositioned silhouette, just less of it.
 * - **Eye color accidentally removed**: round two's `WOLF_FUR_PALETTE` restriction was applied to
 *   the whole `head` element, but the head's natural box-UV wrap is where the real eye pixels live
 *   (see the front/back verification above) — restricting the *entire* head to only white/light-gray
 *   wool/terracotta left literally no dark candidate for the eyes to match, forcing them to the
 *   closest allowed (light) color at every resolution. Fixed with `WOLF_HEAD_PALETTE` — the same 4
 *   fur tones plus `black_concrete` — so light fur pixels still avoid stone/concrete while the
 *   genuinely dark eye pixels have a real dark candidate again.
 *
 * **Round four, two more real fixes from real user feedback:**
 * - **Tail too short (again) + wrong color**: lengthened back out from round three's 4 units of
 *   backward reach to 6 (height stays at round three's 3, so it still reads as backward-pointing
 *   rather than a post). Color: the tail was never added to `WOLF_FUR_PALETTE`'s restriction list,
 *   so unlike every other main body part it was free to match *any* palette block — even though its
 *   real texture color is the same light gray as the body, an unrestricted match can (and did) land
 *   on a visibly different block than the restricted body/legs. Added to the restriction list so it
 *   draws from the same curated fur tones as the rest of the animal.
 * - **Rear legs not attached (front legs were fine)**: `upperBody`'s real rear edge (Z=6, before
 *   this fix) exactly equals the rear legs' own front edge (Z=6) — a single shared boundary plane,
 *   not a real overlap. The *front* legs never had this problem because `extendFront` already pushes
 *   upperBody's front edge a full 0.5 units past the front legs' own back edge, comfortably inside
 *   its footprint — but nothing had ever extended the back edge the same way. A boundary-only touch
 *   can still voxelize to a visible gap depending on how each side's geometry rounds to the output
 *   grid, which is exactly what real user feedback reported. Fixed with the new `extendBack` helper
 *   (mirrors `extendFront`), pushing upperBody's rear edge out by 1 unit to genuinely overlap the
 *   rear legs the same way the front is already overlapped.
 *
 * **Round five, per further real user feedback that the hind legs were still (partly) floating**:
 * round four's 1-unit `extendBack` only covered *half* the rear legs' own 2-unit Z-thickness
 * (rear legs span real Z 6-8; upperBody's rear edge only reached Z=7) — nowhere near the front
 * legs' own attachment, where upperBody's front edge (`extendFront`, unchanged) comfortably
 * contains the *entire* front legs' Z-footprint (real Z -5..-3) with 0.5 units of margin to spare.
 * `extendBack`'s amount increased from 1 to 2.5, so upperBody's rear edge now reaches Z=8.5 —
 * fully containing the rear legs' whole Z-thickness plus the same 0.5-unit margin the front
 * already had, matching front and rear to the same standard instead of leaving rear on a thinner
 * boundary-only touch. Tail also adjusted per the same feedback: less tall (height 3→2) and longer
 * (backward reach 6→8).
 */
const WOLF_TAIL_FUR_RECT: [number, number, number, number] = [9, 20, 11, 22];

// Excludes concrete/polished-stone-family candidates for wolf's main fur elements — see the doc on
// wolfModel's round-two fixes above. Spans the same real light-to-medium gray range via wool/
// terracotta instead, which reads as soft fur rather than a building material.
const WOLF_FUR_PALETTE = ['minecraft:white_wool', 'minecraft:light_gray_wool', 'minecraft:white_terracotta', 'minecraft:light_gray_terracotta'];

// Same as WOLF_FUR_PALETTE plus black — the head is the one fur-restricted element that also needs
// to keep matching the real dark eye pixels its natural UV wrap contains (see round three's eye-
// color fix above); every other fur element (upperBody, legs) has no such dark detail to preserve.
const WOLF_HEAD_PALETTE = [...WOLF_FUR_PALETTE, 'minecraft:black_concrete'];

function wolfModel(textureKey: string): HandAuthoredTemplate {
  const elements = [
    extendBack(extendFront(cubeElement({ origin: [-4, 7, -1], size: [8, 6, 7], uv: [21, 0] }, 'main'), 4.5), 2.5), // upperBody (chest/shoulder hump): front extended to meet the head (closes the real geo.json's neck gap), back extended to fully contain the rear legs' Z-footprint with the same 0.5-unit margin the front legs already had (round five fix — round four's amount only covered half the rear legs' width) — the old separate "body" bone is gone (see round three's "low belly" fix), fully redundant once its own unique low slice was removed
    cubeElement({ origin: [-3, 7.5, -9], size: [6, 6, 4], uv: [0, 0] }, 'main'), // head
    cubeElement({ origin: [-3, 13.5, -7], size: [2, 2, 1], uv: [16, 14] }, 'main'), // left ear
    cubeElement({ origin: [1, 13.5, -7], size: [2, 2, 1], uv: [16, 14] }, 'main'), // right ear
    cubeElement({ origin: [-1.5, 7.51563, -12], size: [3, 3, 4], uv: [0, 10] }, 'main'), // snout
    cubeElement({ origin: [-2.5, 0, 6], size: [2, 8, 2], uv: [0, 18] }, 'main'), // rear-left leg
    cubeElement({ origin: [0.5, 0, 6], size: [2, 8, 2], uv: [0, 18] }, 'main'), // rear-right leg
    cubeElement({ origin: [-2.5, 0, -5], size: [2, 8, 2], uv: [0, 18] }, 'main'), // front-left leg
    cubeElement({ origin: [0.5, 0, -5], size: [2, 8, 2], uv: [0, 18] }, 'main'), // front-right leg
    stretchedBox([-1, 9, 5], [1, 11, 13], WOLF_TAIL_FUR_RECT, 'main'), // tail — backward/up-pointing box; round five made it thinner (height 3→2) and longer (backward reach 6→8) per further feedback
  ];
  const restrictions: Record<number, string[]> = {
    0: WOLF_FUR_PALETTE, // upperBody
    1: WOLF_HEAD_PALETTE, // head — keeps black for the eyes
    5: WOLF_FUR_PALETTE,
    6: WOLF_FUR_PALETTE,
    7: WOLF_FUR_PALETTE,
    8: WOLF_FUR_PALETTE, // 4 legs
    9: WOLF_FUR_PALETTE, // tail — round four: match the body's own restricted fur colors instead of being free to match a different block entirely
  };
  return normalizeMobModel(elements, { main: textureKey }, restrictions);
}

/**
 * Default variant only for v1 (see the project's Mobs-mode plan) — real mobs have biome/profession
 * texture variants (`pig/warm_pig.png`, `pig/cold_pig.png`, ...) that aren't picked yet; adding a
 * variant picker later is a clean extension of this same flat-registry pattern, mirroring how
 * DYE_COLORS/SIGN_WOODS expand handAuthoredTemplates.ts's bed/sign registry today.
 */
export const HAND_AUTHORED_MOB_TEMPLATES: Record<string, HandAuthoredTemplate> = {
  pig: pigModel('pig/temperate_pig'),
  chicken: chickenModel('chicken/temperate_chicken'),
  zombie: zombieModel('zombie/zombie'),
  skeleton: skeletonModel('skeleton/skeleton'),
  'snow golem': snowGolemModel('snow_golem'),
  sheep: sheepModel('sheep/sheep', 'sheep/sheep_wool'),
  'iron golem': ironGolemModel('iron_golem/iron_golem'),
  panda: pandaModel('panda/panda'),
  bee: beeModel('bee/bee'),
  wolf: wolfModel('wolf/wolf'),
};
