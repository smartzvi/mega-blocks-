import type { BoatWood } from '../../types/minecraft';
import type { HandAuthoredTemplate } from './handAuthoredTemplates';
import { plate, type UvRect } from './plateElement';

export type { BoatWood };

/** Every wood with a real `entity/boat/<wood>.png` and a plank family in the palette's reach. The
 *  bamboo raft is a different, flatter shape (not built from these plates), so it is left out. */
export const BOAT_WOODS: BoatWood[] = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak'];
export const DEFAULT_BOAT_WOOD: BoatWood = 'oak';

/**
 * The boat, hand-authored like every other mob (the jar ships its textures but no geometry). The
 * plate sizes are the real Java `BoatModel`, confirmed against the real `entity/boat/oak.png` atlas
 * (128x64) by decoding its alpha: each plate's atlas region has exactly the width and height its box
 * size predicts (bottom 28x16x3 at (0,0) → a 62x19 region; the 18-, 16-, 28- and 28-wide walls at
 * (0,19), (0,27), (0,35), (0,43)). Every plate is thin, so the hull is hollow by construction: a 3-thick
 * bottom, 6-tall walls 2 thick, and an open top — an interior 12 wide, 28 long and 6 deep at the
 * floor, with room to stand in (walk mode is 1 voxel per block, so at 16 voxels per block that is a
 * boat more than 12 blocks wide inside).
 *
 * Block-space layout (16-unit blocks; X is the width, Z the length, Y up from the keel):
 * - the hull is centred at X=22 of a 44-wide model (`widthUnits`), so the oars have room; length is
 *   32 (`depthUnits`), the bow (front) at high Z;
 * - bottom X 14–30, Z 2–30, Y 0–3; the two side walls X 14–16 and 28–30, Z 2–30, Y 3–9; the front
 *   wall Z 30–32 (16 wide) and the stern Z 0–2 (18 wide — the real stern plank is 1 unit wider each
 *   side than the hull), both Y 3–9;
 * - each oar is a 2x2 shaft lying across the rim at Y 9–11 from just inside the wall out to X=0/44,
 *   with a 6-tall blade on its outer end. The real oars are tilted a few degrees and this engine
 *   only builds axis-aligned boxes, so they are level — recognizable, not pixel-perfect.
 *
 * UV rects (each verified fully opaque in the real atlas): the bottom's big faces are (3,3)-(31,19)
 * top and (34,3)-(62,19) underside, turned 90° because the atlas has the plate's 28-long side
 * horizontal and here it runs along Z; a wall's big faces are its two inner-atlas rects and its rim
 * the strip above them. The oars reuse the bottom's rect (same wood).
 */

const WIDTH = 44;
const LENGTH = 32;
const CENTER = WIDTH / 2;

const BOTTOM_TOP: UvRect = [3, 3, 31, 19];
const BOTTOM_UNDER: UvRect = [34, 3, 62, 19];

// Side walls: (u, v) origin (0,35) for one, (0,43) for the other, 28x6x2 each.
const WALL_A = { outside: [2, 37, 30, 43], inside: [32, 37, 60, 43], rim: [2, 35, 30, 37] } satisfies Record<string, UvRect>;
const WALL_B = { outside: [2, 45, 30, 51], inside: [32, 45, 60, 51], rim: [2, 43, 30, 45] } satisfies Record<string, UvRect>;
// Front (16x6x2) at (0,27) and stern (18x6x2) at (0,19).
const FRONT = { outside: [2, 29, 18, 35], inside: [20, 29, 36, 35], rim: [2, 27, 18, 29] } satisfies Record<string, UvRect>;
const STERN = { outside: [2, 21, 20, 27], inside: [22, 21, 40, 27], rim: [2, 19, 20, 21] } satisfies Record<string, UvRect>;

/** The palette blocks a boat of this wood may use: that species' planks, logs and stripped logs —
 *  whichever of them exist in the palette. Without the restriction the plank texture's darker outline
 *  pixels scatter across other species and stones; and if none exist (pale oak has no block in the
 *  curated palette) the lookup falls back to the whole palette, which suits its washed-out grey. */
function woodPalette(wood: BoatWood): string[] {
  return [`minecraft:${wood}_planks`, `minecraft:${wood}_log`, `minecraft:stripped_${wood}_log`];
}

export function boatTemplateFor(wood: BoatWood = DEFAULT_BOAT_WOOD): HandAuthoredTemplate {
  const hullX0 = CENTER - 8;
  const hullX1 = CENTER + 8;
  const sideZ0 = 2;
  const sideZ1 = LENGTH - 2;

  const elements = [
    // 0: bottom
    plate([hullX0, 0, sideZ0], [hullX1, 3, sideZ1], 'boat', BOTTOM_TOP, {
      top: { uv: BOTTOM_TOP, rotation: 90 },
      bottom: { uv: BOTTOM_UNDER, rotation: 90 },
    }),
    // 1: port (high-X) wall — outer face looks +X
    plate([hullX1 - 2, 3, sideZ0], [hullX1, 9, sideZ1], 'boat', WALL_B.rim, {
      east: { uv: WALL_B.outside },
      west: { uv: WALL_B.inside },
    }),
    // 2: starboard (low-X) wall — outer face looks -X
    plate([hullX0, 3, sideZ0], [hullX0 + 2, 9, sideZ1], 'boat', WALL_A.rim, {
      west: { uv: WALL_A.outside },
      east: { uv: WALL_A.inside },
    }),
    // 3: front (bow) wall
    plate([hullX0, 3, sideZ1], [hullX1, 9, LENGTH], 'boat', FRONT.rim, {
      south: { uv: FRONT.outside },
      north: { uv: FRONT.inside },
    }),
    // 4: stern wall, 1 unit wider than the hull on each side
    plate([hullX0 - 1, 3, 0], [hullX1 + 1, 9, sideZ0], 'boat', STERN.rim, {
      north: { uv: STERN.outside },
      south: { uv: STERN.inside },
    }),
    // 5-8: oars — shaft then blade, port then starboard
    plate([hullX1 - 4, 9, 18], [WIDTH, 11, 20], 'boat', BOTTOM_TOP),
    plate([WIDTH - 6, 7, 19], [WIDTH, 13, 20], 'boat', BOTTOM_TOP),
    plate([0, 9, 18], [hullX0 + 4, 11, 20], 'boat', BOTTOM_TOP),
    plate([0, 7, 19], [6, 13, 20], 'boat', BOTTOM_TOP),
  ];

  const restriction = woodPalette(wood);
  return {
    model: { textures: { boat: `boat/${wood}` }, elements },
    heightUnits: Math.ceil(Math.max(...elements.map((e) => e.to[1]))),
    depthUnits: LENGTH,
    widthUnits: WIDTH,
    elementPaletteRestrictions: Object.fromEntries(elements.map((_, i) => [i, restriction])),
  };
}
