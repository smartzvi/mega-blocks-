import { describe, expect, it } from 'vitest';
import {
  eyePosition,
  fellOutOfWorld,
  physicsToRender,
  playerDims,
  setFlying,
  spawnAboveCenter,
  stepPlayer,
  type PlayerInput,
  type PlayerState,
  type SolidFn,
} from './playerPhysics';

const UNIT = 16;
const dims = playerDims(UNIT);
const FLOOR_TOP = 10; // cells y < 10 are solid: the player stands at y = 10

const still: PlayerInput = { forward: 0, strafe: 0, yaw: 0, jump: false };
// Yaw that makes "forward" walk toward +X / -X / +Z (yaw 0 looks toward -Z).
const YAW_EAST = -Math.PI / 2;
const YAW_SOUTH = Math.PI;

const floor: SolidFn = (_x, y) => y >= 0 && y < FLOOR_TOP;
const onFloor = (x = 20, z = 20): PlayerState => ({ pos: [x, FLOOR_TOP, z], vy: 0, onGround: true, flying: false });

function run(state: PlayerState, input: PlayerInput, seconds: number, isSolid: SolidFn, dt = 1 / 60): PlayerState {
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) s = stepPlayer(s, input, dt, isSolid, dims);
  return s;
}

import { detectDoubleTap } from './doubleTap';

describe('playerDims', () => {
  it('is a real Minecraft player in world blocks at unit 1: 1.8 tall, eyes at 1.62 (a voxel is one block once exported, whatever the resolution)', () => {
    const real = playerDims(1);
    expect(real.height).toBeCloseTo(1.8);
    expect(real.eyeHeight).toBeCloseTo(1.62);
    expect(real.halfWidth).toBeCloseTo(0.3);
  });

  it('scales every real-world size by the voxels-per-block unit', () => {
    const one = playerDims(1);
    const big = playerDims(64);
    expect(big.height).toBeCloseTo(one.height * 64);
    expect(big.walkSpeed).toBeCloseTo(one.walkSpeed * 64);
    expect(dims.height).toBeCloseTo(28.8); // 1.8 blocks at 16 voxels per block
  });
});

describe('gravity and landing', () => {
  it('falls onto a floor and comes to rest exactly on top of it', () => {
    const s = run({ pos: [20, 40, 20], vy: 0, onGround: false, flying: false }, still, 2, floor);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
    expect(s.vy).toBe(0);
    expect(s.onGround).toBe(true);
  });

  it('cannot tunnel through a one-voxel floor at terminal speed, even with the longest allowed frame', () => {
    const thin: SolidFn = (_x, y) => y === 0;
    let s: PlayerState = { pos: [20, 5000, 20], vy: 0, onGround: false, flying: false };
    for (let i = 0; i < 400 && !s.onGround; i++) s = stepPlayer(s, still, 0.05, thin, dims);
    expect(s.onGround).toBe(true);
    expect(s.pos[1]).toBeCloseTo(1, 5);
  });

  it('keeps standing still on the floor without drifting or sinking', () => {
    const s = run(onFloor(), still, 3, floor);
    expect(s.pos).toEqual([20, FLOOR_TOP, 20]);
    expect(s.onGround).toBe(true);
  });
});

describe('walking', () => {
  it('walks at the real walk speed on open ground', () => {
    const s = run(onFloor(20, 100), { ...still, forward: 1 }, 1, floor);
    expect(s.pos[0]).toBeCloseTo(20, 5); // no sideways drift
    expect(100 - s.pos[2]).toBeCloseTo(dims.walkSpeed, 1); // yaw 0 walks toward -Z
  });

  it('does not walk faster on a diagonal', () => {
    const s = run(onFloor(100, 100), { ...still, forward: 1, strafe: 1 }, 1, floor);
    expect(Math.hypot(s.pos[0] - 100, s.pos[2] - 100)).toBeCloseTo(dims.walkSpeed, 1);
  });

  it('follows the camera yaw: yaw 0 forward is -Z, strafing right is +X, and yaw -90deg turns forward toward +X', () => {
    expect(run(onFloor(100, 100), { ...still, forward: 1 }, 0.5, floor).pos[2]).toBeLessThan(100);
    expect(run(onFloor(100, 100), { ...still, strafe: 1 }, 0.5, floor).pos[0]).toBeGreaterThan(100);
    expect(run(onFloor(100, 100), { ...still, forward: 1, yaw: YAW_EAST }, 0.5, floor).pos[0]).toBeGreaterThan(100);
    expect(run(onFloor(100, 100), { ...still, forward: 1, yaw: YAW_SOUTH }, 0.5, floor).pos[2]).toBeGreaterThan(100);
  });
});

describe('walls', () => {
  const WALL_X = 30;
  const wall: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= WALL_X && y >= 0 && y < 60);

  it('stops flush against a wall and stays outside it', () => {
    const s = run(onFloor(), { ...still, forward: 1, yaw: YAW_EAST }, 3, wall);
    expect(s.pos[0]).toBeCloseTo(WALL_X - dims.halfWidth, 4);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
  });

  it('slides along a wall instead of sticking to it', () => {
    const s = run(onFloor(20, 100), { ...still, forward: 1, strafe: 0, yaw: YAW_EAST + 0.4 }, 1, wall);
    expect(s.pos[0]).toBeCloseTo(WALL_X - dims.halfWidth, 4);
    expect(s.pos[2]).toBeLessThan(100); // still made progress along the wall
  });

  it('cannot squeeze through a one-voxel-thick wall at high speed', () => {
    const thinWall: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x === 40 && y >= 0 && y < 60);
    let s = onFloor(20, 20);
    for (let i = 0; i < 400; i++) s = stepPlayer(s, { ...still, forward: 1, yaw: YAW_EAST }, 0.05, thinWall, dims);
    expect(s.pos[0]).toBeLessThanOrEqual(40 - dims.halfWidth + 1e-6);
  });
});

describe('stepping up', () => {
  const ledge = (height: number): SolidFn => (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && y >= 0 && y < FLOOR_TOP + height);

  it('walks straight up a ledge no taller than the step height', () => {
    const s = run(onFloor(), { ...still, forward: 1, yaw: YAW_EAST }, 2, ledge(5));
    expect(s.pos[0]).toBeGreaterThan(30);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP + 5, 5);
    expect(s.onGround).toBe(true);
  });

  it('walks up a 1-voxel stair run one step at a time', () => {
    const stairs: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && y >= 0 && y < FLOOR_TOP + Math.floor((x - 30) / 4) + 1);
    const s = run(onFloor(), { ...still, forward: 1, yaw: YAW_EAST }, 2, stairs);
    expect(s.pos[0]).toBeGreaterThan(40);
    expect(s.pos[1]).toBeGreaterThan(FLOOR_TOP + 2);
  });

  it('is stopped by a ledge taller than the step height', () => {
    const tall = Math.ceil(dims.stepHeight) + 2;
    const s = run(onFloor(), { ...still, forward: 1, yaw: YAW_EAST }, 3, ledge(tall));
    expect(s.pos[0]).toBeCloseTo(30 - dims.halfWidth, 4);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
  });

  it('does not step up onto a ledge with no headroom above it', () => {
    const lowCeiling: SolidFn = (x, y) =>
      (y >= 0 && y < FLOOR_TOP) || (x >= 30 && y >= 0 && y < FLOOR_TOP + 5) || (x >= 30 && y >= FLOOR_TOP + 5 + 10 && y < 80);
    const s = run(onFloor(), { ...still, forward: 1, yaw: YAW_EAST }, 3, lowCeiling);
    expect(s.pos[0]).toBeLessThan(30);
  });
});

describe('jumping', () => {
  it('peaks at about 1.25 blocks and lands back on the floor', () => {
    let s = onFloor();
    let peak = FLOOR_TOP;
    s = stepPlayer(s, { ...still, jump: true }, 1 / 240, floor, dims);
    for (let i = 0; i < 480; i++) {
      s = stepPlayer(s, still, 1 / 240, floor, dims);
      peak = Math.max(peak, s.pos[1]);
    }
    expect(peak - FLOOR_TOP).toBeGreaterThan(1.25 * UNIT - 1);
    expect(peak - FLOOR_TOP).toBeLessThan(1.25 * UNIT + 1);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
    expect(s.onGround).toBe(true);
  });

  it('cannot jump again in mid-air', () => {
    let s = stepPlayer(onFloor(), { ...still, jump: true }, 1 / 60, floor, dims);
    for (let i = 0; i < 10; i++) s = stepPlayer(s, still, 1 / 60, floor, dims);
    const before = s.vy;
    s = stepPlayer(s, { ...still, jump: true }, 1 / 60, floor, dims);
    expect(s.vy).toBeLessThan(before); // gravity only — no second kick
  });

  it('clears a one-block wall by jumping but not a two-block wall', () => {
    const wallOf = (blocks: number): SolidFn => (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && y >= 0 && y < FLOOR_TOP + blocks * UNIT);
    const jumpAt = (blocks: number) => run(onFloor(), { forward: 1, strafe: 0, yaw: YAW_EAST, jump: true }, 3, wallOf(blocks));
    expect(jumpAt(1).pos[0]).toBeGreaterThan(30);
    expect(jumpAt(2).pos[0]).toBeLessThan(30);
  });

  it('bumps its head on a ceiling and starts falling', () => {
    const ceiling: SolidFn = (_x, y) => (y >= 0 && y < FLOOR_TOP) || y === FLOOR_TOP + Math.ceil(dims.height) + 3;
    let s = stepPlayer(onFloor(), { ...still, jump: true }, 1 / 120, ceiling, dims);
    let maxHead = 0;
    for (let i = 0; i < 240; i++) {
      s = stepPlayer(s, still, 1 / 120, ceiling, dims);
      maxHead = Math.max(maxHead, s.pos[1] + dims.height);
    }
    expect(maxHead).toBeLessThanOrEqual(FLOOR_TOP + Math.ceil(dims.height) + 3 + 1e-6);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
  });
});

describe('spawn, void and coordinates', () => {
  it('spawns above the centre of the grid, higher than any block', () => {
    const s = spawnAboveCenter(40, 30, 20);
    expect(s.pos[0]).toBe(20);
    expect(s.pos[2]).toBe(10);
    expect(s.pos[1]).toBeGreaterThan(30);
  });

  it('flags a player who has fallen well below the grid', () => {
    expect(fellOutOfWorld({ pos: [0, -1000, 0], vy: 0, onGround: false, flying: false }, dims)).toBe(true);
    expect(fellOutOfWorld(onFloor(), dims)).toBe(false);
  });

  it('converts to the preview\'s centred coordinates: a voxel centre lands on its rendered centre', () => {
    // Voxel i is drawn centred at i - (size - 1) / 2; its physics-space centre is i + 0.5.
    const i = 3;
    const size = 10;
    const render = physicsToRender([i + 0.5, i + 0.5, i + 0.5], size, size, size);
    expect(render[0]).toBeCloseTo(i - (size - 1) / 2);
  });

  it('puts the eye at the real eye height above the feet', () => {
    expect(eyePosition(onFloor(), dims)[1]).toBeCloseTo(FLOOR_TOP + 1.62 * UNIT);
  });

  it('never produces NaN, even for a zero or huge frame time', () => {
    for (const dt of [0, 5, -1]) {
      const s = stepPlayer(onFloor(), { forward: 1, strafe: 1, yaw: 1, jump: true }, dt, floor, dims);
      expect(s.pos.every(Number.isFinite)).toBe(true);
    }
  });
});

describe('creative flight / noclip', () => {
  const wallSolid: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && x < 34 && y >= 0 && y < 80);
  const flyingAt = (x: number, y: number, z: number): PlayerState => ({ pos: [x, y, z], vy: 0, onGround: false, flying: true });

  it('hovers: no gravity while flying', () => {
    const s = run(flyingAt(20, 40, 20), still, 2, floor);
    expect(s.pos[1]).toBeCloseTo(40, 6);
    expect(s.flying).toBe(true);
    expect(s.onGround).toBe(false);
  });

  it('flies up with jump and down with descend, at the flying vertical speed', () => {
    const up = run(flyingAt(20, 40, 20), { ...still, jump: true }, 1, floor);
    expect(up.pos[1] - 40).toBeCloseTo(dims.flyVerticalSpeed, 1);
    const down = run(flyingAt(20, 40, 20), { ...still, descend: true }, 1, floor);
    expect(40 - down.pos[1]).toBeCloseTo(dims.flyVerticalSpeed, 1);
  });

  it('flies horizontally faster than it walks', () => {
    const s = run(flyingAt(100, 40, 100), { ...still, forward: 1 }, 1, floor);
    expect(100 - s.pos[2]).toBeCloseTo(dims.flySpeed, 1);
    expect(dims.flySpeed).toBeGreaterThan(dims.walkSpeed);
  });

  it('passes straight through walls and the floor (noclip)', () => {
    const through = run(flyingAt(20, 30, 20), { ...still, forward: 1, yaw: YAW_EAST }, 3, wallSolid);
    expect(through.pos[0]).toBeGreaterThan(40);
    const down = run(flyingAt(20, 30, 20), { ...still, descend: true }, 2, floor);
    expect(down.pos[1]).toBeLessThan(FLOOR_TOP - 5);
  });

  it('does not fall out of the world while flying below the grid', () => {
    expect(fellOutOfWorld(flyingAt(0, -1000, 0), dims)).toBe(false);
  });

  it('switching flight off in mid-air drops the player onto the floor and lands exactly on top', () => {
    let s = setFlying(flyingAt(20, 60, 20), false, floor, dims);
    expect(s.flying).toBe(false);
    s = run(s, still, 3, floor);
    expect(s.onGround).toBe(true);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
  });

  it('switching flight off inside a wall moves the player to the nearest free space, not stuck in the block', () => {
    const inside = flyingAt(32, 40, 20);
    const s = setFlying(inside, false, wallSolid, dims);
    // nothing overlaps at the new position
    const stuck = run(s, still, 0.001, wallSolid);
    expect(stuck.pos.every(Number.isFinite)).toBe(true);
    const landed = run(s, still, 3, wallSolid);
    expect(landed.onGround).toBe(true);
    const halfW = dims.halfWidth;
    const insideWall = landed.pos[0] + halfW > 30 + 1e-6 && landed.pos[0] - halfW < 34 - 1e-6 && landed.pos[1] < 80;
    expect(insideWall).toBe(false);
  });

  it('turning flight on keeps the position and clears vertical speed; turning it on twice is a no-op', () => {
    const falling: PlayerState = { pos: [20, 30, 20], vy: -50, onGround: false, flying: false };
    const on = setFlying(falling, true, floor, dims);
    expect(on.flying).toBe(true);
    expect(on.vy).toBe(0);
    expect(on.pos).toEqual([20, 30, 20]);
    expect(setFlying(on, true, floor, dims)).toBe(on);
  });
});

describe('detectDoubleTap', () => {
  it('a second tap inside the window is a double-tap and is consumed', () => {
    const first = detectDoubleTap(null, 1000);
    expect(first).toEqual({ isDouble: false, next: 1000 });
    const second = detectDoubleTap(first.next, 1200);
    expect(second).toEqual({ isDouble: true, next: null });
    expect(detectDoubleTap(second.next, 1250).isDouble).toBe(false); // a third quick tap starts a new pair
  });

  it('a slow second tap is just a new first tap', () => {
    expect(detectDoubleTap(1000, 1500)).toEqual({ isDouble: false, next: 1500 });
  });
});

describe('at real Minecraft scale (1 voxel = 1 block, the scale the walk mode actually uses)', () => {
  const real = playerDims(1);
  const runReal = (state: PlayerState, input: PlayerInput, seconds: number, isSolid: SolidFn, dt = 1 / 60) => {
    let s = state;
    for (let t = 0; t < seconds - 1e-9; t += dt) s = stepPlayer(s, input, dt, isSolid, real);
    return s;
  };
  const stand = (x: number, z: number): PlayerState => ({ pos: [x, FLOOR_TOP, z], vy: 0, onGround: true, flying: false });
  const walkEast: PlayerInput = { forward: 1, strafe: 0, yaw: YAW_EAST, jump: false };

  // A wall across x = 30..31 with a doorway `height` blocks tall cut out of it, on a floor of y < 10.
  const doorway = (height: number): SolidFn => (x, y) =>
    (y >= 0 && y < FLOOR_TOP) || (x >= 30 && x < 32 && y >= FLOOR_TOP + height && y < 60);

  it('walks through a two-block-high doorway (the player is 1.8 tall) but not a one-block-high one', () => {
    expect(runReal(stand(20, 20), walkEast, 4, doorway(2)).pos[0]).toBeGreaterThan(32);
    expect(runReal(stand(20, 20), walkEast, 4, doorway(1)).pos[0]).toBeLessThan(30);
  });

  it('is stopped by a one-block ledge (the step-up is only 0.6) but can jump up onto it (a jump peaks at 1.25)', () => {
    const ledge: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && y >= FLOOR_TOP && y < FLOOR_TOP + 1);
    const walked = runReal(stand(20, 20), walkEast, 3, ledge);
    expect(walked.pos[0]).toBeCloseTo(30 - real.halfWidth, 4);
    expect(walked.pos[1]).toBeCloseTo(FLOOR_TOP, 5);

    // One press of jump (holding it would bunny-hop forever), then just keep walking.
    // Jumped from about a block short of the ledge: a jump only carries a couple of blocks forward.
    const launched = stepPlayer(stand(28.8, 20), { ...walkEast, jump: true }, 1 / 60, ledge, real);
    const jumped = runReal(launched, walkEast, 3, ledge);
    expect(jumped.pos[0]).toBeGreaterThan(30);
    expect(jumped.pos[1]).toBeCloseTo(FLOOR_TOP + 1, 5);
    expect(jumped.onGround).toBe(true);
  });

  it('cannot jump onto a two-block wall', () => {
    const wall2: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && y >= FLOOR_TOP && y < FLOOR_TOP + 2);
    expect(runReal(stand(20, 20), { ...walkEast, jump: true }, 3, wall2).pos[0]).toBeLessThan(30);
  });

  it('flying lets the same player clip through that wall and, on landing, come down on top of it', () => {
    const wall2: SolidFn = (x, y) => (y >= 0 && y < FLOOR_TOP) || (x >= 30 && x < 34 && y >= FLOOR_TOP && y < FLOOR_TOP + 2);
    let s = setFlying(stand(20, 20), true, wall2, real);
    s = runReal(s, walkEast, 2, wall2); // 21.8 blocks east through the wall
    expect(s.pos[0]).toBeGreaterThan(34);
    s = setFlying({ ...s, pos: [31.5, FLOOR_TOP + 0.2, 20] }, false, wall2, real); // switch off while inside it
    s = runReal(s, { forward: 0, strafe: 0, yaw: 0, jump: false }, 3, wall2);
    expect(s.onGround).toBe(true);
    expect(s.pos[1]).toBeGreaterThanOrEqual(FLOOR_TOP + 2 - 1e-6); // ended on top of the wall, not inside it
  });
});
