import { describe, expect, it } from 'vitest';
import { HAND_AUTHORED_TEMPLATES, resolveHandAuthoredTemplate } from './handAuthoredTemplates';

describe('HAND_AUTHORED_TEMPLATES', () => {
  it('includes chest, trapped_chest, ender_chest with distinct texture keys and distinct fill/knob colors, but identical geometry and seam color, when no real properties are given (item mode default)', () => {
    const chest = resolveHandAuthoredTemplate('chest')!;
    const trapped = resolveHandAuthoredTemplate('trapped_chest')!;
    const ender = resolveHandAuthoredTemplate('ender_chest')!;
    expect(chest.model.textures.main).toBe('chest/normal');
    expect(trapped.model.textures.main).toBe('chest/trapped');
    expect(ender.model.textures.main).toBe('chest/ender');
    expect(chest.model.elements.map((e) => [e.from, e.to])).toEqual(trapped.model.elements.map((e) => [e.from, e.to]));
    expect(chest.model.elements.map((e) => [e.from, e.to])).toEqual(ender.model.elements.map((e) => [e.from, e.to]));
    expect(chest.heightUnits).toBe(16);
    expect(chest.depthUnits).toBe(16);

    // The frame (element 2 is its first corner post) is the same dark brown for normal/trapped, and
    // a darker black for the ender chest, whose real outline is darker than its body...
    expect(chest.elementPaletteRestrictions?.[2]).toEqual(['minecraft:gray_terracotta']);
    expect(trapped.elementPaletteRestrictions?.[2]).toEqual(['minecraft:gray_terracotta']);
    expect(ender.elementPaletteRestrictions?.[2]).toEqual(['minecraft:black_concrete']);
    // ...and the fill (0, 1) and knob/latch (last) differ: a golden-brown yellow_terracotta for
    // chest/trapped_chest (closer to the real plank colour than oak_planks, and reads as amber/
    // ochre rather than pale tan — see CHEST_PLANK_PALETTE's own doc), black wool + gold accent for
    // the black/purple-themed ender chest (real `obsidian` isn't in this app's curated palette at
    // all — confirmed directly — so it would silently fall back to the unrestricted match instead
    // of actually restricting anything).
    expect(chest.elementPaletteRestrictions?.[0]).toEqual(['minecraft:yellow_terracotta']);
    expect(chest.elementPaletteRestrictions?.[1]).toEqual(['minecraft:yellow_terracotta']);
    expect(trapped.elementPaletteRestrictions?.[0]).toEqual(['minecraft:yellow_terracotta']);
    expect(ender.elementPaletteRestrictions?.[0]).toEqual(['minecraft:black_wool']);
    const lastIndex = chest.model.elements.length - 1;
    expect(chest.elementPaletteRestrictions?.[lastIndex]).toEqual(['minecraft:light_gray_concrete']);
    expect(ender.elementPaletteRestrictions?.[lastIndex]).toEqual(['minecraft:yellow_terracotta']);
  });

  it('chest is two plank boxes plus a dark 1-voxel outline (4 corner posts, bottom/band/top rings) and a latch, all within 0-16 bounds — regression test for the real chest texture outline, per the reference render of the real chest', () => {
    const { elements } = resolveHandAuthoredTemplate('chest')!.model;
    // 2 fills + 4 posts + 3 rings x 4 bars + latch.
    expect(elements).toHaveLength(2 + 4 + 12 + 1);
    for (const el of elements) {
      for (const v of [...el.from, ...el.to]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(16);
      }
    }
    const [baseFill, lidFill, ...rest] = elements;
    const latch = rest[rest.length - 1];
    const frame = rest.slice(0, -1);

    // Real box heights: base 10 tall from the floor, lid 5 tall, overlapping by the one band row.
    expect([baseFill.from[1], baseFill.to[1]]).toEqual([0, 10]);
    expect([lidFill.from[1], lidFill.to[1]]).toEqual([9, 14]);

    // Full-height corner posts (1x1 in plan) and a band ring on the shared row y=9..10.
    const posts = frame.filter((el) => el.to[0] - el.from[0] === 1 && el.to[2] - el.from[2] === 1);
    expect(posts).toHaveLength(4);
    for (const post of posts) expect([post.from[1], post.to[1]]).toEqual([0, 14]);
    const bandBars = frame.filter((el) => el.from[1] === 9 && el.to[1] === 10);
    expect(bandBars).toHaveLength(4);
    // Rims: a ring at the bottom (y 0-1) and at the top (y 13-14).
    expect(frame.filter((el) => el.from[1] === 0 && el.to[1] === 1)).toHaveLength(4);
    expect(frame.filter((el) => el.from[1] === 13 && el.to[1] === 14)).toHaveLength(4);

    // The latch protrudes in front of the front face and straddles the band.
    expect(latch.from[2]).toBeLessThan(baseFill.from[2]);
    expect(latch.from[1]).toBeLessThan(9);
    expect(latch.to[1]).toBeGreaterThan(10);
  });

  it('with no real type/facing properties (type=single, or item mode\'s no-properties default), always builds the full unrotated chest regardless of a stray facing property alone', () => {
    const plain = resolveHandAuthoredTemplate('chest')!;
    const withFacingOnly = resolveHandAuthoredTemplate('chest', { facing: 'west' })!;
    const withTypeSingle = resolveHandAuthoredTemplate('chest', { facing: 'west', type: 'single' })!;
    expect(withFacingOnly.model.elements).toEqual(plain.model.elements);
    expect(withTypeSingle.model.elements).toEqual(plain.model.elements);
    expect(plain.model.elements).toHaveLength(19);
  });

  it('a real type=right/type=left chest (default facing=north, no rotation) extends fill/latch flush to the true block edge on the side facing its twin, per the confirmed left/right-to-compass rule (right has its open side to the west and left to the east, when facing=north), and drops the outline posts and ring end-caps on that side so two halves join into one chest', () => {
    const right = resolveHandAuthoredTemplate('chest', { facing: 'north', type: 'right' })!;
    // 2 fills + 2 posts + 3 rings x 3 bars + latch (the open side's post and end-cap bar are gone).
    expect(right.model.elements).toHaveLength(2 + 2 + 9 + 1);
    const [rightBaseFill, rightLidFill] = right.model.elements;
    const rightLatch = right.model.elements[right.model.elements.length - 1];
    expect(rightBaseFill.from[0]).toBe(0); // flush to the true west edge, not inset to 2
    expect(rightLidFill.from[0]).toBe(0);
    expect(rightLatch.from[0]).toBe(0); // latch shifted flush to the same open (west) edge
    // Nothing is left of the outline on the open (west) side: no 1-wide piece at x=1..2.
    expect(right.model.elements.filter((el) => el.from[0] === 1 && el.to[0] === 2)).toHaveLength(0);
    // The front/back bars still run right to the open edge.
    expect(right.model.elements.some((el) => el.from[0] === 0 && el.to[0] === 15 && el.to[2] - el.from[2] === 1)).toBe(true);

    const left = resolveHandAuthoredTemplate('chest', { facing: 'north', type: 'left' })!;
    expect(left.model.elements).toHaveLength(2 + 2 + 9 + 1);
    const [leftBaseFill, leftLidFill] = left.model.elements;
    const leftLatch = left.model.elements[left.model.elements.length - 1];
    expect(leftBaseFill.to[0]).toBe(16); // flush to the true east edge, not inset to 14
    expect(leftLidFill.to[0]).toBe(16);
    expect(leftLatch.to[0]).toBe(16);
    expect(left.model.elements.filter((el) => el.from[0] === 14 && el.to[0] === 15)).toHaveLength(0);
  });

  it('rotates a double-chest half to match a real non-north facing — regression test against a real bundled double chest (woodland_mansion/1x2_a9): facing=west pairs type=right at the lower Z with type=left at the higher Z, i.e. right\'s open side is south and left\'s is north', () => {
    const right = resolveHandAuthoredTemplate('trapped_chest', { facing: 'west', type: 'right' })!;
    const rightBaseFill = right.model.elements[0];
    expect(rightBaseFill.to[2]).toBe(16); // flush to the true south edge after rotation

    const left = resolveHandAuthoredTemplate('trapped_chest', { facing: 'west', type: 'left' })!;
    const leftBaseFill = left.model.elements[0];
    expect(leftBaseFill.from[2]).toBe(0); // flush to the true north edge after rotation
  });

  it('every element has all 6 faces defined, each referencing one of its model\'s own texture variables', () => {
    for (const key of Object.keys(HAND_AUTHORED_TEMPLATES)) {
      const { model } = resolveHandAuthoredTemplate(key)!;
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
    expect(resolveHandAuthoredTemplate('shulker_box')!.model.textures.main).toBe('shulker/shulker');
    expect(resolveHandAuthoredTemplate('black_shulker_box')!.model.textures.main).toBe('shulker/shulker_black');
  });

  it('includes all 16 bed colors, each a genuinely 2-block-long (depthUnits=32) structure with 14 elements', () => {
    const bedKeys = Object.keys(HAND_AUTHORED_TEMPLATES).filter((k) => k.endsWith('_bed'));
    expect(bedKeys).toHaveLength(16);
    expect(resolveHandAuthoredTemplate('red_bed')!.model.textures.main).toBe('bed/red');
    expect(resolveHandAuthoredTemplate('white_bed')!.model.textures.main).toBe('bed/white');
    expect(resolveHandAuthoredTemplate('red_bed')!.heightUnits).toBe(16);
    expect(resolveHandAuthoredTemplate('red_bed')!.depthUnits).toBe(32);

    // Pillow (element 1 — mattress and pillow are listed first, see bedModel's doc on why order
    // matters for resolveFallbackTexture.ts) is restricted away from stone — regression test for
    // real user feedback that the pillow's gray border was matching diorite/polished_diorite (a
    // real, Lab-closest match, but stone reads wrong for a fabric pillow) — and a follow-up round
    // clarifying the fix should drop only diorite, keeping both wool and concrete so the original
    // multi-shade gradient/pattern isn't flattened. Every bed color shares this restriction.
    for (const key of bedKeys) {
      const bed = resolveHandAuthoredTemplate(key)!;
      expect(bed.elementPaletteRestrictions?.[1]).toEqual([
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
        expect(bed.elementPaletteRestrictions?.[i]).toEqual(['minecraft:oak_planks', 'minecraft:oak_log', 'minecraft:stripped_oak_log']);
      }
      // The 7 seam-line elements (7-13) are restricted to the union of light oak (their 5
      // non-bottom faces) and a softer medium-brown pair (their bottom face only, via
      // stretchedBoxWithBottom) — round 6's fix for real user feedback that round 5's dark_oak-only
      // restriction both "spilled over" onto the outer side frame and read as "too dark/black".
      for (const i of [7, 8, 9, 10, 11, 12, 13]) {
        expect(bed.elementPaletteRestrictions?.[i]).toEqual([
          'minecraft:oak_planks',
          'minecraft:oak_log',
          'minecraft:stripped_oak_log',
          'minecraft:spruce_planks',
          'minecraft:stripped_spruce_log',
        ]);
      }
      // The mattress (0) is restricted to wool/concrete/terracotta of every dye — regression test
      // for real user feedback that large beds contained crimson_stem (its darker shading pixels
      // had matched wood at 32³+ while the blanket was unrestricted).
      const blanket = bed.elementPaletteRestrictions?.[0] ?? [];
      expect(blanket).toHaveLength(48); // 16 dyes x (wool, concrete, terracotta)
      expect(blanket).toContain('minecraft:red_concrete');
      expect(blanket.some((id) => /stem|planks|log|hyphae/.test(id))).toBe(false);
    }

    const { elements } = resolveHandAuthoredTemplate('red_bed')!.model;
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
    const { elements } = resolveHandAuthoredTemplate('red_bed')!.model;
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
    const { elements } = resolveHandAuthoredTemplate('red_bed')!.model;
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
      const { model } = resolveHandAuthoredTemplate(`${color}_bed`)!;
      const firstFace = Object.values(model.elements[0].faces)[0]!;
      const varName = firstFace.texture.slice(1);
      expect(model.textures[varName]).toBe(`bed/${color}`);
    }
  });

  it('bed: total height is 9 (5 wooden frame + 4 mattress — rebalanced from the original 3/6 split per real user feedback that legs read too short and the mattress too thick), with 4 corner legs, a full-footprint rail, a full-length blanket, and a pillow overlaid at the rear-top of the head section', () => {
    const { elements } = resolveHandAuthoredTemplate('red_bed')!.model;
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
    const { elements } = resolveHandAuthoredTemplate('red_bed')!.model;
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
    const { model, heightUnits, depthUnits, elementPaletteRestrictions } = resolveHandAuthoredTemplate('beacon')!;
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
    expect(resolveHandAuthoredTemplate('oak_sign')!.model.textures.main).toBe('signs/oak');
    expect(resolveHandAuthoredTemplate('oak_wall_sign')!.model.textures.main).toBe('signs/oak');
    expect(resolveHandAuthoredTemplate('oak_sign')!.model.elements).toEqual(resolveHandAuthoredTemplate('oak_wall_sign')!.model.elements);
    expect(resolveHandAuthoredTemplate('oak_sign')!.depthUnits).toBe(16);

    const { elements } = resolveHandAuthoredTemplate('warped_sign')!.model;
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
      const t = resolveHandAuthoredTemplate(name);
      expect(t, `${name} missing`).toBeDefined();
      expect(t!.model.textures.main).toBe(textureKey);
      expect(t!.model.elements).toHaveLength(1);
      expect(t!.model.elements[0].from).toEqual([4, 0, 4]);
      expect(t!.model.elements[0].to).toEqual([12, 8, 12]);
      expect(t!.heightUnits).toBe(16);
      expect(t!.depthUnits).toBe(16);
    }
    // Standing and wall variants share identical geometry (no rotation handling), same precedent
    // as sign/wall_sign.
    expect(resolveHandAuthoredTemplate('zombie_head')!.model.elements).toEqual(resolveHandAuthoredTemplate('zombie_wall_head')!.model.elements);
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
      expect(resolveHandAuthoredTemplate(name)!.elementPaletteRestrictions?.[0]).toEqual(grayscale);
    }
    // Every other head/skull is untouched — no evidence they had the same problem.
    for (const name of ['zombie_head', 'creeper_head', 'piglin_head', 'player_head']) {
      expect(resolveHandAuthoredTemplate(name)!.elementPaletteRestrictions).toBeUndefined();
    }
  });
});
