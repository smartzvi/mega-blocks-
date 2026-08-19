import { describe, expect, it } from 'vitest';
import { rotateElementX, rotateElementY, shiftElementY } from './rotateElement';
import type { BlockModelElement } from '../../types/item';

describe('rotateElementY', () => {
  it('returns the element unchanged at 0 degrees', () => {
    const el: BlockModelElement = { from: [7, 0, 7], to: [9, 10, 9], faces: { north: { uv: [0, 0, 1, 1], texture: '#t' } } };
    expect(rotateElementY(el, 0)).toBe(el);
  });

  it('rotates a real ladder-like plane 90 degrees and relabels north/south to east/west', () => {
    const el: BlockModelElement = {
      from: [0, 0, 15.2],
      to: [16, 16, 15.2],
      faces: {
        north: { uv: [0, 0, 16, 16], texture: '#t' },
        south: { uv: [16, 0, 0, 16], texture: '#t' },
      },
    };
    const rotated = rotateElementY(el, 90);
    expect(rotated.from).toEqual([15.2, 0, 0]);
    expect(rotated.to).toEqual([15.2, 16, 16]);
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
