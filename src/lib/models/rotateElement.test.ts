import { describe, expect, it } from 'vitest';
import { rotateElementX, rotateElementY, shiftElementY } from './rotateElement';
import type { BlockModelElement } from '../../types/item';

describe('rotateElementY', () => {
  it('returns the element unchanged at 0 degrees', () => {
    const el: BlockModelElement = { from: [7, 0, 7], to: [9, 10, 9], faces: { north: { uv: [0, 0, 1, 1], texture: '#t' } } };
    expect(rotateElementY(el, 0)).toBe(el);
  });

  it('rotates a real ladder-like plane 90 degrees and relabels north/south to east/west', () => {
    // Real ladder.json's plane sits at z=15.2 (flush against the block's south wall) for the
    // unrotated facing=north variant. A real facing=east ladder (real oak/ladder blockstate:
    // facing=east -> y:90) is mounted on the block's WEST wall instead (confirmed real-game
    // behavior — you climb it approaching from the east) — so after a correct 90° turn this
    // plane must land near x=0 (here 0.8, mirroring the original's 0.8-from-the-boundary offset),
    // not near x=16.
    const el: BlockModelElement = {
      from: [0, 0, 15.2],
      to: [16, 16, 15.2],
      faces: {
        north: { uv: [0, 0, 16, 16], texture: '#t' },
        south: { uv: [16, 0, 0, 16], texture: '#t' },
      },
    };
    const rotated = rotateElementY(el, 90);
    expect(rotated.from[0]).toBeCloseTo(0.8);
    expect(rotated.from[1]).toBe(0);
    expect(rotated.from[2]).toBe(0);
    expect(rotated.to[0]).toBeCloseTo(0.8);
    expect(rotated.to[1]).toBe(16);
    expect(rotated.to[2]).toBe(16);
    expect(rotated.faces.east).toEqual({ uv: [0, 0, 16, 16], texture: '#t' }); // was north
    expect(rotated.faces.west).toEqual({ uv: [16, 0, 0, 16], texture: '#t' }); // was south
    expect(rotated.faces.north).toBeUndefined();
  });

  it('180 degrees maps north<->south and east<->west, leaving a centered element geometrically unchanged', () => {
    const el: BlockModelElement = {
      from: [6, 0, 6],
      to: [10, 16, 10],
      faces: { north: { uv: [0, 0, 1, 1], texture: '#n' }, south: { uv: [0, 0, 1, 1], texture: '#s' } },
    };
    const rotated = rotateElementY(el, 180);
    expect(rotated.from).toEqual([6, 0, 6]);
    expect(rotated.to).toEqual([10, 16, 10]);
    expect(rotated.faces.south).toEqual({ uv: [0, 0, 1, 1], texture: '#n' });
    expect(rotated.faces.north).toEqual({ uv: [0, 0, 1, 1], texture: '#s' });
  });

  it('270 degrees is the inverse of 90 degrees for geometry', () => {
    const el: BlockModelElement = { from: [2, 0, 3], to: [5, 4, 9], faces: {} };
    const roundTrip = rotateElementY(rotateElementY(el, 90), 270);
    expect(roundTrip.from).toEqual(el.from);
    expect(roundTrip.to).toEqual(el.to);
  });

  it('lands a genuine east face on the real x=16 east boundary after a 90 degree turn (regression guard: 90/270 were once swapped relative to the face-relabeling map)', () => {
    // A real box's "east" face is x=16 by the model format's own definition — this is true for
    // ANY box, not a convention this test assumes. FACE_ROTATION_MAP says east->south at 90°, so
    // after rotating, the box's south boundary (z=16) must be where that face physically ended up
    // — this exact check caught the previous 90°/270° swap that made every north/south-facing
    // stair row in village/plains/houses/plains_small_house_3's roof render with its solid riser
    // facing outward instead of its sloped tread (real oak_stairs.json: facing=south -> y:90).
    const eastHalfBox: BlockModelElement = {
      from: [8, 0, 0],
      to: [16, 16, 16],
      faces: { east: { uv: [0, 0, 16, 16], texture: '#t' } },
    };
    const rotated = rotateElementY(eastHalfBox, 90);
    expect(rotated.faces.south).toBeDefined();
    expect(rotated.faces.east).toBeUndefined();
    expect(rotated.to[2]).toBe(16); // the relabeled "south" face's boundary is genuinely at z=16
    expect(rotated.from[2]).toBe(8);
  });

  it('lands a genuine east face on the real x=16 east boundary after a 270 degree turn', () => {
    // Same invariant as the 90° case above, for the other previously-swapped rotation.
    // FACE_ROTATION_MAP says east->north at 270°, so the relabeled face must land at z=0.
    const eastHalfBox: BlockModelElement = {
      from: [8, 0, 0],
      to: [16, 16, 16],
      faces: { east: { uv: [0, 0, 16, 16], texture: '#t' } },
    };
    const rotated = rotateElementY(eastHalfBox, 270);
    expect(rotated.faces.north).toBeDefined();
    expect(rotated.faces.east).toBeUndefined();
    expect(rotated.from[2]).toBe(0); // the relabeled "north" face's boundary is genuinely at z=0
    expect(rotated.to[2]).toBe(8);
  });
});

describe('rotateElementX', () => {
  it('returns the element unchanged at 0 degrees', () => {
    const el: BlockModelElement = { from: [0, 0, 0], to: [16, 8, 16], faces: { bottom: { uv: [0, 0, 1, 1], texture: '#t' } } };
    expect(rotateElementX(el, 0)).toBe(el);
  });

  it('rotates a thin plane on the bottom face 90 degrees, relabeling it to the south face', () => {
    const el: BlockModelElement = {
      from: [0, 0, 0],
      to: [16, 0.8, 16],
      faces: { bottom: { uv: [0, 0, 16, 16], texture: '#t' } },
    };
    const rotated = rotateElementX(el, 90);
    expect(rotated.from).toEqual([0, 0, 15.2]);
    expect(rotated.to).toEqual([16, 16, 16]);
    expect(rotated.faces.south).toEqual({ uv: [0, 0, 16, 16], texture: '#t' });
    expect(rotated.faces.bottom).toBeUndefined();
  });

  it('180 degrees flips top<->bottom and north<->south together, matching a real half=top stair', () => {
    // A stair's upper step occupies the upper-north eighth of the block (from real oak_stairs.json's
    // second element: [0,8,0]-[16,16,8]) — half=top applies x:180 to flip a half=bottom stair
    // upside-down, which should land this piece in the lower-south eighth instead: [0,0,8]-[16,8,16].
    const upperStep: BlockModelElement = {
      from: [0, 8, 0],
      to: [16, 16, 8],
      faces: { top: { uv: [0, 0, 1, 1], texture: '#top' }, north: { uv: [0, 0, 1, 1], texture: '#side' } },
    };
    const rotated = rotateElementX(upperStep, 180);
    expect(rotated.from).toEqual([0, 0, 8]);
    expect(rotated.to).toEqual([16, 8, 16]);
    expect(rotated.faces.bottom).toEqual({ uv: [0, 0, 1, 1], texture: '#top' }); // was top
    expect(rotated.faces.south).toEqual({ uv: [0, 0, 1, 1], texture: '#side' }); // was north
  });

  it('270 degrees is the inverse of 90 degrees for geometry', () => {
    const el: BlockModelElement = { from: [2, 1, 3], to: [5, 4, 9], faces: {} };
    const roundTrip = rotateElementX(rotateElementX(el, 90), 270);
    expect(roundTrip.from).toEqual(el.from);
    expect(roundTrip.to).toEqual(el.to);
  });
});

describe('shiftElementY', () => {
  it('shifts only the y component of from/to, leaving x/z and faces untouched', () => {
    const el: BlockModelElement = {
      from: [0, 0, 0.25],
      to: [3, 16, 16],
      faces: { north: { uv: [0, 0, 16, 16], texture: '#top' } },
    };
    const shifted = shiftElementY(el, 16);
    expect(shifted.from).toEqual([0, 16, 0.25]);
    expect(shifted.to).toEqual([3, 32, 16]);
    expect(shifted.faces).toBe(el.faces);
  });
});
