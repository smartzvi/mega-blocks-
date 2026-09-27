import { describe, expect, it } from 'vitest';
import type { BlockModelElement } from '../../types/item';
import { minecartOnRailTemplate, minecartTemplate } from './cartTemplates';
import { BOAT_WOODS, boatTemplateFor } from './boatTemplates';
import { resolveMobTemplate, HAND_AUTHORED_MOB_TEMPLATES } from './handAuthoredMobTemplates';

/** Whether any element covers the unit cell whose lower corner is (x, y, z) — the plate models are
 *  built from unit-aligned boxes, so cell membership is exact. */
function occupied(elements: BlockModelElement[], x: number, y: number, z: number): boolean {
  return elements.some((el) => x >= el.from[0] && x + 1 <= el.to[0] && y >= el.from[1] && y + 1 <= el.to[1] && z >= el.from[2] && z + 1 <= el.to[2]);
}

function inside(elements: BlockModelElement[], w: number, h: number, d: number) {
  for (const el of elements) {
    for (let a = 0; a < 3; a++) {
      const limit = [w, h, d][a];
      expect(el.from[a]).toBeGreaterThanOrEqual(0);
      expect(el.to[a]).toBeLessThanOrEqual(limit);
      expect(el.from[a]).toBeLessThanOrEqual(el.to[a]);
    }
  }
}

describe('minecart', () => {
  const cart = minecartTemplate();

  it('is 20 long, 16 wide and 10 tall, and stays inside its model space', () => {
    expect(cart.depthUnits).toBe(20);
    expect(cart.heightUnits).toBe(10);
    inside(cart.model.elements, 16, 10, 20);
  });

  it('is hollow: a 2-thick floor and walls, with open space above the floor between them', () => {
    const els = cart.model.elements;
    expect(occupied(els, 8, 0, 10)).toBe(true); // floor
    expect(occupied(els, 8, 1, 10)).toBe(true);
    expect(occupied(els, 8, 2, 10)).toBe(false); // the inside of the cart
    expect(occupied(els, 8, 9, 10)).toBe(false);
    expect(occupied(els, 0, 5, 10)).toBe(true); // side wall
    expect(occupied(els, 15, 5, 10)).toBe(true);
    expect(occupied(els, 8, 5, 0)).toBe(true); // end walls
    expect(occupied(els, 8, 5, 19)).toBe(true);
    expect(occupied(els, 2, 5, 10)).toBe(false); // wall is only 2 thick
  });
});

describe('minecart on a rail', () => {
  // The voxel row a rail element occupies: the rasterizer widens a zero-thickness plane to one row.
  const rowTop = (el: BlockModelElement) => Math.max(el.to[1], el.from[1] + 1);
  const isRail = (el: BlockModelElement) => Object.keys(el.faces).length === 2 && el.faces.top?.texture === '#main';

  it('sits flat on a flat rail: the floor\'s underside meets the top of the rail\'s voxel row', () => {
    const t = minecartOnRailTemplate('north_south');
    const rail = t.model.elements.filter(isRail);
    const cartFloor = t.model.elements.filter((el) => !isRail(el) && el.to[1] - el.from[1] === 2 && el.to[0] - el.from[0] === 16);
    expect(rail).toHaveLength(1);
    expect(cartFloor.length).toBeGreaterThan(0);
    for (const f of cartFloor) expect(f.from[1]).toBe(rowTop(rail[0]));
    expect(t.depthUnits).toBe(20);
    expect(t.widthUnits).toBe(16);
  });

  for (const shape of ['ascending_north', 'ascending_south', 'ascending_east', 'ascending_west'] as const) {
    it(`${shape}: at every column that has rail under it, the cart floor rests exactly on the rail`, () => {
      const t = minecartOnRailTemplate(shape);
      const alongX = shape === 'ascending_east' || shape === 'ascending_west';
      const rail = t.model.elements.filter(isRail);
      const floors = t.model.elements.filter((el) => !isRail(el) && el.to[1] - el.from[1] === 2 && el.to[alongX ? 2 : 0] - el.from[alongX ? 2 : 0] === 16);
      const i = alongX ? 0 : 2;
      let checked = 0;
      for (const f of floors) {
        const railHere = rail.find((r) => r.from[i] === f.from[i]);
        if (!railHere) continue; // the overhang beyond the 16-long rail
        expect(f.from[1]).toBe(rowTop(railHere));
        checked++;
      }
      expect(checked).toBe(16);
    });

    it(`${shape}: climbs one row per unit of length and stays inside its model space`, () => {
      const t = minecartOnRailTemplate(shape);
      const alongX = shape === 'ascending_east' || shape === 'ascending_west';
      const i = alongX ? 0 : 2;
      const floors = t.model.elements
        .filter((el) => el.faces.top?.texture === '#cart' && el.to[1] - el.from[1] === 2 && el.to[alongX ? 2 : 0] - el.from[alongX ? 2 : 0] === 16)
        .sort((p, q) => p.from[i] - q.from[i]);
      expect(floors).toHaveLength(20);
      for (let k = 1; k < floors.length; k++) expect(Math.abs(floors[k].from[1] - floors[k - 1].from[1])).toBeLessThanOrEqual(1);
      inside(t.model.elements, t.widthUnits ?? 16, t.heightUnits, t.depthUnits);
      expect(alongX ? t.widthUnits : t.depthUnits).toBe(20);
    });
  }

  it('the high end really is high: ascending_south climbs toward +Z, ascending_north toward -Z', () => {
    const top = (shape: 'ascending_south' | 'ascending_north', z: number) => {
      const el = minecartOnRailTemplate(shape).model.elements.find((e) => e.faces.top?.texture === '#cart' && e.from[2] === z && e.to[1] - e.from[1] === 2)!;
      return el.from[1];
    };
    expect(top('ascending_south', 19)).toBeGreaterThan(top('ascending_south', 0));
    expect(top('ascending_north', 0)).toBeGreaterThan(top('ascending_north', 19));
  });

  it('a curve puts the cart on the flat corner rail', () => {
    const t = minecartOnRailTemplate('south_east');
    expect(t.model.textures.main).toBe('rail_corner');
    expect(t.model.textures.cart).toBe('minecart');
  });
});

describe('boat', () => {
  const boat = boatTemplateFor('oak');

  it('is 44 wide (oars out) by 32 long, and stays inside its model space', () => {
    expect(boat.widthUnits).toBe(44);
    expect(boat.depthUnits).toBe(32);
    inside(boat.model.elements, 44, boat.heightUnits, 32);
  });

  it('has the real plate sizes: 3-thick bottom, 6-tall 2-thick walls', () => {
    const [bottom, port, starboard, front, stern] = boat.model.elements;
    expect(bottom.to[1] - bottom.from[1]).toBe(3);
    expect(bottom.to[0] - bottom.from[0]).toBe(16);
    expect(bottom.to[2] - bottom.from[2]).toBe(28);
    for (const wall of [port, starboard]) {
      expect(wall.to[1] - wall.from[1]).toBe(6);
      expect(wall.to[0] - wall.from[0]).toBe(2);
      expect(wall.to[2] - wall.from[2]).toBe(28);
    }
    expect(front.to[0] - front.from[0]).toBe(16);
    expect(stern.to[0] - stern.from[0]).toBe(18);
  });

  it('is hollow with room to stand in: a 12-wide, 28-long interior above the floor, open at the top', () => {
    const els = boat.model.elements;
    for (let x = 16; x < 28; x++) {
      for (let z = 2; z < 30; z++) {
        expect(occupied(els, x, 3, z)).toBe(false);
        expect(occupied(els, x, 8, z)).toBe(false);
        expect(occupied(els, x, 0, z)).toBe(true); // the floor under it
      }
    }
    expect(occupied(els, 14, 5, 10)).toBe(true); // starboard wall
    expect(occupied(els, 29, 5, 10)).toBe(true); // port wall
  });

  it('has a pair of oars reaching out to both edges of the model, resting on the rim', () => {
    const els = boat.model.elements;
    expect(Math.min(...els.map((e) => e.from[0]))).toBe(0);
    expect(Math.max(...els.map((e) => e.to[0]))).toBe(44);
    const shafts = els.slice(5).filter((e) => e.to[1] - e.from[1] === 2);
    expect(shafts).toHaveLength(2);
    for (const s of shafts) expect(s.from[1]).toBe(9); // sits on the wall tops
  });

  it('every wood uses its own texture and restricts every element to its own species', () => {
    expect(BOAT_WOODS).toHaveLength(9);
    for (const wood of BOAT_WOODS) {
      const t = boatTemplateFor(wood);
      expect(t.model.textures.boat).toBe(`boat/${wood}`);
      expect(Object.keys(t.elementPaletteRestrictions ?? {})).toHaveLength(t.model.elements.length);
      expect(t.elementPaletteRestrictions![0]).toContain(`minecraft:${wood}_planks`);
    }
  });
});

describe('mob registry', () => {
  it('lists the new mobs with their default look', () => {
    expect(Object.keys(HAND_AUTHORED_MOB_TEMPLATES)).toEqual(expect.arrayContaining(['minecart', 'minecart on rail', 'boat']));
  });

  it('resolves the boat by wood and the cart-on-rail by shape, and leaves other mobs alone', () => {
    expect(resolveMobTemplate('boat', { boatWood: 'spruce' })!.model.textures.boat).toBe('boat/spruce');
    expect(resolveMobTemplate('boat')!.model.textures.boat).toBe('boat/oak');
    expect(resolveMobTemplate('minecart on rail', { railShape: 'ascending_east' })!.widthUnits).toBe(20);
    expect(resolveMobTemplate('minecart on rail')!.depthUnits).toBe(20);
    expect(resolveMobTemplate('pig')).toBe(HAND_AUTHORED_MOB_TEMPLATES.pig);
    expect(resolveMobTemplate('nope')).toBeUndefined();
  });
});
