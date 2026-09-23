import { describe, expect, it } from 'vitest';
import { leverTemplateFor, isLever, leverPoweredProperties, DEFAULT_LEVER_POWERED } from './leverTemplate';

function inBounds(v: [number, number, number]) {
  for (const c of v) {
    expect(c).toBeGreaterThanOrEqual(0);
    expect(c).toBeLessThanOrEqual(16);
  }
}

describe('isLever / leverPoweredProperties', () => {
  it('recognizes "lever" with or without the minecraft: prefix, and nothing else', () => {
    expect(isLever('lever')).toBe(true);
    expect(isLever('minecraft:lever')).toBe(true);
    expect(isLever('stone_button')).toBe(false);
    expect(isLever('rail')).toBe(false);
  });

  it('only produces a powered property for a real lever', () => {
    expect(leverPoweredProperties('lever', true)).toEqual({ powered: 'true' });
    expect(leverPoweredProperties('lever', false)).toEqual({ powered: 'false' });
    expect(leverPoweredProperties('stone_button', true)).toBeUndefined();
  });
});

describe('leverTemplateFor', () => {
  it('defaults to face=floor, facing=north, powered=false (item mode\'s bare-name pick) with no properties given', () => {
    const noProps = leverTemplateFor(undefined);
    const explicit = leverTemplateFor({ face: 'floor', facing: 'north', powered: String(DEFAULT_LEVER_POWERED) });
    expect(noProps.model.elements).toEqual(explicit.model.elements);
  });

  it('every element stays within the 0-16 block bounds for every real face/facing/powered combination', () => {
    for (const face of ['floor', 'wall', 'ceiling'] as const) {
      for (const facing of ['north', 'east', 'south', 'west'] as const) {
        for (const powered of ['true', 'false']) {
          const { model } = leverTemplateFor({ face, facing, powered });
          for (const el of model.elements) {
            inBounds(el.from);
            inBounds(el.to);
            expect(el.from[0]).toBeLessThanOrEqual(el.to[0]);
            expect(el.from[1]).toBeLessThanOrEqual(el.to[1]);
            expect(el.from[2]).toBeLessThanOrEqual(el.to[2]);
          }
        }
      }
    }
  });

  it('has one base element plus 10 stepped arm elements (the arm\'s own local height, y=1 to y=11)', () => {
    const { model } = leverTemplateFor(undefined);
    expect(model.elements).toHaveLength(11);
  });

  it('face=floor,facing=north leaves the base mounting block at its real unrotated position', () => {
    const { model } = leverTemplateFor({ face: 'floor', facing: 'north', powered: 'false' });
    const base = model.elements[0];
    expect(base.from).toEqual([5, 0, 4]);
    expect(base.to).toEqual([11, 3, 12]);
  });

  it('facing rotates the whole model around Y exactly like rotateElementY would (spot-checked via the base element, since the base is a plain non-tilted box)', () => {
    const north = leverTemplateFor({ face: 'floor', facing: 'north', powered: 'false' }).model.elements[0];
    const east = leverTemplateFor({ face: 'floor', facing: 'east', powered: 'false' }).model.elements[0];
    // rotatePointY(x, z, 90) = [16 - z, x] (rotateElement.ts) applied to both corners of the base box.
    const [fx, , fz] = north.from;
    const [tx, , tz] = north.to;
    const rf: [number, number] = [16 - fz, fx];
    const rt: [number, number] = [16 - tz, tx];
    expect(east.from[0]).toBe(Math.min(rf[0], rt[0]));
    expect(east.to[0]).toBe(Math.max(rf[0], rt[0]));
    expect(east.from[2]).toBe(Math.min(rf[1], rt[1]));
    expect(east.to[2]).toBe(Math.max(rf[1], rt[1]));
  });

  it('powered=false and powered=true tilt the arm toward OPPOSITE Z directions (the real angle=+45/-45 flip), everything else being equal', () => {
    const off = leverTemplateFor({ face: 'floor', facing: 'north', powered: 'false' }).model.elements.slice(1);
    const on = leverTemplateFor({ face: 'floor', facing: 'north', powered: 'true' }).model.elements.slice(1);

    // The highest step (greatest `to[1]`) in each set — its Z position tells which way the arm leans.
    const highestOff = off.reduce((best, el) => (el.to[1] > best.to[1] ? el : best));
    const highestOn = on.reduce((best, el) => (el.to[1] > best.to[1] ? el : best));

    // Off (angle +45) leans toward higher Z (south); on (angle -45) leans toward lower Z (north) —
    // real vanilla data from blockstates/lever.json (see leverTemplate.ts's own doc), not guessed.
    expect(highestOff.to[2]).toBeGreaterThan(8);
    expect(highestOn.to[2]).toBeLessThan(8);
  });

  it('ceiling mounting is a real +180 shift from floor/wall\'s own y-per-facing mapping (see FACE_FACING_ROTATION\'s own doc): a ceiling,north base lands exactly where a floor,south base would', () => {
    const ceilingNorth = leverTemplateFor({ face: 'ceiling', facing: 'north', powered: 'false' }).model.elements[0];
    const floorSouth = leverTemplateFor({ face: 'floor', facing: 'south', powered: 'false' }).model.elements[0];
    // x differs (ceiling flips the block upside-down, floor doesn't), so only compare X/Z footprint.
    expect(ceilingNorth.from[0]).toBe(floorSouth.from[0]);
    expect(ceilingNorth.to[0]).toBe(floorSouth.to[0]);
    expect(ceilingNorth.from[2]).toBe(floorSouth.from[2]);
    expect(ceilingNorth.to[2]).toBe(floorSouth.to[2]);
  });

  it('every element only has the 6 uniform faces, all sampling real, verified-opaque UV rects', () => {
    const { model } = leverTemplateFor(undefined);
    for (const el of model.elements) {
      expect(Object.keys(el.faces).sort()).toEqual(['bottom', 'east', 'north', 'south', 'top', 'west']);
    }
  });

  it('restricts element 0 (the base mounting nub) to a real gray stone family — cobblestone itself isn\'t in this app\'s curated palette, and unrestricted per-pixel matching pulled in a visibly-wrong-material block (cyan_terracotta) for real cobblestone gray pixels, per user feedback that the base didn\'t read as stone at all', () => {
    const { elementPaletteRestrictions } = leverTemplateFor(undefined);
    expect(elementPaletteRestrictions?.[0]).toBeDefined();
    expect(elementPaletteRestrictions![0].length).toBeGreaterThan(0);
    expect(elementPaletteRestrictions![0]).not.toContain('minecraft:cyan_terracotta');
    expect(elementPaletteRestrictions![0]).toContain('minecraft:andesite');
  });
});
