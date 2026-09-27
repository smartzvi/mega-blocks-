import type { BlockModelElement } from '../../types/item';
import type { RailShape } from '../../types/minecraft';
import type { HandAuthoredTemplate } from './handAuthoredTemplates';
import { plate, type UvRect } from './plateElement';
import { railTemplateFor } from './railTemplates';

/**
 * The minecart, hand-authored like every other mob (the jar ships its texture but no geometry).
 * The shape is the real Java `MinecartModel`, confirmed against both Mojang's Bedrock geometry and
 * the real `entity/minecart.png` atlas (64x32) by decoding its alpha: a 20x16x2 floor plate and four
 * 16x8x2 wall plates standing on it — thin plates, so the cart is hollow by construction (10 units
 * tall in all, 20 long, 16 wide).
 *
 * Long axis: 20 units doesn't fit a 16-unit block, so the cart's length is the model's depth
 * (`depthUnits` 20) when it runs along Z, or its width (`widthUnits` 20) along X — the same extent
 * parameters the bed and boat use, so nothing here touches the shared rasterizer's behaviour.
 *
 * UV rects (all confirmed fully opaque in the real texture, not assumed): the floor's big faces are
 * (2,12)-(22,28) top and (24,12)-(44,28) underside; each wall's big faces are (2,2)-(18,10) outside
 * and (20,2)-(36,10) inside; the rim of a wall is (2,0)-(18,2). The atlas's *underside* rim region
 * (18,0)-(34,2) is transparent, so a wall's bottom face deliberately reuses the top rim instead.
 */

const CART_LENGTH = 20;
const CART_WIDTH = 16;
const FLOOR_THICKNESS = 2;
const WALL_HEIGHT = 8;
const WALL_THICKNESS = 2;
/** Real cart height: floor plus walls standing on it. */
const CART_HEIGHT = FLOOR_THICKNESS + WALL_HEIGHT;

const FLOOR_TOP: UvRect = [2, 12, 22, 28];
const FLOOR_BOTTOM: UvRect = [24, 12, 44, 28];
const WALL_OUTSIDE: UvRect = [2, 2, 18, 10];
const WALL_INSIDE: UvRect = [20, 2, 36, 10];
const WALL_RIM: UvRect = [2, 0, 18, 2];

type Axis = 'x' | 'z';

/** One unit-wide strip of `rect` along its width — the slice at position `i` of a plate that runs the
 *  rect's full width. Every plate is cut into unit slices along the cart's length (see cartElements),
 *  and a slice that sampled the whole rect would repeat the entire pattern in each one. */
function strip(rect: UvRect, i: number): UvRect {
  return [rect[0] + i, rect[1], rect[0] + i + 1, rect[3]];
}

/** Lays a box out with its long axis on `along` (0..CART_LENGTH) and its short axis on the other
 *  horizontal axis (0..CART_WIDTH), lifted to `[y0, y1]`. */
function box(axis: Axis, a0: number, a1: number, c0: number, c1: number, y0: number, y1: number): { from: [number, number, number]; to: [number, number, number] } {
  return axis === 'z' ? { from: [c0, y0, a0], to: [c1, y1, a1] } : { from: [a0, y0, c0], to: [a1, y1, c1] };
}

/**
 * The cart's plates. `baseAt(a)` is the height of the floor's underside at each unit of length
 * (`a` = 0..CART_LENGTH-1): a constant on flat ground, a rising or falling line on a slope. Every
 * plate is cut into one-unit slices along the length so each slice can sit at its own height — the
 * same stepped approximation the ascending rail itself uses (railTemplates.ts), which is what keeps
 * the cart flush on the track instead of floating or sinking into it.
 */
function cartElements(axis: Axis, baseAt: (a: number) => number): BlockModelElement[] {
  // Which faces are which depends on the axis: a plate across the length faces along it.
  const along = axis === 'z' ? { far: 'south', near: 'north' } : { far: 'east', near: 'west' };
  const across = axis === 'z' ? { high: 'east', low: 'west' } : { high: 'south', low: 'north' };
  const floorRotation = axis === 'z' ? 90 : 0; // the texture's long side has to run down the cart
  const els: BlockModelElement[] = [];

  for (let a = 0; a < CART_LENGTH; a++) {
    const b = baseAt(a);
    const isEnd = a < WALL_THICKNESS || a >= CART_LENGTH - WALL_THICKNESS;

    // floor slice
    els.push(
      plate(...spread(box(axis, a, a + 1, 0, CART_WIDTH, b, b + FLOOR_THICKNESS)), 'cart', FLOOR_TOP, {
        top: { uv: strip(FLOOR_TOP, a), rotation: floorRotation },
        bottom: { uv: strip(FLOOR_BOTTOM, a), rotation: floorRotation },
      })
    );

    const y0 = b + FLOOR_THICKNESS;
    const y1 = b + CART_HEIGHT;
    if (isEnd) {
      // An end wall: spans the full width, its big faces point along the cart.
      const outer = a < WALL_THICKNESS ? along.near : along.far;
      const inner = a < WALL_THICKNESS ? along.far : along.near;
      els.push(
        plate(...spread(box(axis, a, a + 1, 0, CART_WIDTH, y0, y1)), 'cart', WALL_RIM, {
          [outer]: { uv: WALL_OUTSIDE },
          [inner]: { uv: WALL_INSIDE },
        })
      );
    } else {
      // The two long walls, between the end walls; their big faces point across the cart. They run
      // the 16 units between the end walls, which is exactly the width of their atlas rects.
      const w = a - WALL_THICKNESS;
      els.push(
        plate(...spread(box(axis, a, a + 1, 0, WALL_THICKNESS, y0, y1)), 'cart', WALL_RIM, {
          [across.low]: { uv: strip(WALL_OUTSIDE, w) },
          [across.high]: { uv: strip(WALL_INSIDE, w) },
        }),
        plate(...spread(box(axis, a, a + 1, CART_WIDTH - WALL_THICKNESS, CART_WIDTH, y0, y1)), 'cart', WALL_RIM, {
          [across.high]: { uv: strip(WALL_OUTSIDE, w) },
          [across.low]: { uv: strip(WALL_INSIDE, w) },
        })
      );
    }
  }
  return els;
}

function spread(b: { from: [number, number, number]; to: [number, number, number] }): [[number, number, number], [number, number, number]] {
  return [b.from, b.to];
}

/** The minecart on its own, standing on the ground, long axis along Z. */
export function minecartTemplate(): HandAuthoredTemplate {
  return {
    model: { textures: { cart: 'minecart' }, elements: cartElements('z', () => 0) },
    heightUnits: CART_HEIGHT,
    depthUnits: CART_LENGTH,
  };
}

// The cart is a little longer than the 16-unit rail under it, so it overhangs one unit-run at each
// end; its own rail-relative column index runs from -RAIL_INSET to CART_LENGTH - RAIL_INSET - 1.
const RAIL_INSET = (CART_LENGTH - 16) / 2;

function isAscending(shape: RailShape): boolean {
  return shape.startsWith('ascending_');
}

/**
 * A minecart sitting on a piece of track, for any of the rail shapes: the flat and curved shapes put
 * the cart along Z on the flat rail; `ascending_*` steps the cart up the same ramp the rail itself
 * climbs (see railTemplates.ts's `rampElements` — one unit of rise per unit of length, high end at
 * the shape's own end), so the floor's underside always meets the rail's top surface. East/west
 * ascents run the cart along X instead, using `widthUnits`.
 *
 * The cart is 20 long against a 16-long ramp, so two columns of it overhang each end. The overhang at
 * the low end stays level with the lowest rail column, and the one at the high end keeps climbing
 * the slope.
 *
 * "Sitting on" the rail means the floor's underside meets the top of the voxel row the rail
 * occupies, not the rail element's own y: a rail is a zero-thickness plane at y=1 that the
 * rasterizer widens to the one voxel row [1, 2) (and each ramp step likewise occupies one row —
 * see railSurface), so the surface a cart rests on is one higher than the plane's y.
 */
export function minecartOnRailTemplate(shape: RailShape): HandAuthoredTemplate {
  const railTemplate = railTemplateFor('rail', { shape }, 'rail_corner');
  const axis: Axis = shape === 'ascending_east' || shape === 'ascending_west' ? 'x' : 'z';
  const highAtMax = shape === 'ascending_south' || shape === 'ascending_east';

  // The top of the voxel row the rail occupies at each unit of *rail* length j. The ramp's first two
  // steps share row 1 (its first step has no rise), then it climbs one row per unit — hence the
  // `max`. Flat rails, and both overhangs' level side, sit on row 1's top.
  const railSurface = (j: number) => {
    if (!isAscending(shape)) return 2;
    return Math.max(2, highAtMax ? j + 1 : 16 - j);
  };

  const railElements: BlockModelElement[] = railTemplate.model.elements.map((el) => shiftElement(el, axis, RAIL_INSET));
  const cart = cartElements(axis, (a) => railSurface(a - RAIL_INSET));

  const all = [...railElements, ...cart];
  const topY = Math.max(...all.map((el) => el.to[1]));
  return {
    model: { textures: { ...railTemplate.model.textures, cart: 'minecart' }, elements: all },
    heightUnits: Math.ceil(topY),
    depthUnits: axis === 'z' ? CART_LENGTH : 16,
    widthUnits: axis === 'x' ? CART_LENGTH : 16,
  };
}

function shiftElement(el: BlockModelElement, axis: Axis, along: number): BlockModelElement {
  const i = axis === 'z' ? 2 : 0;
  const from: [number, number, number] = [...el.from];
  const to: [number, number, number] = [...el.to];
  from[i] += along;
  to[i] += along;
  return { from, to, faces: el.faces };
}
