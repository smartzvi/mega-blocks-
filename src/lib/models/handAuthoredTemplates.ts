import type { FaceName } from '../../types/minecraft';
import type { BlockModel, BlockModelElement } from '../../types/item';

/**
 * Chest, trapped_chest, ender_chest, all shulker_box colors, all bed colors, and all sign/wall
 * sign wood types are rendered by hardcoded Java code, not any model JSON (confirmed against the
 * real 1.21.8 jar: chest.json's, bed.json's, and oak_sign.json's entire model is just
 * `{"textures": {"particle": "minecraft:block/oak_planks"}}` — no elements at all). The generic
 * blockstate/model engine can never reach these, so their geometry and UV mapping are hand-
 * authored here instead, reusing rasterizeItemModel unchanged (it only ever consumed a plain
 * `{elements, textures}` + a texture map, regardless of where that came from).
 *
 * The numbers below were derived empirically, not from memory: the real entity textures were
 * decoded and their alpha-channel content mapped column-by-column to find the actual UV region
 * boundaries (see the project's investigation notes), then interpreted using Minecraft's standard
 * "box-UV" single-origin unwrap (the same layout Blockbench's Box UV mode and every vanilla
 * entity model use: for a box of size dx×dy×dz at UV origin (u,v), the side faces sit at
 * (u, v+dz) spanning right/front/left/back left-to-right, and the top/bottom pair sits directly
 * above at (u+dz, v)).
 *
 * Chest (verified cleanly: exactly 2 boxes, no separate latch geometry — the lock/latch is baked
 * into the front-face texture pixels, not modeled): base box UV origin (0,19), lid box UV origin
 * (0,0), both 14×_×14 footprint centered in the block with a 1px margin.
 *
 * Shulker box's real geometry is genuinely more intricate (small corner/hinge details visible in
 * the texture beyond a simple 2-box split), so this is a coarser approximation than chest: a
 * short base tray + a taller lid box, both full 16×16 footprint, matching the two cleanest
 * full-width UV bands found in the texture. Good enough to be recognizable; not pixel-perfect.
 *
 * Bed and sign templates are documented individually above their model functions below (bedModel,
 * signModel) since each needed its own empirical UV walkthrough.
 */

export function boxElement(
  from: [number, number, number],
  to: [number, number, number],
  uvOrigin: [number, number],
  textureVar: string
): BlockModelElement {
  const [u, v] = uvOrigin;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const tex = `#${textureVar}`;

  const rect = (x1: number, y1: number, x2: number, y2: number): [number, number, number, number] => [x1, y1, x2, y2];

  const faces: Partial<Record<FaceName, { uv: [number, number, number, number]; texture: string }>> = {
    east: { uv: rect(u, v + dz, u + dz, v + dz + dy), texture: tex },
    south: { uv: rect(u + dz, v + dz, u + dz + dx, v + dz + dy), texture: tex },
    west: { uv: rect(u + dz + dx, v + dz, u + 2 * dz + dx, v + dz + dy), texture: tex },
    north: { uv: rect(u + 2 * dz + dx, v + dz, u + 2 * dz + 2 * dx, v + dz + dy), texture: tex },
    top: { uv: rect(u + dz, v, u + dz + dx, v + dz), texture: tex },
    bottom: { uv: rect(u + dz + dx, v, u + dz + 2 * dx, v + dz), texture: tex },
  };

  return { from, to, faces };
}

/**
 * Like boxElement, but every face gets the exact same fixed UV rect instead of one derived from
 * the box's own from/to size. boxElement's box-UV formula assumes the element's world-space size
 * roughly matches the real texture region it's meant to sample — true for chest/shulker/bed's
 * headboard, all sized to their real measured UV footprint — but a bed's mattress body has to
 * span the full 2-block length while its actual painted texture patch is tiny (a few pixels),
 * so deriving a rect from the box's size would request UV coordinates far outside the 64x64
 * texture. samplePixel() (rasterizeModel.ts) clamps out-of-range coordinates to the texture edge
 * rather than erroring, which is exactly how this was caught: white/black/blue bed textures all
 * have a solid black pixel at that clamped edge, so a stretched-far-beyond-bounds mattress read
 * as almost entirely black_concrete instead of the dyed blanket color. Using one small, verified
 * rect and letting the UV interpolation stretch it across the whole box (same interpolation
 * rasterizeItemModel already does per voxel) keeps every sample inside real painted pixels.
 */
export function stretchedBox(
  from: [number, number, number],
  to: [number, number, number],
  rect: [number, number, number, number],
  textureVar: string
): BlockModelElement {
  const faceDef = { uv: rect, texture: `#${textureVar}` };
  return { from, to, faces: { top: faceDef, bottom: faceDef, north: faceDef, south: faceDef, east: faceDef, west: faceDef } };
}

function chestModel(textureKey: string): BlockModel {
  return {
    textures: { main: textureKey },
    elements: [
      boxElement([1, 0, 1], [15, 10, 15], [0, 19], 'main'), // base
      boxElement([1, 10, 1], [15, 15, 15], [0, 0], 'main'), // lid
    ],
  };
}

function shulkerModel(textureKey: string): BlockModel {
  return {
    textures: { main: textureKey },
    elements: [
      boxElement([0, 0, 0], [16, 4, 16], [0, 32], 'main'), // base tray
      boxElement([0, 4, 0], [16, 12, 16], [0, 0], 'main'), // lid
    ],
  };
}

/** Like `stretchedBox`, but the `top` face gets its own separate UV rect instead of sharing the
 *  one every other face uses. Built for the bed's mattress/pillow: per explicit user request, only
 *  the *top* faces' texture mapping should change (no geometry, no other face) to add a seam/
 *  border detail — the bottom/side faces keep sampling the original plain rect untouched. */
function stretchedBoxWithTop(
  from: [number, number, number],
  to: [number, number, number],
  rect: [number, number, number, number],
  topRect: [number, number, number, number],
  textureVar: string
): BlockModelElement {
  const base = stretchedBox(from, to, rect, textureVar);
  return { from, to, faces: { ...base.faces, top: { uv: topRect, texture: `#${textureVar}` } } };
}

/** Mirror of `stretchedBoxWithTop`, overriding `bottom` instead. Built for the bed's seam-line
 *  elements: per explicit user request, the darker seam color must be confined to the
 *  bottom-facing (underside) pixels only — the outer side frame (its east/west faces, exposed at
 *  the model's own X=0/X=16 boundary since each seam spans the rail's full width) must stay clean,
 *  uniform light oak, matching the base rail exactly rather than spilling the seam color onto the
 *  visible side surface. */
function stretchedBoxWithBottom(
  from: [number, number, number],
  to: [number, number, number],
  rect: [number, number, number, number],
  bottomRect: [number, number, number, number],
  textureVar: string
): BlockModelElement {
  const base = stretchedBox(from, to, rect, textureVar);
  return { from, to, faces: { ...base.faces, bottom: { uv: bottomRect, texture: `#${textureVar}` } } };
}

/**
 * A real Minecraft bed is a low, flat block — well under half a block tall. That was this
 * template's original target, verified against actual in-game renders (an even earlier version
 * mistook one ambiguous UV region for a tall vertical headboard panel, which doesn't exist on the
 * real block). Per an explicit user redesign request with its own numeric spec, the template now
 * instead builds a deliberately taller, blockier "voxel-art" bed profile — a stylistic choice, not
 * a correction — while reusing the same real, confirmed-correct UV patches the original
 * investigation found (color still comes from real painted texture pixels, just applied to new
 * proportions/positions):
 * - a dyed mattress/blanket patch at pixel rect (22,24)-(38,27), confirmed a real per-color value
 *   in every bed color checked (~(126,25,25) in red.png, ~(186,191,191) in white.png);
 * - a whitish pillow patch at rect (6,2)-(22,6), confirmed color-independent (~(168,176,177) to
 *   ~(236,236,236), a gray-to-white gradient, identical in red.png and white.png — a bed's pillow
 *   is always white regardless of dye color);
 * - a flat, uncontaminated wood-colored patch at (53,1)-(58,3), originally used for both the frame
 *   rail and the legs — since replaced by real oak block textures, see the latest-round paragraph
 *   below.
 *
 * Layout (per the user's explicit spec, then rebalanced once more per a follow-up proportions
 * request): X 0-16, Z 0-32 (Foot/front section Z 0-16, Head/back section Z 16-32), Y 0-9 total,
 * unchanged. The Y 0-3/3-9 frame/mattress split from the original spec read as legs too short and
 * a mattress too thick, per real user feedback — moved to Y 0-5 (frame: four 2x5x2 corner legs,
 * taller and more visible, plus a thin full-footprint rail at Y 4-5 connecting them just under the
 * mattress) / Y 5-9 (mattress, now 4 tall instead of 6). The user was explicit that the *top*
 * surface — the blanket's own top at Y 9, and the pillow entirely — must stay exactly where it
 * was, so only the mattress's bottom edge moved up (9 stays fixed, 3→5); the pillow (Y 6-9, Z
 * 26-32) needed no change at all, since it already sat within the new, shorter mattress range.
 *
 * Full-footprint 16-wide, 32-deep blanket slab in the bed's dyed color — built as a single box
 * spanning both sections rather than two identical 16-deep halves, since nothing visually
 * distinguishes them apart from the pillow — with a 16-wide, 3-tall, 6-deep white pillow overlaid
 * at the very top-rear of the head section. The pillow element is listed after the blanket in
 * `elements`, so `rasterizeItemModel`'s "most-recently-added owner wins" rule (see its own doc)
 * paints it over the blanket there without needing to carve a hole in the blanket element itself.
 *
 * **Top-face-only UV touch-up (latest round)**: per explicit user request — "do not change the
 * geometry at all, only the top faces' texture mapping" — the mattress and pillow's `top` face now
 * use a different, separately-chosen UV rect (`blanketTopRect`/`pillowTopRect`, via
 * `stretchedBoxWithTop`) than their other 5 faces, which still sample the original
 * `blanketRect`/`pillowRect` untouched. Both new rects are real pixels from the same
 * `bed/<color>.png` texture, found by decoding it directly and scanning a much wider area than the
 * original small patches covered:
 * - The real texture's blanket region turns out to be taller than the 3 rows `blanketRect`
 *   originally used: row v24 is a genuine flat DARK-red seam line (the user's requested "folded
 *   sheet" detail, already painted by Mojang, just previously cropped out), rows v25-27 are a
 *   clean, nearly-flat red with only very subtle 2-tone variation between them (the requested
 *   "subtle dithering") — and rows v18-21/v28-29 just outside that range are the genuinely noisy,
 *   wrinkle-painted pixels the user called "wavy/swirled pattern noise". `blanketTopRect` uses
 *   only the clean v24-27 band, and — since `FACE_AXES`' `top` entry maps its v-axis straight to Z
 *   with no flip — deliberately runs its v-endpoints in *reverse* (`[..., 27, ..., 24]`, high v at
 *   Z=0 low v at Z=32) so the dark seam value lands on the REAR portion of the box's Z-span,
 *   nearest the pillow, instead of at the front. Caveat, stated plainly rather than glossed over: a
 *   single element's UV interpolates linearly across its own entire Z-extent (here, the full 32
 *   units spanning both bed sections), so with only 3 real source rows to work with the seam
 *   necessarily renders as a gradient band across roughly the rear third of the visible mattress
 *   (in front of the pillow), not a crisp single-voxel line — getting a literal 1-pixel-wide line
 *   at an exact Z position would need either fabricated (non-real) pixel data or a dedicated
 *   geometry element, both ruled out by the user's explicit "texture mapping only" request.
 * - The real pillow region also extends further than `pillowRect` originally used: rows v2 and v13
 *   are the SAME flat light-gray tone, symmetric around a bright white/near-white band in between
 *   (rows v3-12, which even show a subtle natural center dip around each pillow "lobe" — real
 *   authored texture detail, not noise). `pillowTopRect` uses this full symmetric v2-13 span
 *   (double the original v2-6), which — mapped across the pillow element's own real Z 26-32 depth —
 *   reproduces exactly the requested "white top with a subtle light-gray border on the inner
 *   edges", using real vanilla pixels front-to-back rather than the previous asymmetric half-slice.
 *
 * **Frame/leg textures switched to real oak block textures (round 3)**: per explicit user request
 * — "the bottom face directly under the mattress must be a solid Oak Planks texture with visible
 * plank seam lines... the 4 corner legs should have standard Oak wood texture" — the frame rail
 * and legs stopped sampling the bed's own flat `woodRect` patch and started referencing the real
 * `oak_planks`/`oak_log`/`oak_log_top` block textures via a full `[0,0,16,16]` rect each, later
 * widened (round 4) to also allow `dark_oak_*` matches so the real texture's darker pixels
 * (`oak_log_top`'s bark ring measured at Lab L≈27, vs plain oak's L≈53) had somewhere dark to go.
 *
 * **Frame/legs redesigned again — clean solid base + explicit seam lines (round 5, current)**: per
 * further user feedback, round 4's result read as "thick, random blocks of dark color" rather than
 * clean seams — an honest consequence of how it worked: real per-voxel matching against the real
 * (subtly noisy) `oak_log`/`oak_planks` pixel data, now with `dark_oak_*` available, picks a dark
 * candidate wherever the real texture happens to dip dark, which is scattered/uneven, not evenly
 * spaced. Chasing "1-pixel, straight, evenly-spaced" lines through pure UV interpolation isn't
 * possible either: `stretchedBox` maps one small rect linearly across an element's whole extent —
 * fine for a single gradient (see the mattress seam above), but there is no wrap/repeat in this
 * engine's UV sampling (`samplePixel` clamps out-of-range coordinates, it doesn't tile), so a
 * *repeating* stripe pattern can't come from one rect at any thickness. The fix that actually
 * delivers "clean, evenly-spaced 1-unit lines on a solid base" is the same technique already used
 * for bee's rear stripes and panda's saddle band: real texture sampling for the base color, but
 * deliberate, evenly-positioned thin `stretchedBox` elements — not the natural per-voxel wrap — for
 * the seams themselves, each restricted to a dark palette so its color is exact and controlled
 * rather than incidental.
 * - Rail and legs now share one flat, confirmed-solid light-oak patch (`BED_LIGHT_OAK_RECT`, a
 *   verified uniform 5-pixel run in the real `oak_planks.png`, rect (3,0)-(8,1)) on every face —
 *   including the legs, which previously used `oak_log`'s bark/end-grain split; per the user's
 *   "corner legs match the base oak color cleanly, without extra dark blotches" ask, legs are now
 *   uniformly the same light-oak tone as the rail, no separate end-grain treatment.
 * - 7 new thin seam elements (indices 7-13) sit on top of the rail, each spanning the rail's own
 *   full width (X 0-16) and exact Y-slice (Y `FRAME_HEIGHT-1` to `FRAME_HEIGHT`), 1 unit thick,
 *   evenly spaced every 4 units along Z (4, 8, 12, ..., 28) — the "evenly across the bottom"
 *   plank-boundary look. Listed after the rail base, so `rasterizeItemModel`'s "most-recently-added
 *   owner wins" rule paints them over it at those Z bands without carving a hole in the base
 *   element. None of the 7 positions overlaps a leg's own Z footprint (legs sit at Z 0-2/30-32;
 *   seams start at Z 4), so the legs stay untouched.
 *
 * **Seams confined to the underside + softened (round 6)**: round 5's seam elements used
 * `stretchedBox` (one rect/one color for all 6 faces), and since each seam spans the rail's *full*
 * width, its own east/west faces sit exactly at the model's outer X=0/X=16 boundary — the true
 * outer side frame — where they WERE exposed (real user feedback: seams "spilling over onto the
 * outer side faces"), each showing the same dark color as the underside. A per-element
 * `elementPaletteRestrictions` entry can't fix this alone (it narrows candidates for the whole
 * element, not per-face); the actual fix is `stretchedBoxWithBottom` (mirroring
 * `stretchedBoxWithTop`), giving each seam's 5 non-bottom faces the *same* `BED_LIGHT_OAK_RECT` the
 * base rail uses — so they resolve to the exact same light-oak color and read as perfectly
 * continuous with the surrounding frame — while only `bottom` samples a different rect
 * (`BED_SEAM_ACCENT_RECT`, the real darkest confirmed pixel in `oak_planks.png`, (103,80,44) at
 * (6,3)). `BED_SEAM_PALETTE` (replacing round 5's dark-only restriction) is the union of the light-
 * oak trio and a new, deliberately *softer* medium-brown pair — the per-face UV difference (light
 * rect vs. accent rect) is what actually separates which candidate each face lands on, not the
 * restriction alone. The accent color itself was also softened per feedback that dark_oak (Lab
 * L≈20, a ~37-point drop from oak's L≈57) read as "too dark/black": `spruce_planks`/
 * `stripped_spruce_log` (L≈36-38, and — checked directly — nearly the same real hue as oak,
 * a≈6-8/b≈24-26 vs oak's a≈5/b≈33) give roughly half that lightness drop with a compatible hue,
 * reading as a soft shadow rather than a harsh contrasting line.
 *
 * One more real edge case, caught via real-jar ASCII verification of the actual output (not
 * assumed away): `stretchedBoxWithBottom` alone still left a thin accent-colored sliver on the
 * true outer edge, specifically at the rail's bottom-most voxel row — because at that exact
 * boundary column both the seam's `bottom` face AND its `east`/`west` face are simultaneously
 * exposed, and `rasterizeItemModel`'s `FACE_PRIORITY` tries `bottom` before `east`/`west`, so the
 * (correctly light-colored) side face never gets a chance to win there. Fixed by insetting each
 * seam's X-range by 1 unit on each side (1 to 15, not the full 0 to 16) — no seam element reaches
 * the true X=0/X=16 boundary at all anymore, so that column is only ever touched by the base rail,
 * at every row, and the priority ambiguity can't arise.
 *
 * modelDepthUnits=32 (see rasterizeItemModel) is still required to render the true 2-block length
 * instead of being squashed into one.
 */
// Confirmed-solid light-oak patch: a verified uniform 5-pixel run in the real `oak_planks.png`
// (row 0, columns 3-7, all decode to the exact same RGB) — used via stretchedBox instead of the
// full real texture so the rail/leg base reads as one clean flat tone, not the subtly-noisy
// natural wrap that produced round 4's uneven dark blotches.
const BED_LIGHT_OAK_RECT: [number, number, number, number] = [3, 0, 8, 1];

// Real darkest confirmed pixel in `oak_planks.png` — (103,80,44) at (6,3) — used only for the seam
// elements' `bottom` face, paired with `BED_LIGHT_OAK_RECT` on their other 5 faces via
// `stretchedBoxWithBottom` so the darker accent never reaches the outer side frame. See bedModel's
// doc (round 6) for why this is meaningfully softer than round 5's dark_oak-restricted approach.
const BED_SEAM_ACCENT_RECT: [number, number, number, number] = [6, 3, 7, 4];

function bedModel(textureKey: string): BlockModel {
  const blanketRect: [number, number, number, number] = [22, 24, 38, 27];
  const pillowRect: [number, number, number, number] = [6, 2, 22, 6];
  const blanketTopRect: [number, number, number, number] = [22, 27, 38, 24]; // v reversed: dark seam (v24) lands near the rear/pillow end
  const pillowTopRect: [number, number, number, number] = [6, 2, 22, 13]; // symmetric gray(v2)-white-gray(v13) border, real pixels
  const FRAME_HEIGHT = 5; // legs + rail occupy Y 0-5; mattress fills the remaining Y 5-9 up to the fixed top
  const leg = (x0: number, z0: number) => stretchedBox([x0, 0, z0], [x0 + 2, FRAME_HEIGHT, z0 + 2], BED_LIGHT_OAK_RECT, 'oakPlanks');
  // Seam lines: 5 non-bottom faces share the base rail's own light-oak rect (so the outer side
  // frame reads as perfectly continuous, not a spillover), only `bottom` samples the darker accent.
  // X is inset 1 unit from each true edge (1 to 15, not the full 0-16): at X=0/X=16 exactly, a
  // seam's own east/west face would coincide with the model's real outer boundary and become
  // exposed there too — and since rasterizeItemModel's FACE_PRIORITY tries 'bottom' before
  // 'east'/'west', that boundary voxel's color would still resolve from the seam's (correctly
  // light-colored) side face MOST of the time, but the bottom-most row of that same boundary
  // column has both faces exposed simultaneously and 'bottom' wins priority there — letting the
  // accent color bleed onto the outer edge after all. Insetting means no seam element ever reaches
  // the true boundary, so that column is only ever touched by the base rail, at every row.
  const seamZs = [4, 8, 12, 16, 20, 24, 28];
  const seam = (z: number) =>
    stretchedBoxWithBottom([1, FRAME_HEIGHT - 1, z - 0.5], [15, FRAME_HEIGHT, z + 0.5], BED_LIGHT_OAK_RECT, BED_SEAM_ACCENT_RECT, 'oakPlanks');
  return {
    textures: { main: textureKey, oakPlanks: 'oak_planks' },
    // Mattress and pillow (both real dye-colored `main` texture) are listed FIRST, ahead of the
    // now-oak-textured rail/legs — order here never affects rendering (rail/legs at Y 0-5 and
    // mattress/pillow at Y 5-9 never spatially overlap, so array order between the two groups is
    // visually irrelevant), but it matters for a completely different consumer:
    // resolveFallbackTexture.ts's `firstTextureKey` walks `elements` in order and returns the
    // FIRST resolvable texture as a representative color for structure mode's multi-cell fallback
    // tier. With the rail (now `oak_planks`, identical for every bed color) first, every dye color
    // fell back to the same oak-brown instead of its own dye color — caught by
    // buildStructureVoxelGrid.test.ts, not visually. Keeping a `main`-textured element first
    // preserves the real per-color fallback.
    elements: [
      stretchedBoxWithTop([0, FRAME_HEIGHT, 0], [16, 9, 32], blanketRect, blanketTopRect, 'main'), // mattress/blanket, full 16x32 footprint, both foot and head sections
      stretchedBoxWithTop([0, 6, 26], [16, 9, 32], pillowRect, pillowTopRect, 'main'), // pillow, full width, top-rear of the head section only — unchanged, still fits within the shorter mattress
      stretchedBox([0, FRAME_HEIGHT - 1, 0], [16, FRAME_HEIGHT, 32], BED_LIGHT_OAK_RECT, 'oakPlanks'), // frame rail base, full footprint, clean solid light-oak
      leg(0, 0),
      leg(14, 0),
      leg(0, 30),
      leg(14, 30),
      ...seamZs.map(seam), // 7 evenly-spaced dark seam lines, overlaid on the rail's bottom face only
    ],
  };
}

/**
 * Restricts the pillow element (index 1 in `bedModel`'s `elements`) away from stone. Per user
 * feedback, the widened `pillowTopRect`'s gray border tone was matching `diorite`/
 * `polished_diorite` — a real, Lab-closest match (confirmed by computing the actual distance
 * against every curated palette entry), but a stone block reads wrong for a soft fabric pillow.
 * A follow-up round of feedback clarified the fix should drop only diorite specifically, not
 * narrow the pillow down to a flat two-tone look — so this keeps both wool *and* concrete in the
 * white/light-gray range (the same 4-entry combo `BEE_WING_PALETTE` already uses for the same
 * "pale surface, no stone" reasoning), preserving the original multi-shade gradient/pattern
 * instead of flattening it.
 */
const BED_PILLOW_PALETTE = ['minecraft:white_wool', 'minecraft:white_concrete', 'minecraft:light_gray_wool', 'minecraft:light_gray_concrete'];

/**
 * Restricts the rail base (index 2) and 4 legs (indices 3-6) to light oak only. Earlier rounds
 * tried real `oak_log`/`oak_planks` per-voxel matching, first unrestricted (which let other wood
 * species — spruce, mangrove, dark_oak — win some voxels via real-jar-confirmed raw-Lab-closest
 * matches) then widened to include dark_oak explicitly (which produced real but visually "random
 * blotchy" dark patches, per direct user feedback). Round 5 replaced the per-voxel natural wrap
 * with one flat confirmed-solid patch (`BED_LIGHT_OAK_RECT`) for the whole base, so per-voxel color
 * variance from the source texture is no longer a factor at all — this restriction is now mostly a
 * cross-resource-pack safety net (a flat patch already matches near-deterministically), not the
 * primary fix.
 */
const BED_LIGHT_OAK_PALETTE = ['minecraft:oak_planks', 'minecraft:oak_log', 'minecraft:stripped_oak_log'];

/**
 * Restricts the 7 seam-line elements (indices 7-13) — the union of the light-oak trio above and a
 * softer medium-brown pair. Round 5 used a dark-only restriction (`dark_oak_planks`/`dark_oak_log`/
 * `stripped_dark_oak_log`, Lab L≈20-21) applied to every face of a plain `stretchedBox`, which two
 * further rounds of feedback found wrong in two ways: (1) since each seam spans the rail's full
 * width, its own east/west faces sit at the model's outer X boundary and were exposed there too,
 * "spilling" the dark seam color onto the visible outer side frame; (2) the color itself read as
 * "too dark/black" rather than a soft plank shadow. Round 6 fixes both: `stretchedBoxWithBottom`
 * (see its own doc) gives only the `bottom` face a different, genuinely darker rect than the other
 * 5 — which is what actually determines which half of this combined list each face lands on, not
 * the restriction alone (a restriction narrows candidates, it doesn't target specific faces) — and
 * the dark half of the list is now `spruce_planks`/`stripped_spruce_log` (Lab L≈36-38, real hue
 * a≈6-8/b≈24-26, confirmed close to oak's own a≈5/b≈33) instead of `dark_oak_*`, roughly halving
 * the lightness drop from the base oak tone for a softer, more natural-blending shadow.
 */
const BED_SEAM_PALETTE = [...BED_LIGHT_OAK_PALETTE, 'minecraft:spruce_planks', 'minecraft:stripped_spruce_log'];

/**
 * Beacon's real model (assets/minecraft/models/block/beacon.json, confirmed against the real
 * 1.21.8 jar) is a *solid* full 16x16x16 glass cube with an obsidian frame and the glowing beacon
 * crystal nested inside it — real Minecraft only shows the crystal because glass renders
 * translucent. This app's voxelizer places real opaque blocks, and rasterizeItemModel's occlusion
 * is purely spatial (a voxel is culled as buried interior if every neighbor has *any* owning
 * element, regardless of what that element looks like): with the real solid-cube glass element,
 * the crystal — which never touches the model's own outer boundary — was always entirely buried
 * and discarded, and the obsidian frame lost everything but a thin bottom cap. Per user request
 * (with a reference screenshot of the real block), hand-authored here instead as a genuinely
 * hollow 1-unit-thick glass shell (6 thin panels, not a filled box) so the interior is real empty
 * space — the obsidian frame and crystal, kept at their real measured proportions, are now
 * actually exposed and voxelized, matching how the block visually reads in-game: a see-through
 * shell with the glowing crystal floating inside on an obsidian base.
 */
function beaconModel(): BlockModel {
  const full: [number, number, number, number] = [0, 0, 16, 16];
  const shellPanel = (from: [number, number, number], to: [number, number, number]) =>
    stretchedBox(from, to, full, 'glass');
  return {
    textures: { glass: 'glass', obsidian: 'obsidian', beacon: 'beacon' },
    elements: [
      shellPanel([0, 0, 0], [16, 1, 16]), // bottom
      shellPanel([0, 15, 0], [16, 16, 16]), // top
      shellPanel([0, 0, 0], [16, 16, 1]), // north
      shellPanel([0, 0, 15], [16, 16, 16]), // south
      shellPanel([0, 0, 0], [1, 16, 16]), // west
      shellPanel([15, 0, 0], [16, 16, 16]), // east
      stretchedBox([2, 0.1, 2], [14, 3, 14], full, 'obsidian'), // frame, real proportions
      stretchedBox([3, 3, 3], [13, 14, 13], full, 'beacon'), // crystal, real proportions, now exposed
    ],
  };
}

/**
 * Beacon's crystal (element index 7 above) is restricted to exactly this curated list rather than
 * any `lightSource`-flagged block — an earlier version used every `lightSource` entry indiscrimi-
 * nately, and the froglights' scattered, mismatched hues (orange ochre, green verdant) read as
 * visibly wrong against the real crystal's actual look (pale, swirling white-to-light-blue, per
 * the reference image and real in-game renders). `sea_lantern` is the one light-emitting entry
 * kept — its pale cyan-white color genuinely fits the white-to-light-blue range and keeps a touch
 * of "shiny," unlike the froglights.
 */
const BEACON_CRYSTAL_PALETTE = [
  'minecraft:sea_lantern',
  'minecraft:white_wool',
  'minecraft:white_concrete',
  'minecraft:light_blue_wool',
  'minecraft:light_blue_concrete',
];

function signModel(textureKey: string): BlockModel {
  return {
    textures: { main: textureKey },
    elements: [
      boxElement([7, 0, 7], [9, 14, 9], [0, 14], 'main'), // post
      boxElement([0, 6, 7], [16, 16, 9], [0, 0], 'main'), // board
    ],
  };
}

const DYE_COLORS = [
  'white',
  'orange',
  'magenta',
  'light_blue',
  'yellow',
  'lime',
  'pink',
  'gray',
  'light_gray',
  'cyan',
  'purple',
  'blue',
  'brown',
  'green',
  'red',
  'black',
];

const SIGN_WOODS = [
  'oak',
  'spruce',
  'birch',
  'jungle',
  'acacia',
  'dark_oak',
  'mangrove',
  'cherry',
  'bamboo',
  'pale_oak',
  'crimson',
  'warped',
];

export interface HandAuthoredTemplate {
  model: BlockModel;
  /** Same meaning as ResolvedItem's heightUnits/depthUnits (resolveItemModel.ts) — 16 for a
   *  normal single-block item, 32 for a genuinely 2-block-long/tall one. Every hand-authored
   *  template here is a normal single-block height; only bed doubles its depth. */
  heightUnits: number;
  depthUnits: number;
  /** Maps `model.elements` indices to an explicit allow-list of palette block ids that element
   *  should match against instead of the shared palette — buildItemVoxelGrid.ts turns each entry
   *  into a restricted per-element palette passed to rasterizeItemModel's `elementPaletteOverrides`
   *  (falling back to the unrestricted palette if none of the listed ids exist in it, e.g. a
   *  custom resource pack). Per user feedback, beacon's crystal element (see beaconModel /
   *  BEACON_CRYSTAL_PALETTE below) uses this — first restricted to *any* light-emitting block, but
   *  that pulled in mismatched froglight hues, so it's now an explicit curated set instead of a
   *  broad flag-based one. */
  elementPaletteRestrictions?: Record<number, string[]>;
}

function template(model: BlockModel, depthUnits = 16, elementPaletteRestrictions?: Record<number, string[]>): HandAuthoredTemplate {
  return { model, heightUnits: 16, depthUnits, elementPaletteRestrictions };
}

export const HAND_AUTHORED_TEMPLATES: Record<string, HandAuthoredTemplate> = {
  // Element 7 is the crystal (see beaconModel: 6 shell panels [0-5] + obsidian frame [6] + crystal [7]).
  beacon: template(beaconModel(), 16, { 7: BEACON_CRYSTAL_PALETTE }),
  chest: template(chestModel('chest/normal')),
  trapped_chest: template(chestModel('chest/trapped')),
  ender_chest: template(chestModel('chest/ender')),
  shulker_box: template(shulkerModel('shulker/shulker')),
  ...Object.fromEntries(
    DYE_COLORS.map((color) => [`${color}_shulker_box`, template(shulkerModel(`shulker/shulker_${color}`))])
  ),
  ...Object.fromEntries(
    DYE_COLORS.map((color) => [
      `${color}_bed`,
      template(bedModel(`bed/${color}`), 32, {
        1: BED_PILLOW_PALETTE,
        2: BED_LIGHT_OAK_PALETTE,
        3: BED_LIGHT_OAK_PALETTE,
        4: BED_LIGHT_OAK_PALETTE,
        5: BED_LIGHT_OAK_PALETTE,
        6: BED_LIGHT_OAK_PALETTE,
        7: BED_SEAM_PALETTE,
        8: BED_SEAM_PALETTE,
        9: BED_SEAM_PALETTE,
        10: BED_SEAM_PALETTE,
        11: BED_SEAM_PALETTE,
        12: BED_SEAM_PALETTE,
        13: BED_SEAM_PALETTE,
      }),
    ])
  ),
  ...Object.fromEntries(
    SIGN_WOODS.flatMap((wood) => [
      [`${wood}_sign`, template(signModel(`signs/${wood}`))],
      [`${wood}_wall_sign`, template(signModel(`signs/${wood}`))],
    ])
  ),
};
