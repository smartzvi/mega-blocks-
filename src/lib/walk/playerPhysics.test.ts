import { describe, expect, it } from 'vitest';
import {
  eyePosition,
  fellOutOfWorld,
  physicsToRender,
  playerDims,
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
const onFloor = (x = 20, z = 20): PlayerState => ({ pos: [x, FLOOR_TOP, z], vy: 0, onGround: true });

function run(state: PlayerState, input: PlayerInput, seconds: number, isSolid: SolidFn, dt = 1 / 60): PlayerState {
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += dt) s = stepPlayer(s, input, dt, isSolid, dims);
  return s;
}

describe('playerDims', () => {
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
    const s = run({ pos: [20, 40, 20], vy: 0, onGround: false }, still, 2, floor);
    expect(s.pos[1]).toBeCloseTo(FLOOR_TOP, 5);
    expect(s.vy).toBe(0);
    expect(s.onGround).toBe(true);
  });

  it('cannot tunnel through a one-voxel floor at terminal speed, even with the longest allowed frame', () => {
    const thin: SolidFn = (_x, y) => y === 0;
    let s: PlayerState = { pos: [20, 5000, 20], vy: 0, onGround: false };
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
    expect(fellOutOfWorld({ pos: [0, -1000, 0], vy: 0, onGround: false }, dims)).toBe(true);
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
