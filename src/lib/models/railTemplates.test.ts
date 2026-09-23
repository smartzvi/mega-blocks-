import { describe, expect, it } from 'vitest';
import { railTemplateFor, type RailShape } from './railTemplates';

const FLAT_SHAPES: RailShape[] = ['north_south', 'east_west', 'north_east', 'north_west', 'south_east', 'south_west'];
const ASCENDING_SHAPES: RailShape[] = ['ascending_north', 'ascending_south', 'ascending_east', 'ascending_west'];

describe('railTemplateFor', () => {
  it('defaults to a plain north_south-shaped flat rail with no properties (item mode\'s bare-name pick)', () => {
    const noProps = railTemplateFor('rail', undefined, 'rail_corner');
    const explicitNorthSouth = railTemplateFor('rail', { shape: 'north_south' }, 'rail_corner');
    expect(noProps.model.elements).toEqual(explicitNorthSouth.model.elements);
  });

  it('every flat shape is one element, a full 16x16 plane at y=1 (rail_flat.json\'s own real geometry) with only top/bottom faces', () => {
    for (const shape of FLAT_SHAPES) {
      const { model } = railTemplateFor('rail', { shape }, 'rail_corner');
      expect(model.elements).toHaveLength(1);
      const [el] = model.elements;
      expect(el.from).toEqual([0, 1, 0]);
      expect(el.to).toEqual([16, 1, 16]);
      expect(Object.keys(el.faces).sort()).toEqual(['bottom', 'top']);
    }
  });

  it('uses the corner texture for the 4 curve shapes, and the straight texture for north_south/east_west', () => {
    for (const shape of ['north_east', 'north_west', 'south_east', 'south_west'] as const) {
      expect(railTemplateFor('rail', { shape }, 'rail_corner').model.textures.main).toBe('rail_corner');
    }
    expect(railTemplateFor('rail', { shape: 'north_south' }, 'rail_corner').model.textures.main).toBe('rail');
    expect(railTemplateFor('rail', { shape: 'east_west' }, 'rail_corner').model.textures.main).toBe('rail');
  });

  it('falls back to the straight texture for a curve shape when no corner texture is given (powered/detector/activator rail, which have no real curve shapes)', () => {
    expect(railTemplateFor('powered_rail', { shape: 'north_east' }).model.textures.main).toBe('powered_rail');
  });

  it('every ascending shape is a staircase of THIN steps stacked directly on each other — no fill down to the ground (real vanilla has no support frame of its own) — starting flush with the flat rail\'s own resting height (y=1) and reaching the block\'s true ceiling (y=16)', () => {
    for (const shape of ASCENDING_SHAPES) {
      const { model } = railTemplateFor('rail', { shape }, 'rail_corner');
      expect(model.elements.length).toBeGreaterThan(1);

      for (const el of model.elements) {
        for (const v of [...el.from, ...el.to]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(16);
        }
      }

      // Order the elements by physical position along whichever axis actually varies (the climb
      // axis), then confirm the staircase profile: the very first step's own bottom sits on the
      // real rail resting height, every later step's bottom sits exactly on the previous step's
      // own top (no gap, and no fill reaching all the way back down to the ground), the rise per
      // step is always exactly 0 or 1 unit (RAMP_TOP_Y/RAMP_STEPS divide evenly — see
      // RAMP_TOP_Y's own doc — so there's no rounding-induced double-height step anywhere), and the
      // final step reaches the true ceiling.
      const axisIndex = model.elements[0].from[0] === model.elements[1]?.from[0] ? 2 : 0;
      const byPosition = [...model.elements].sort((a, b) => a.from[axisIndex] - b.from[axisIndex]);
      // byPosition[0] is whichever end has the smallest native coordinate — the real low (ground)
      // end for a highAtMax shape, but the real HIGH end for the other direction (ascending_north/
      // west's low end sits at the largest coordinate instead) — orient so index 0 is always the
      // real low end, whichever native direction that happens to be.
      const ordered = byPosition[0].to[1] <= byPosition[byPosition.length - 1].to[1] ? byPosition : [...byPosition].reverse();
      expect(ordered[0].from[1]).toBe(1);
      for (let i = 0; i < ordered.length; i++) {
        const rise = ordered[i].to[1] - ordered[i].from[1];
        expect(rise === 0 || rise === 1).toBe(true);
        if (i > 0) expect(ordered[i].from[1]).toBe(ordered[i - 1].to[1]); // stacked, not filled to the ground
      }
      expect(ordered[ordered.length - 1].to[1]).toBe(16);
    }
  });

  it('ascending_north and ascending_south climb along Z in opposite directions; ascending_east and ascending_west climb along X in opposite directions — matching the real template_rail_raised_ne/sw.json geometry rotated by hand (see railTemplates.ts\'s own doc), not guessed', () => {
    function highEnd(shape: RailShape, axisIndex: 0 | 2): number {
      const { model } = railTemplateFor('rail', { shape }, 'rail_corner');
      const tallest = model.elements.reduce((best, el) => (el.to[1] > best.to[1] ? el : best));
      return tallest.from[axisIndex];
    }
    // ascending_north's real high edge is z=0 (north); ascending_south's is z=16 (south).
    expect(highEnd('ascending_north', 2)).toBeLessThan(8);
    expect(highEnd('ascending_south', 2)).toBeGreaterThan(8);
    // ascending_east's real high edge is x=16 (east); ascending_west's is x=0 (west).
    expect(highEnd('ascending_east', 0)).toBeGreaterThan(8);
    expect(highEnd('ascending_west', 0)).toBeLessThan(8);
  });

  it('every element has all 6 possible faces covered by either top or bottom only (a real flat rail decal has no visible side face of its own)', () => {
    for (const shape of [...FLAT_SHAPES, ...ASCENDING_SHAPES]) {
      const { model } = railTemplateFor('rail', { shape }, 'rail_corner');
      for (const el of model.elements) {
        expect(Object.keys(el.faces).sort()).toEqual(['bottom', 'top']);
        for (const face of Object.values(el.faces)) {
          expect(face!.texture).toBe('#main');
        }
      }
    }
  });
});
