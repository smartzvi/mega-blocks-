import { describe, expect, it } from 'vitest';
import { HAND_AUTHORED_TEMPLATES } from './handAuthoredTemplates';

describe('HAND_AUTHORED_TEMPLATES', () => {
  it('includes chest, trapped_chest, ender_chest with distinct texture keys but identical geometry', () => {
    const chest = HAND_AUTHORED_TEMPLATES.chest;
    const trapped = HAND_AUTHORED_TEMPLATES.trapped_chest;
    const ender = HAND_AUTHORED_TEMPLATES.ender_chest;
    expect(chest.model.textures.main).toBe('chest/normal');
    expect(trapped.model.textures.main).toBe('chest/trapped');
    expect(ender.model.textures.main).toBe('chest/ender');
    expect(chest.model.elements.map((e) => [e.from, e.to])).toEqual(trapped.model.elements.map((e) => [e.from, e.to]));
    expect(chest.model.elements.map((e) => [e.from, e.to])).toEqual(ender.model.elements.map((e) => [e.from, e.to]));
    expect(chest.heightUnits).toBe(16);
    expect(chest.depthUnits).toBe(16);
  });

  it('chest has exactly 2 elements (base + lid), both within 0-16 bounds and non-overlapping in y', () => {
    const { elements } = HAND_AUTHORED_TEMPLATES.chest.model;
    expect(elements).toHaveLength(2);
    for (const el of elements) {
      for (const v of [...el.from, ...el.to]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(16);
      }
    }
    const [base, lid] = elements;
    expect(base.to[1]).toBeLessThanOrEqual(lid.from[1]); // base sits below the lid
  });

  it('every element has all 6 faces defined, each referencing one of its model\'s own texture variables', () => {
    for (const { model } of Object.values(HAND_AUTHORED_TEMPLATES)) {
      for (const el of model.elements) {
        for (const face of ['top', 'bottom', 'north', 'south', 'east', 'west'] as const) {
          const faceDef = el.faces[face];
          expect(faceDef).toBeDefined();
          expect(faceDef!.texture.startsWith('#')).toBe(true);
          expect(model.textures[faceDef!.texture.slice(1)]).toBeDefined();
        }
      }
    }
  });

  it('includes all 17 shulker box variants (plain + 16 dye colors)', () => {
    const shulkerKeys = Object.keys(HAND_AUTHORED_TEMPLATES).filter((k) => k.includes('shulker_box'));
    expect(shulkerKeys).toHaveLength(17);
    expect(HAND_AUTHORED_TEMPLATES.shulker_box.model.textures.main).toBe('shulker/shulker');
    expect(HAND_AUTHORED_TEMPLATES.black_shulker_box.model.textures.main).toBe('shulker/shulker_black');
  });

  it('includes all 16 bed colors, each a genuinely 2-block-long (depthUnits=32) structure with 14 elements', () => {
    const bedKeys = Object.keys(HAND_AUTHORED_TEMPLATES).filter((k) => k.endsWith('_bed'));
    expect(bedKeys).toHaveLength(16);
    expect(HAND_AUTHORED_TEMPLATES.red_bed.model.textures.main).toBe('bed/red');
    expect(HAND_AUTHORED_TEMPLATES.white_bed.model.textures.main).toBe('bed/white');
    expect(HAND_AUTHORED_TEMPLATES.red_bed.heightUnits).toBe(16);
    expect(HAND_AUTHORED_TEMPLATES.red_bed.depthUnits).toBe(32);

    // Pillow (element 1 — mattress and pillow are listed first, see bedModel's doc on why order
    // matters for resolveFallbackTexture.ts) is restricted away from stone — regression test for
    // real user feedback that the pillow's gray border was matching diorite/polished_diorite (a
    // real, Lab-closest match, but stone reads wrong for a fabric pillow) — and a follow-up round
    // clarifying the fix should drop only diorite, keeping both wool and concrete so the original
    // multi-shade gradient/pattern isn't flattened. Every bed color shares this restriction.
    for (const key of bedKeys) {
      expect(HAND_AUTHORED_TEMPLATES[key].elementPaletteRestrictions?.[1]).toEqual([
        'minecraft:white_wool',
        'minecraft:white_concrete',
        'minecraft:light_gray_wool',
        'minecraft:light_gray_concrete',
      ]);
      // The rail base (2) and all 4 legs (3-6) are restricted to light oak only — real user
      // feedback went through 2 rounds here: first asking the frame to "cleanly wrap around...
      // connecting all four legs seamlessly with matching Oak Plank colors" (fixing other wood
      // species winning some voxels), then flagging that widening to dark_oak for contrast produced
      // "thick, random blocks of dark color" — fixed by dropping dark_oak from the base entirely and
      // moving it to dedicated seam-line elements instead (see indices 7-13 below).
      for (const i of [2, 3, 4, 5, 6]) {
        expect(HAND_AUTHORED_TEMPLATES[key].elementPaletteRestrictions?.[i]).toEqual([
          'minecraft:oak_planks',
          'minecraft:oak_log',
          'minecraft:stripped_oak_log',
        ]);
      }
      // The 7 seam-line elements (7-13) are restricted to the union of light oak (their 5
      // non-bottom faces) and a softer medium-brown pair (their bottom face only, via
      // stretchedBoxWithBottom) — round 6's fix for real user feedback that round 5's dark_oak-only
      // restriction both "spilled over" onto the outer side frame and read as "too dark/black".
      for (const i of [7, 8, 9, 10, 11, 12, 13]) {
        expect(HAND_AUTHORED_TEMPLATES[key].elementPaletteRestrictions?.[i]).toEqual([
          'minecraft:oak_planks',
          'minecraft:oak_log',
          'minecraft:stripped_oak_log',
          'minecraft:spruce_planks',
          'minecraft:stripped_spruce_log',
        ]);
      }
      // Only the mattress (0) is unrestricted — it keeps the full shared palette for its dyed color.
      expect(HAND_AUTHORED_TEMPLATES[key].elementPaletteRestrictions?.[0]).toBeUndefined();
    }

    const { elements } = HAND_AUTHORED_TEMPLATES.red_bed.model;
    expect(elements).toHaveLength(14); // mattress + pillow + rail base + 4 legs + 7 seam lines
    for (const el of elements) {
      for (const v of [el.from[0], el.to[0], el.from[1], el.to[1]]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(16); // X/Y stay one block
      }
      for (const v of [el.from[2], el.to[2]]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(32); // Z spans the full 2-block length
      }
    }
  });

  it('bed: 7 dark seam-line elements sit evenly spaced (every 4 units) across the rail\'s full width, on the rail\'s own Y-slice only, and never overlap a leg\'s Z footprint — regression test for real user feedback that seams must be "1-pixel wide, straight, parallel... evenly across the bottom", not the "thick, random blocks" a wider natural-texture palette produced', () => {
    const { elements } = HAND_AUTHORED_TEMPLATES.red_bed.model;
    const [, , rail, , , , , ...seams] = elements;
    expect(seams).toHaveLength(7);

    const expectedZs = [4, 8, 12, 16, 20, 24, 28];
    const actualCenters = seams.map((s) => (s.from[2] + s.to[2]) / 2).sort((a, b) => a - b);
    for (let i = 0; i < expectedZs.length; i++) {
      expect(actualCenters[i]).toBeCloseTo(expectedZs[i], 5);
    }

    for (const seam of seams) {
      // Inset 1 unit from each true outer edge (1 to 15, not the full 0-16) — see bedModel's doc
      // (round 6) for why: a seam reaching all the way to X=0/X=16 would put its own east/west
      // face at the model's true boundary, where a real bug let the accent color leak through on
      // the bottom-most row due to FACE_PRIORITY. Also exactly the rail's own Y-slice, so only the
      // bottom face is ever affected — its top face at Y `FRAME_HEIGHT` is hidden against the
      // mattress above.
      expect(seam.from[0]).toBe(1);
      expect(seam.to[0]).toBe(15);
      expect(seam.from[1]).toBe(rail.from[1]);
      expect(seam.to[1]).toBe(rail.to[1]);
      // Thin: exactly 1 unit in Z.
      expect(seam.to[2] - seam.from[2]).toBeCloseTo(1, 5);
      // Never overlaps a leg's own Z footprint (legs sit at Z 0-2 and Z 30-32).
      expect(seam.from[2]).toBeGreaterThanOrEqual(2);
      expect(seam.to[2]).toBeLessThanOrEqual(30);
    }
  });

  it('bed: each seam element\'s bottom face uses a different (darker) UV rect than its other 5 faces, and those 5 faces are byte-identical to the rail base\'s own rect — regression test for real user feedback that the seam color was "spilling over" onto the outer side frame (the seam\'s east/west faces sit at the model\'s true X=0/X=16 boundary and were exposed there too)', () => {
    const { elements } = HAND_AUTHORED_TEMPLATES.red_bed.model;
    const [, , rail, , , , , ...seams] = elements;

    for (const seam of seams) {
      const nonBottomUvs = (['top', 'north', 'south', 'east', 'west'] as const).map((f) => seam.faces[f]?.uv);
      // All 5 non-bottom faces share one rect...
      for (const uv of nonBottomUvs) expect(uv).toEqual(nonBottomUvs[0]);
      // ...and it's byte-identical to the base rail's own rect, so the outer side frame (exposed
      // at the seam's east/west faces) reads as perfectly continuous with the surrounding rail.
      expect(nonBottomUvs[0]).toEqual(rail.faces.east?.uv);
      // Only the bottom face differs — the darker accent that's actually still confined to the
      // underside.
      expect(seam.faces.bottom?.uv).not.toEqual(nonBottomUvs[0]);
    }
  });

  it('bed: the first element in every color\'s elements array resolves to that color\'s own dye-specific texture, not the fixed oak_planks/oak_log frame texture — regression test for a real bug: resolveFallbackTexture.ts\'s firstTextureKey walks elements in order and returns the first resolvable one as a representative color for structure mode\'s multi-cell fallback tier, so if a same-for-every-color oak texture were first, every dye color would fall back to the same oak-brown instead of its own color (caught by buildStructureVoxelGrid.test.ts)', () => {
    for (const color of ['red', 'white', 'blue']) {
      const { model } = HAND_AUTHORED_TEMPLATES[`${color}_bed`];
      const firstFace = Object.values(model.elements[0].faces)[0]!;
      const varName = firstFace.texture.slice(1);
      expect(model.textures[varName]).toBe(`bed/${color}`);
    }
  });

  it('bed: total height is 9 (5 wooden frame + 4 mattress — rebalanced from the original 3/6 split per real user feedback that legs read too short and the mattress too thick), with 4 corner legs, a full-footprint rail, a full-length blanket, and a pillow overlaid at the rear-top of the head section', () => {
    const { elements } = HAND_AUTHORED_TEMPLATES.red_bed.model;
    const [mattress, pillow, rail, legA, legB, legC, legD] = elements;

    // Nothing in the model exceeds the total height of 9 — the rebalance only moved the
    // frame/mattress split point, it didn't change the overall height.
    for (const el of elements) expect(el.to[1]).toBeLessThanOrEqual(9);

    // Rail: thin (Y 4-5), full 16x32 footprint, connecting the legs just under the mattress.
    expect(rail.from).toEqual([0, 4, 0]);
    expect(rail.to).toEqual([16, 5, 32]);

    // 4 legs, each a 2x5x2 post flush with an outer X/Z corner of the full 16x32 footprint —
    // taller than the original 2x3x2 spec per the user's "make the legs taller/more visible" ask.
    const legs = [legA, legB, legC, legD];
    for (const leg of legs) {
      expect(leg.to[0] - leg.from[0]).toBe(2);
      expect(leg.to[1] - leg.from[1]).toBe(5);
      expect(leg.to[2] - leg.from[2]).toBe(2);
      expect(leg.from[1]).toBe(0); // touches the ground
      expect([0, 14]).toContain(leg.from[0]); // flush with the left or right X edge
      expect([0, 30]).toContain(leg.from[2]); // flush with the front or back Z edge
    }
    // All 4 corners are actually covered, not the same corner 4 times.
    const cornerKeys = new Set(legs.map((l) => `${l.from[0]},${l.from[2]}`));
    expect(cornerKeys).toEqual(new Set(['0,0', '14,0', '0,30', '14,30']));

    // Mattress/blanket: full 16-wide, 32-deep slab from Y 5 to 9 (4 tall, thinner than the
    // original 6) — its TOP stays fixed at 9 (per explicit user request), only the bottom rose.
    expect(mattress.from).toEqual([0, 5, 0]);
    expect(mattress.to).toEqual([16, 9, 32]);

    // Pillow: full-width, sits at the very top-rear of the head section only (Y 6-9, Z 26-32) —
    // completely unchanged by the rebalance, and still fully contained within the (now shorter)
    // mattress range.
    expect(pillow.from).toEqual([0, 6, 26]);
    expect(pillow.to).toEqual([16, 9, 32]);
    expect(pillow.from[2]).toBeGreaterThanOrEqual(16); // within the head (rear) section, not the foot
    expect(pillow.from[1]).toBeGreaterThanOrEqual(mattress.from[1]); // still inside the mattress's Y range
  });

  it('bed: mattress and pillow top faces use a different UV rect than their other 5 faces, per an explicit "texture mapping only" request — everything else (including bottom/side UV) stays byte-identical to the pre-touch-up rects', () => {
    const { elements } = HAND_AUTHORED_TEMPLATES.red_bed.model;
    const [mattress, pillow] = elements;

    for (const el of [mattress, pillow]) {
      const nonTopUvs = (['bottom', 'north', 'south', 'east', 'west'] as const).map((f) => el.faces[f]?.uv);
      // All 5 non-top faces still share one identical rect with each other...
      for (const uv of nonTopUvs) expect(uv).toEqual(nonTopUvs[0]);
      // ...and that rect is NOT the same as the top face's rect (the whole point of the change).
      expect(el.faces.top?.uv).not.toEqual(nonTopUvs[0]);
    }

    // The non-top rects are exactly the original, pre-touch-up values — untouched.
    expect(mattress.faces.south?.uv).toEqual([22, 24, 38, 27]);
    expect(pillow.faces.south?.uv).toEqual([6, 2, 22, 6]);

    // Blanket top: same real pixel columns as before, but the V range is widened/reversed so the
    // real dark seam row (v24) lands at the high-V end — which, since FACE_AXES maps top's v-axis
    // straight to Z with no flip, is the box's high-Z (rear/pillow) end, not the front.
    expect(mattress.faces.top?.uv).toEqual([22, 27, 38, 24]);

    // Pillow top: the full real symmetric gray(v2)-white-gray(v13) span, not the original
    // asymmetric half-slice (v2-6) — same U range as before.
    expect(pillow.faces.top?.uv).toEqual([6, 2, 22, 13]);

    // Geometry (from/to) must be completely untouched by this change — re-assert directly here so
    // this test fails loudly if a future edit couples texture changes back to geometry changes.
    expect(mattress.from).toEqual([0, 5, 0]);
    expect(mattress.to).toEqual([16, 9, 32]);
    expect(pillow.from).toEqual([0, 6, 26]);
    expect(pillow.to).toEqual([16, 9, 32]);
  });

  it('beacon is a genuinely hollow glass shell (6 thin panels) around a real, unburied crystal', () => {
    const { model, heightUnits, depthUnits, elementPaletteRestrictions } = HAND_AUTHORED_TEMPLATES.beacon;
    expect(heightUnits).toBe(16);
    expect(depthUnits).toBe(16);
    expect(model.textures).toEqual({ glass: 'glass', obsidian: 'obsidian', beacon: 'beacon' });
    expect(model.elements).toHaveLength(8); // 6 shell panels + obsidian frame + crystal
    // Element 7 (the crystal) must be restricted to the curated white-to-light-blue set so
    // buildItemVoxelGrid.ts doesn't let it match against mismatched hues (froglight etc.) — this
    // is exactly the element the index has to point at, so assert on the model directly rather
    // than trusting the constant.
    expect(Object.keys(elementPaletteRestrictions ?? {})).toEqual(['7']);
    expect(elementPaletteRestrictions?.[7]).toEqual([
      'minecraft:sea_lantern',
      'minecraft:white_wool',
      'minecraft:white_concrete',
      'minecraft:light_blue_wool',
      'minecraft:light_blue_concrete',
    ]);
    expect(model.elements[7].faces.top?.texture).toBe('#beacon');

    const glassPanels = model.elements.filter((el) => el.faces.top?.texture === '#glass');
    expect(glassPanels).toHaveLength(6);
    // No panel is more than 1 unit thick on its own short axis — genuinely thin, not a filled box.
    for (const el of glassPanels) {
      const thickness = Math.min(el.to[0] - el.from[0], el.to[1] - el.from[1], el.to[2] - el.from[2]);
      expect(thickness).toBeLessThanOrEqual(1);
    }

    const crystal = model.elements.find((el) => el.faces.top?.texture === '#beacon')!;
    expect(crystal).toBeDefined();
    // The crystal must sit strictly inside the shell's interior on every axis (never touching or
    // exceeding the 0/16 outer boundary) — otherwise it would fuse with the shell wall and never
    // read as its own exposed, separately-colored element.
    for (const axis of [0, 1, 2] as const) {
      expect(crystal.from[axis]).toBeGreaterThan(1);
      expect(crystal.to[axis]).toBeLessThan(15);
    }

    const obsidian = model.elements.find((el) => el.faces.top?.texture === '#obsidian')!;
    expect(obsidian).toBeDefined();
    expect(obsidian.from[1]).toBeLessThan(crystal.from[1]); // frame sits below the crystal
  });

  it('includes standing + wall sign for all 12 wood types, sharing geometry and texture per wood', () => {
    const signKeys = Object.keys(HAND_AUTHORED_TEMPLATES).filter((k) => k.includes('sign'));
    expect(signKeys).toHaveLength(24); // 12 woods x (standing + wall)
    expect(HAND_AUTHORED_TEMPLATES.oak_sign.model.textures.main).toBe('signs/oak');
    expect(HAND_AUTHORED_TEMPLATES.oak_wall_sign.model.textures.main).toBe('signs/oak');
    expect(HAND_AUTHORED_TEMPLATES.oak_sign.model.elements).toEqual(HAND_AUTHORED_TEMPLATES.oak_wall_sign.model.elements);
    expect(HAND_AUTHORED_TEMPLATES.oak_sign.depthUnits).toBe(16);

    const { elements } = HAND_AUTHORED_TEMPLATES.warped_sign.model;
    expect(elements).toHaveLength(2); // post + board
    for (const el of elements) {
      for (const v of [...el.from, ...el.to]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(16);
      }
    }
  });

  it('includes standing + wall variants for all 6 mob head/skull blocks, each an 8x8x8 box centered on X/Z and resting on the ground — dragon_head deliberately excluded (see the doc on skullModel)', () => {
    const expected: Record<string, string> = {
      zombie_head: 'zombie/zombie',
      zombie_wall_head: 'zombie/zombie',
      skeleton_skull: 'skeleton/skeleton',
      skeleton_wall_skull: 'skeleton/skeleton',
      wither_skeleton_skull: 'skeleton/wither_skeleton',
      wither_skeleton_wall_skull: 'skeleton/wither_skeleton',
      creeper_head: 'creeper/creeper',
      creeper_wall_head: 'creeper/creeper',
      piglin_head: 'piglin/piglin',
      piglin_wall_head: 'piglin/piglin',
      player_head: 'player/wide/steve',
      player_wall_head: 'player/wide/steve',
    };
    for (const [name, textureKey] of Object.entries(expected)) {
      const t = HAND_AUTHORED_TEMPLATES[name];
      expect(t, `${name} missing`).toBeDefined();
      expect(t.model.textures.main).toBe(textureKey);
      expect(t.model.elements).toHaveLength(1);
      expect(t.model.elements[0].from).toEqual([4, 0, 4]);
      expect(t.model.elements[0].to).toEqual([12, 8, 12]);
      expect(t.heightUnits).toBe(16);
      expect(t.depthUnits).toBe(16);
    }
    // Standing and wall variants share identical geometry (no rotation handling), same precedent
    // as sign/wall_sign.
    expect(HAND_AUTHORED_TEMPLATES.zombie_head.model.elements).toEqual(HAND_AUTHORED_TEMPLATES.zombie_wall_head.model.elements);
    expect(HAND_AUTHORED_TEMPLATES.dragon_head).toBeUndefined();
    expect(HAND_AUTHORED_TEMPLATES.dragon_wall_head).toBeUndefined();
  });

  it('skeleton_skull and wither_skeleton_skull (and their wall variants) are restricted to a pure wool/concrete/terracotta grayscale palette, excluding stone_deepslate — regression test for real user feedback that the dark eye-socket area was matching polished_deepslate (accurate raw color, but reads as quarried stone rather than bone/shadow)', () => {
    const grayscale = [
      'minecraft:black_concrete', 'minecraft:black_wool', 'minecraft:black_terracotta',
      'minecraft:gray_concrete', 'minecraft:gray_wool', 'minecraft:gray_terracotta',
      'minecraft:light_gray_concrete', 'minecraft:light_gray_wool', 'minecraft:light_gray_terracotta',
      'minecraft:white_concrete', 'minecraft:white_wool', 'minecraft:white_terracotta',
    ];
    for (const name of ['skeleton_skull', 'skeleton_wall_skull', 'wither_skeleton_skull', 'wither_skeleton_wall_skull']) {
      expect(HAND_AUTHORED_TEMPLATES[name].elementPaletteRestrictions?.[0]).toEqual(grayscale);
    }
    // Every other head/skull is untouched — no evidence they had the same problem.
    for (const name of ['zombie_head', 'creeper_head', 'piglin_head', 'player_head']) {
      expect(HAND_AUTHORED_TEMPLATES[name].elementPaletteRestrictions).toBeUndefined();
    }
  });
});
