/**
 * First-person walking physics against a voxel grid — pure functions, no Three.js or React, so the
 * collision rules can be tested directly (see playerPhysics.test.ts).
 *
 * Space: "physics space" has voxel (x, y, z) occupying [x, x+1) × [y, y+1) × [z, z+1), y up. The
 * preview draws that voxel centred at `x - sizeX/2 + 0.5`, so `render = physics - size/2` on each
 * axis (see `physicsToRender`).
 *
 * Scale: the player is always a real Minecraft player, 1.8 blocks tall, in *world* blocks — and an
 * exported build places every voxel as one real block, so a voxel is exactly one block here
 * regardless of the resolution the build was made at (`playerDims(1)`). A 64³ megablock is simply a
 * much bigger place to stand in, not a reason to make the player bigger. `playerDims` still takes a
 * `unit` (voxels per block) so the same maths can be tested at other scales.
 *
 * Collision is an exact per-axis *sweep* rather than "move, then test, then back off": for a move of
 * `d` along one axis it walks the layers of cells the box is about to enter, in order, and stops at
 * the first layer with a solid cell in the box's cross-section. Two things follow from that. No
 * speed can tunnel through a one-voxel wall (there's no per-frame step size to outrun), and the
 * cost is proportional to the cells actually crossed, not to the box's volume — which matters,
 * because at 64 voxels per block the player is ~38×38×115 cells.
 */

export type Vec3 = [number, number, number];

/** Whether the voxel at integer cell (x, y, z) is solid. Anything outside the grid must be air. */
export type SolidFn = (x: number, y: number, z: number) => boolean;

export interface PlayerDims {
  halfWidth: number;
  height: number;
  eyeHeight: number;
  /** The tallest ledge walked up without jumping (a slab, a 1-voxel stair, a redstone wire). */
  stepHeight: number;
  walkSpeed: number;
  /** Creative-flight speeds: horizontal, and up/down. */
  flySpeed: number;
  flyVerticalSpeed: number;
  gravity: number;
  jumpSpeed: number;
  terminalSpeed: number;
}

export interface PlayerState {
  /** Feet centre. */
  pos: Vec3;
  vy: number;
  onGround: boolean;
  /** Creative flight / NoClip: no gravity and no collision, so the player can hover and pass through
   *  blocks to look around inside a hollow build. Turned on and off with `setFlying`. */
  flying: boolean;
}

export interface PlayerInput {
  /** -1 back .. 1 forward. */
  forward: number;
  /** -1 left .. 1 right. */
  strafe: number;
  /** Radians, the same yaw a Three.js camera uses (0 looks toward -Z, positive turns left). */
  yaw: number;
  /** Jump while walking; ascend while flying. */
  jump: boolean;
  /** Descend while flying (ignored on the ground — there is no sneaking). */
  descend?: boolean;
}

// Real Minecraft numbers (blocks, seconds): 0.6 wide, 1.8 tall, eyes at 1.62, walk 4.317 b/s,
// gravity 32 b/s², a jump peaks at 1.25 blocks, and a ledge up to 0.6 is stepped without jumping.
const JUMP_HEIGHT_BLOCKS = 1.25;
const GRAVITY_BLOCKS = 32;

export function playerDims(unit: number): PlayerDims {
  return {
    halfWidth: 0.3 * unit,
    height: 1.8 * unit,
    eyeHeight: 1.62 * unit,
    stepHeight: 0.6 * unit,
    walkSpeed: 4.317 * unit,
    flySpeed: 10.89 * unit,
    flyVerticalSpeed: 7.5 * unit,
    gravity: GRAVITY_BLOCKS * unit,
    jumpSpeed: Math.sqrt(2 * GRAVITY_BLOCKS * JUMP_HEIGHT_BLOCKS) * unit,
    terminalSpeed: 78 * unit,
  };
}

// Overlap tests shrink the box by EPS so a box resting exactly on a cell boundary (which is where
// every snap lands it) never counts as overlapping the cell it is touching.
const EPS = 1e-6;
// A frame longer than this (a background tab coming back) is clamped, not simulated in one go.
const MAX_DT = 0.05;
// How far under the feet still counts as standing on something.
const GROUND_PROBE = 0.05;

/** Where the player is dropped: above the centre of the grid, higher than any block, so it can never
 *  start inside a solid and simply falls onto whatever is there. */
export function spawnAboveCenter(sizeX: number, sizeY: number, sizeZ: number): PlayerState {
  return { pos: [sizeX / 2, sizeY + 2, sizeZ / 2], vy: 0, onGround: false, flying: false };
}

/** Whether the player has fallen far enough below the grid to be put back at the spawn point. */
export function fellOutOfWorld(state: PlayerState, dims: PlayerDims): boolean {
  return !state.flying && state.pos[1] < -dims.height * 3;
}

export function physicsToRender(pos: Vec3, sizeX: number, sizeY: number, sizeZ: number): Vec3 {
  return [pos[0] - sizeX / 2, pos[1] - sizeY / 2, pos[2] - sizeZ / 2];
}

export function eyePosition(state: PlayerState, dims: PlayerDims): Vec3 {
  return [state.pos[0], state.pos[1] + dims.eyeHeight, state.pos[2]];
}

interface Extents {
  lo: Vec3; // how far the box reaches below `pos` on each axis
  hi: Vec3; // and above it
}

function extentsOf(dims: PlayerDims): Extents {
  return { lo: [dims.halfWidth, 0, dims.halfWidth], hi: [dims.halfWidth, dims.height, dims.halfWidth] };
}

/** Whether any cell in layer `layer` of `axis`, across the box's cross-section, is solid. */
function layerBlocked(pos: Vec3, ext: Extents, axis: number, layer: number, isSolid: SolidFn): boolean {
  const a1 = (axis + 1) % 3;
  const a2 = (axis + 2) % 3;
  const min1 = Math.floor(pos[a1] - ext.lo[a1] + EPS);
  const max1 = Math.ceil(pos[a1] + ext.hi[a1] - EPS) - 1;
  const min2 = Math.floor(pos[a2] - ext.lo[a2] + EPS);
  const max2 = Math.ceil(pos[a2] + ext.hi[a2] - EPS) - 1;
  const cell: Vec3 = [0, 0, 0];
  cell[axis] = layer;
  for (let i = min1; i <= max1; i++) {
    cell[a1] = i;
    for (let j = min2; j <= max2; j++) {
      cell[a2] = j;
      if (isSolid(cell[0], cell[1], cell[2])) return true;
    }
  }
  return false;
}

/** Moves the box up to `d` along `axis`, stopping flush against the first solid layer it meets. */
function sweep(pos: Vec3, ext: Extents, axis: number, d: number, isSolid: SolidFn): { moved: number; blocked: boolean } {
  if (d === 0) return { moved: 0, blocked: false };
  if (d > 0) {
    const edge = pos[axis] + ext.hi[axis];
    const first = Math.ceil(edge - EPS);
    const last = Math.ceil(edge + d - EPS) - 1;
    for (let layer = first; layer <= last; layer++) {
      if (layerBlocked(pos, ext, axis, layer, isSolid)) return { moved: Math.max(0, layer - edge), blocked: true };
    }
    return { moved: d, blocked: false };
  }
  const edge = pos[axis] - ext.lo[axis];
  const first = Math.floor(edge + EPS) - 1;
  const last = Math.floor(edge + d + EPS);
  for (let layer = first; layer >= last; layer--) {
    if (layerBlocked(pos, ext, axis, layer, isSolid)) return { moved: Math.min(0, layer + 1 - edge), blocked: true };
  }
  return { moved: d, blocked: false };
}

/** Whether the player's box overlaps any solid cell at `pos`. */
function overlapsSolid(pos: Vec3, ext: Extents, isSolid: SolidFn): boolean {
  const min = [0, 1, 2].map((a) => Math.floor(pos[a] - ext.lo[a] + EPS));
  const max = [0, 1, 2].map((a) => Math.ceil(pos[a] + ext.hi[a] - EPS) - 1);
  for (let x = min[0]; x <= max[0]; x++)
    for (let y = min[1]; y <= max[1]; y++)
      for (let z = min[2]; z <= max[2]; z++) if (isSolid(x, y, z)) return true;
  return false;
}

const EJECT_DIRECTIONS: Vec3[] = [
  [0, 1, 0],
  [0, -1, 0],
  [1, 0, 0],
  [-1, 0, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const EJECT_STEP = 0.1;
const EJECT_MAX_DISTANCE = 16;

/** Nearest position to `pos` where the player's box overlaps nothing (straight up wins a tie), or
 *  `pos` unchanged if there is none within reach. */
function ejectFromSolids(pos: Vec3, ext: Extents, isSolid: SolidFn): Vec3 {
  if (!overlapsSolid(pos, ext, isSolid)) return pos;
  for (let r = EJECT_STEP; r <= EJECT_MAX_DISTANCE; r += EJECT_STEP) {
    for (const [dx, dy, dz] of EJECT_DIRECTIONS) {
      const candidate: Vec3 = [pos[0] + dx * r, pos[1] + dy * r, pos[2] + dz * r];
      if (!overlapsSolid(candidate, ext, isSolid)) return candidate;
    }
  }
  return pos;
}

/**
 * Turns creative flight / NoClip on or off. Switching it off is the landing: collision is back, so a
 * player who was left inside a wall while noclipping is first moved to the nearest free space (else
 * they'd be stuck inside it), then gravity takes over and drops them onto whatever is below — the
 * normal sweep stops them flush on top of it.
 */
export function setFlying(state: PlayerState, flying: boolean, isSolid: SolidFn, dims: PlayerDims): PlayerState {
  if (state.flying === flying) return state;
  if (flying) return { pos: [...state.pos], vy: 0, onGround: false, flying: true };
  const pos = ejectFromSolids([...state.pos], extentsOf(dims), isSolid);
  return { pos, vy: 0, onGround: false, flying: false };
}

/** A horizontal move along `axis`. When it is blocked and the player is standing, tries to step up
 *  onto the obstacle: lift by up to `stepHeight`, carry on with the rest of the move, then settle
 *  back down onto whatever is underneath. Abandoned (position restored) if the lifted move gets
 *  nowhere, i.e. the obstacle is a wall, not a ledge. */
function moveHorizontal(pos: Vec3, ext: Extents, dims: PlayerDims, axis: number, d: number, canStep: boolean, isSolid: SolidFn): void {
  if (d === 0) return;
  const first = sweep(pos, ext, axis, d, isSolid);
  pos[axis] += first.moved;
  if (!first.blocked || !canStep) return;

  const start: Vec3 = [pos[0], pos[1], pos[2]];
  const lift = sweep(pos, ext, 1, dims.stepHeight, isSolid);
  pos[1] += lift.moved;
  const carried = sweep(pos, ext, axis, d - first.moved, isSolid);
  if (Math.abs(carried.moved) <= EPS) {
    pos[0] = start[0];
    pos[1] = start[1];
    pos[2] = start[2];
    return;
  }
  pos[axis] += carried.moved;
  const settle = sweep(pos, ext, 1, -lift.moved, isSolid);
  pos[1] += settle.moved;
}

/** Advances the player by `dt` seconds: horizontal walk (with step-up), jump, gravity, and landing. */
export function stepPlayer(state: PlayerState, input: PlayerInput, dt: number, isSolid: SolidFn, dims: PlayerDims): PlayerState {
  const t = Math.min(Math.max(dt, 0), MAX_DT);
  const ext = extentsOf(dims);
  const pos: Vec3 = [state.pos[0], state.pos[1], state.pos[2]];
  let vy = state.vy;

  // Walk. `forward`/`right` are the camera's own directions flattened to the ground plane, so
  // yaw 0 looks toward -Z and strafing right at yaw 0 moves +X. A diagonal is normalised so it
  // isn't faster than a straight walk.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  const wx = input.forward * -sin + input.strafe * cos;
  const wz = input.forward * -cos + input.strafe * -sin;
  const len = Math.hypot(wx, wz);

  // Creative flight / NoClip: hover, no collision, faster horizontally, Space up and Shift down.
  if (state.flying) {
    if (len > 0) {
      const scale = (dims.flySpeed * t) / Math.max(1, len);
      pos[0] += wx * scale;
      pos[2] += wz * scale;
    }
    pos[1] += ((input.jump ? 1 : 0) - (input.descend ? 1 : 0)) * dims.flyVerticalSpeed * t;
    return { pos, vy: 0, onGround: false, flying: true };
  }

  if (len > 0) {
    const scale = (dims.walkSpeed * t) / Math.max(1, len);
    moveHorizontal(pos, ext, dims, 0, wx * scale, state.onGround, isSolid);
    moveHorizontal(pos, ext, dims, 2, wz * scale, state.onGround, isSolid);
  }

  // Jump (only from the ground, so holding Space bunny-hops but can't double-jump), then gravity.
  if (input.jump && state.onGround) vy = dims.jumpSpeed;
  vy = Math.max(-dims.terminalSpeed, vy - dims.gravity * t);
  const fall = sweep(pos, ext, 1, vy * t, isSolid);
  pos[1] += fall.moved;
  if (fall.blocked) vy = 0;

  const onGround = vy <= 0 && sweep(pos, ext, 1, -GROUND_PROBE, isSolid).blocked;
  return { pos, vy, onGround, flying: false };
}
