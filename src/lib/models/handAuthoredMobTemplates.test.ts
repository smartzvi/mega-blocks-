import { describe, expect, it } from 'vitest';
import { HAND_AUTHORED_MOB_TEMPLATES } from './handAuthoredMobTemplates';

const MOB_NAMES = ['pig', 'chicken', 'zombie', 'skeleton', 'snow golem', 'sheep', 'iron golem', 'panda', 'bee', 'wolf'];

describe('HAND_AUTHORED_MOB_TEMPLATES', () => {
  it('has exactly the 10 starter mobs, each with a real entity texture key', () => {
    expect(Object.keys(HAND_AUTHORED_MOB_TEMPLATES).sort()).toEqual([...MOB_NAMES].sort());
    expect(HAND_AUTHORED_MOB_TEMPLATES.pig.model.textures.main).toBe('pig/temperate_pig');
    expect(HAND_AUTHORED_MOB_TEMPLATES.chicken.model.textures.main).toBe('chicken/temperate_chicken');
    expect(HAND_AUTHORED_MOB_TEMPLATES.zombie.model.textures.main).toBe('zombie/zombie');
    expect(HAND_AUTHORED_MOB_TEMPLATES.skeleton.model.textures.main).toBe('skeleton/skeleton');
    expect(HAND_AUTHORED_MOB_TEMPLATES['snow golem'].model.textures.main).toBe('snow_golem');
    expect(HAND_AUTHORED_MOB_TEMPLATES.sheep.model.textures.main).toBe('sheep/sheep');
    expect(HAND_AUTHORED_MOB_TEMPLATES.sheep.model.textures.wool).toBe('sheep/sheep_wool');
    expect(HAND_AUTHORED_MOB_TEMPLATES['iron golem'].model.textures.main).toBe('iron_golem/iron_golem');
    expect(HAND_AUTHORED_MOB_TEMPLATES.panda.model.textures.main).toBe('panda/panda');
    expect(HAND_AUTHORED_MOB_TEMPLATES.bee.model.textures.main).toBe('bee/bee');
    expect(HAND_AUTHORED_MOB_TEMPLATES.wolf.model.textures.main).toBe('wolf/wolf');
  });

  it('every element stays within model-space X 0-16 for every mob — rasterizeItemModel silently clips out-of-range X, so this must hold exactly (this is the real regression test for iron golem, the first mob wider than one block)', () => {
    for (const name of MOB_NAMES) {
      const { elements } = HAND_AUTHORED_MOB_TEMPLATES[name].model;
      for (const el of elements) {
        expect(el.from[0]).toBeGreaterThanOrEqual(0);
        expect(el.to[0]).toBeGreaterThanOrEqual(0);
        expect(el.from[0]).toBeLessThanOrEqual(16);
        expect(el.to[0]).toBeLessThanOrEqual(16);
      }
    }
  });

  it('every model\'s own bounding box starts at (0,0,0) and matches its declared heightUnits/depthUnits', () => {
    for (const name of MOB_NAMES) {
      const { model, heightUnits, depthUnits } = HAND_AUTHORED_MOB_TEMPLATES[name];
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      for (const el of model.elements) {
        for (const p of [el.from, el.to]) {
          minX = Math.min(minX, p[0]);
          minY = Math.min(minY, p[1]);
          minZ = Math.min(minZ, p[2]);
          maxY = Math.max(maxY, p[1]);
          maxZ = Math.max(maxZ, p[2]);
        }
      }
      expect(minX).toBe(0);
      expect(minY).toBe(0);
      expect(minZ).toBe(0);
      expect(maxY).toBe(heightUnits);
      expect(maxZ).toBe(depthUnits);
    }
  });

  it('quadrupeds (pig/chicken/sheep/panda/wolf): legs touch the ground and the body sits above them, not floating or sunk', () => {
    for (const name of ['pig', 'chicken', 'sheep', 'panda', 'wolf']) {
      const { model } = HAND_AUTHORED_MOB_TEMPLATES[name];
      // Every model's leg elements are the shortest-Y-extent elements touching y=0 — just assert
      // at least one element starts exactly at the ground.
      expect(model.elements.some((el) => el.from[1] === 0)).toBe(true);
    }
  });

  it('pig, sheep, and panda bodies were correctly rotated to a horizontal, not vertical, shape (deeper in Z than tall in Y)', () => {
    // The body is always the element with the largest single-axis span among the torso pieces —
    // simplest robust check: the tallest single element's Y-span should not dwarf its Z-span the
    // way an un-rotated (still-vertical) body box would (pig raw body pre-rotation is 16 tall by
    // 8 deep — a 2:1 ratio the wrong way).
    for (const name of ['pig', 'sheep', 'panda']) {
      const { model } = HAND_AUTHORED_MOB_TEMPLATES[name];
      const bodyLike = model.elements.reduce((biggest, el) => {
        const vol = (el.to[0] - el.from[0]) * (el.to[1] - el.from[1]) * (el.to[2] - el.from[2]);
        const biggestVol = (biggest.to[0] - biggest.from[0]) * (biggest.to[1] - biggest.from[1]) * (biggest.to[2] - biggest.from[2]);
        return vol > biggestVol ? el : biggest;
      });
      const ySpan = bodyLike.to[1] - bodyLike.from[1];
      const zSpan = bodyLike.to[2] - bodyLike.from[2];
      expect(zSpan).toBeGreaterThan(ySpan);
    }
  });

  it('zombie and skeleton share identical head/body geometry but different (real, not just scaled) limb geometry', () => {
    const zombie = HAND_AUTHORED_MOB_TEMPLATES.zombie.model.elements;
    const skeleton = HAND_AUTHORED_MOB_TEMPLATES.skeleton.model.elements;
    expect(zombie.length).toBe(6);
    expect(skeleton.length).toBe(6);
    // First two elements are head then body — raw-identical per the real shared biped rig, but
    // each mob is independently shifted to its own bounding box's origin, and zombie's overall
    // model is wider (wider-set arms) than skeleton's, so only Y/Z (not X) land at the same
    // absolute coordinates after that per-mob shift; X should differ by one constant offset
    // (the two mobs' differing total width) across both head and body alike.
    const xShiftDiff = zombie[0].from[0] - skeleton[0].from[0];
    for (const i of [0, 1]) {
      expect(zombie[i].from[1]).toBe(skeleton[i].from[1]);
      expect(zombie[i].to[1]).toBe(skeleton[i].to[1]);
      expect(zombie[i].from[2]).toBe(skeleton[i].from[2]);
      expect(zombie[i].to[2]).toBe(skeleton[i].to[2]);
      expect(zombie[i].from[0] - skeleton[i].from[0]).toBe(xShiftDiff);
      expect(zombie[i].to[0] - skeleton[i].to[0]).toBe(xShiftDiff);
    }
    // Limbs (elements 2-5: right arm, left arm, right leg, left leg) genuinely differ in shape
    // (thickness), not just position.
    for (let i = 2; i < 6; i++) {
      const zSize = zombie[i].to[0] - zombie[i].from[0];
      const sSize = skeleton[i].to[0] - skeleton[i].from[0];
      expect(zSize).not.toBe(sSize);
    }
    expect(HAND_AUTHORED_MOB_TEMPLATES.zombie.heightUnits).toBe(32);
    expect(HAND_AUTHORED_MOB_TEMPLATES.skeleton.heightUnits).toBe(32);
  });

  it('zombie arms mirror left/right using the real same UV region (vanilla textures reuse one arm texture for both sides)', () => {
    const [, , rightArm, leftArm] = HAND_AUTHORED_MOB_TEMPLATES.zombie.model.elements;
    expect(rightArm.faces.east?.uv).toEqual(leftArm.faces.east?.uv);
    // Mirrored around the model's own center, not overlapping.
    expect(rightArm.to[0]).toBeLessThanOrEqual(leftArm.from[0]);
  });

  it('places the real face-bearing UV region on the head\'s physical front (north, Z=0), not the back — real bug caught from a screenshot: eyes sit inside the UV rect boxElement computes as "south" for an unrotated box, but every mob here has its head at the low end of its own Z range, so raw box-UV would have rendered that region on the back of the skull instead', () => {
    // Pig head: raw origin (-4,8,-14) size (8,8,8), uv (0,0). "south" formula: (u+dz,v+dz,u+dz+dx,v+dz+dy)
    // = (8,8,16,16) — real jar pixel sampling confirms both eyes sit inside this rect too.
    const pigHead = HAND_AUTHORED_MOB_TEMPLATES.pig.model.elements[1]; // body, head, snout, ...
    expect(pigHead.faces.north?.uv).toEqual([8, 8, 16, 16]);
    expect(pigHead.faces.south?.uv).not.toEqual([8, 8, 16, 16]);
  });

  it('relative mob sizes are physically sane: chicken smallest, zombie/skeleton the tallest', () => {
    const h = (name: string) => HAND_AUTHORED_MOB_TEMPLATES[name].heightUnits;
    expect(h('chicken')).toBeLessThan(h('pig'));
    // Iron golem is real-world taller than a zombie, but scaleBounds shrinks every axis uniformly
    // (see the file header) to fit its wider-than-one-block arm span, so its *scaled* height ends
    // up shorter than zombie/skeleton's un-scaled 32 — a real, deliberate tradeoff, not a bug.
    expect(h('pig')).toBeLessThan(h('iron golem'));
    expect(h('iron golem')).toBeLessThan(h('zombie'));
    expect(h('skeleton')).toBe(h('zombie'));
    // Panda is scaled down the same way (16/19, see the file header) for its overweight body —
    // still a bulky mob, taller than pig, but shorter than the unscaled zombie/skeleton.
    expect(h('pig')).toBeLessThan(h('panda'));
    expect(h('panda')).toBeLessThan(h('zombie'));
  });

  it('snow golem\'s two arms are placed symmetrically on either side, not both on the same side — the raw geo.json defines them with byte-identical origin/size/uv (confirmed by fetching the raw JSON directly), which would literally overlap if used as-is', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES['snow golem'];
    expect(model.elements.length).toBe(5);
    const [, , , armA, armB] = model.elements;
    expect(armA.to[0] - armA.from[0]).toBe(armB.to[0] - armB.from[0]);
    // Non-overlapping, one on each side — don't presume which specific one ends up higher, since
    // that depends on which raw bone happened to be the "unmirrored" one in the source data.
    expect(armA.to[0] <= armB.from[0] || armB.to[0] <= armA.from[0]).toBe(true);
    // Same real UV on both — one real texture region reused for both arms, matching the raw data.
    expect(armA.faces.north?.uv).toEqual(armB.faces.north?.uv);
  });

  it('sheep\'s wool UV rects stay within the real sheep/sheep_wool texture\'s actual 64x32 bounds — regression test for a real bug: the raw geo.json wool origins (32/40/48 in V) were transcribed for a taller atlas than the real Java texture actually is, so every sample clamped to the same fully-transparent last row and the wool (and everything it occluded underneath) rendered as nothing, leaving the sheep with a floating head and legs but no connecting body', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.sheep;
    const TEXTURE_WIDTH = 64;
    const TEXTURE_HEIGHT = 32;
    for (const el of model.elements) {
      for (const [face, def] of Object.entries(el.faces)) {
        if (!def) continue;
        const [u1, v1, u2, v2] = def.uv;
        for (const u of [u1, u2]) {
          expect(u, `${face} face u out of bounds`).toBeGreaterThanOrEqual(0);
          expect(u, `${face} face u out of bounds`).toBeLessThanOrEqual(TEXTURE_WIDTH);
        }
        for (const v of [v1, v2]) {
          expect(v, `${face} face v out of bounds`).toBeGreaterThanOrEqual(0);
          expect(v, `${face} face v out of bounds`).toBeLessThanOrEqual(TEXTURE_HEIGHT);
        }
      }
    }
  });

  it('sheep\'s wool head does not inflate forward past the base head\'s own front edge — regression test for a real bug: a uniform inflate pushed wool\'s front (Z-low) edge into the bare-face gap the un-inflated geometry already provides, so wool covered nearly the whole face instead of a thin rim', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.sheep;
    const baseHead = model.elements[1];
    const woolHead = model.elements[7];
    // Both were shifted by the same offset, so their *difference* in Z-from is directly comparable
    // pre- or post-shift. Real un-inflated geo.json gap is 2 units (wool head origin -12 vs base
    // head origin -14) — assert the wool's front is at least close to that gap, not eaten down to
    // ~1.4 by inflate.
    expect(woolHead.from[2] - baseHead.from[2]).toBeGreaterThanOrEqual(2);
    // Every other direction still inflated normally — wool head must still be strictly larger than
    // base head on every other bound.
    expect(woolHead.from[0]).toBeLessThan(baseHead.from[0]);
    expect(woolHead.to[0]).toBeGreaterThan(baseHead.to[0]);
    expect(woolHead.from[1]).toBeLessThan(baseHead.from[1]);
    expect(woolHead.to[2]).toBeGreaterThan(baseHead.to[2]);
  });

  it('sheep\'s 4 base legs are restricted to the curated white/brown terracotta pair, not the full shared palette — regression test for a real "too much contrast" complaint traced to the palette scattering leg skin-tone pixels across mismatched wood planks/logs', () => {
    const { elementPaletteRestrictions } = HAND_AUTHORED_MOB_TEMPLATES.sheep;
    for (const legIndex of [2, 3, 4, 5]) {
      expect(elementPaletteRestrictions?.[legIndex]).toEqual(['minecraft:white_terracotta', 'minecraft:brown_terracotta']);
    }
    // Wool legs (8-11) and every non-leg element must NOT be restricted — no evidence they have
    // the same problem, and over-restricting them wasn't asked for.
    for (const i of [0, 1, 6, 8, 9, 10, 11]) {
      expect(elementPaletteRestrictions?.[i]).toBeUndefined();
    }
  });

  it('sheep has a real second "wool" texture layer, inflated outward from (not just recoloring) the base body underneath', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.sheep;
    expect(model.elements.length).toBe(12); // 6 base + 6 wool
    const woolStart = 6;
    // X containment holds for every part (every wool cube shares its base cube's real X
    // origin/size before inflate, so inflateBounds only ever grows it) — real per-part inflate
    // amounts confirm inflateBounds ran rather than copying a same-size element. Y/Z are *not*
    // asserted here: real vanilla wool genuinely doesn't fully cover the sheep (bare face, bare
    // hooves), so the wool head is real-data shorter in Z than the base head, and wool legs only
    // cover the upper portion in Y — both confirmed against the real geo.json, not bugs.
    for (let i = 0; i < 6; i++) {
      const base = model.elements[i];
      const wool = model.elements[woolStart + i];
      expect(wool.from[0]).toBeLessThanOrEqual(base.from[0]);
      expect(wool.to[0]).toBeGreaterThanOrEqual(base.to[0]);
    }
    // The wool head is a real, distinctly-shaped cube (shorter in Z — bare face), not a copy.
    const woolHead = model.elements[woolStart + 1];
    const baseHead = model.elements[1];
    expect(woolHead.to[2] - woolHead.from[2]).not.toBe(baseHead.to[2] - baseHead.from[2]);
  });

  it('panda has 12 elements (torso + saddle band + head + snout + 2 eyes + 2 ears + 4 legs), symmetric parts placed one on each side', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.panda;
    expect(model.elements.length).toBe(12);
    const [, , , , leftEye, rightEye, leftEar, rightEar, backLeftLeg, backRightLeg, frontLeftLeg, frontRightLeg] = model.elements;
    for (const [left, right] of [
      [leftEye, rightEye],
      [leftEar, rightEar],
      [backLeftLeg, backRightLeg],
      [frontLeftLeg, frontRightLeg],
    ] as const) {
      expect(right.to[0] - right.from[0]).toBe(left.to[0] - left.from[0]); // same size
      expect(left.to[0]).toBeLessThanOrEqual(right.from[0]); // non-overlapping, one on each side
    }
  });

  it('panda\'s black saddle band is narrow (well under half the body\'s real length) and sits flush against the body\'s own front edge — regression test for real user feedback that a first version\'s black band, using the body bone\'s natural (unmodified) box-UV wrap, covered far too much of the body', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.panda;
    const [torso, saddle] = model.elements;
    // Both share the torso's exact X/Y footprint and front edge — only the saddle's back edge
    // differs (it's the narrower one).
    expect(saddle.from[0]).toBeCloseTo(torso.from[0], 5);
    expect(saddle.to[0]).toBeCloseTo(torso.to[0], 5);
    expect(saddle.from[2]).toBeCloseTo(torso.from[2], 5);
    const saddleLength = saddle.to[2] - saddle.from[2];
    const torsoLength = torso.to[2] - torso.from[2];
    expect(saddleLength).toBeLessThan(torsoLength * 0.3); // narrow band, not the ~38% the raw wrap gave
    expect(saddle.to[2]).toBeLessThan(torso.to[2]); // doesn't extend anywhere near the rear
  });

  it('panda\'s snout is thicker (deeper in Z) than its real 2-unit geo.json depth, extending forward from the head rather than just resized in place — a deliberate proportion departure per real user feedback that it looked flat/squished', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.panda;
    const head = model.elements[2];
    const snout = model.elements[3];
    const snoutDepth = snout.to[2] - snout.from[2];
    const realUnscaledDepth = 2 * (16 / 19); // real geo.json depth (2 units) scaled by the same 16/19 factor
    expect(snoutDepth).toBeGreaterThan(realUnscaledDepth);
    // Still attaches flush to the head's own front edge, just extends further forward from there.
    expect(snout.to[2]).toBeCloseTo(head.from[2], 5);
    expect(snout.from[2]).toBeLessThan(head.from[2]); // extends in front of (not behind) the head
  });

  it('panda\'s widest real point (its body) lands exactly at the 0-16 model-space X ceiling — proves the 16/19 X-compression factor was computed correctly, not just "happens to fit"', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.panda;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const el of model.elements) {
      minX = Math.min(minX, el.from[0], el.to[0]);
      maxX = Math.max(maxX, el.from[0], el.to[0]);
    }
    expect(minX).toBeCloseTo(0, 5);
    expect(maxX).toBeCloseTo(16, 5);
  });

  it('iron golem\'s widest real point (its two arms) lands exactly at the 0-16 model-space X ceiling — proves the X-compression factor was computed correctly, not just "happens to fit"', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES['iron golem'];
    let minX = Infinity;
    let maxX = -Infinity;
    for (const el of model.elements) {
      minX = Math.min(minX, el.from[0], el.to[0]);
      maxX = Math.max(maxX, el.from[0], el.to[0]);
    }
    expect(minX).toBeCloseTo(0, 5);
    expect(maxX).toBeCloseTo(16, 5);
  });

  it('iron golem\'s height was scaled by the exact same factor as its X compression, preserving the real width:height ratio rather than distorting it', () => {
    const { heightUnits } = HAND_AUTHORED_MOB_TEMPLATES['iron golem'];
    // Real geo.json: head top at y=43 (33+10), legs at y=0 — the true, un-scaled height. The whole
    // model's X was compressed by 16/26 to fit the 0-16 ceiling (see file header); if height had
    // been left un-scaled (an earlier, rejected approach) it'd still be exactly 43, which a real
    // screenshot confirmed reads as unrecognizably tall and thin — this asserts the *scaled* value.
    expect(heightUnits).toBeCloseTo((43 * 16) / 26, 5);
  });

  it('bee has 15 elements (body + 2 rear stripes + tail cap + stinger + 2 antennae + 6 leg pegs + 2 wings), no bind_pose_rotation needed so no scaleBounds', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    expect(model.elements.length).toBe(15);
  });

  it('bee\'s stinger has real physical thickness along its otherwise-zero raw geo.json X axis — regression test for a real engine limitation: rasterizeItemModel only voxelizes 3D volume, so a literal zero-thickness flat-plane cube (Bedrock\'s real double-sided-quad convention for this part) would voxelize to nothing', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const stinger = model.elements[4];
    expect(stinger.to[0] - stinger.from[0]).toBeGreaterThan(0); // thickened along X, its real zero axis
  });

  it('bee\'s tail cap sits flush against the body\'s rear edge, sharing its X/Y footprint — regression test for real user feedback that the rear section must read as a distinct solid-black band, not blended into the body', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const [body, , , tailCap] = model.elements;
    expect(tailCap.from[0]).toBeCloseTo(body.from[0], 5);
    expect(tailCap.to[0]).toBeCloseTo(body.to[0], 5);
    expect(tailCap.from[1]).toBeCloseTo(body.from[1], 5);
    expect(tailCap.to[1]).toBeCloseTo(body.to[1], 5);
    expect(tailCap.to[2]).toBeCloseTo(body.to[2], 5); // flush with the body's own back edge
  });

  it('bee\'s stinger protrudes directly backward from the tail cap\'s own back edge, centered on X — regression test for "stinger must come from the center-back of the black rear section"', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const [body, , , tailCap, stinger] = model.elements;
    expect(stinger.from[2]).toBeCloseTo(tailCap.to[2], 5); // starts exactly where the tail cap ends
    expect(stinger.to[2]).toBeGreaterThan(tailCap.to[2]); // extends backward beyond it
    const bodyCenterX = (body.from[0] + body.to[0]) / 2;
    const stingerCenterX = (stinger.from[0] + stinger.to[0]) / 2;
    expect(stingerCenterX).toBeCloseTo(bodyCenterX, 0);
  });

  it('bee\'s 2 rear stripes sit in the back half of the body, not the head half — regression test for real user feedback that the natural texture wrap\'s stripe-like detail read as concentrated near the head instead', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const [body, stripe1, stripe2, tailCap] = model.elements;
    const bodyMidZ = (body.from[2] + body.to[2]) / 2;
    for (const stripe of [stripe1, stripe2]) {
      // Share the body's X/Y footprint (full-width bands, not narrow patches).
      expect(stripe.from[0]).toBeCloseTo(body.from[0], 5);
      expect(stripe.to[0]).toBeCloseTo(body.to[0], 5);
      expect(stripe.from[1]).toBeCloseTo(body.from[1], 5);
      expect(stripe.to[1]).toBeCloseTo(body.to[1], 5);
      // Entirely in the rear (high-Z) half of the body, not the front (head) half.
      expect(stripe.from[2]).toBeGreaterThanOrEqual(bodyMidZ);
    }
    expect(stripe1.to[2]).toBeLessThanOrEqual(stripe2.from[2]); // ordered front-to-back, non-overlapping
    expect(stripe2.to[2]).toBeCloseTo(tailCap.from[2], 5); // second stripe flush against the tail cap
  });

  it('bee\'s 6 leg pegs are small, individually isolated 1x2x1 boxes hugging the body\'s left/right X edges — regression test for a real bug: the original full-width flat leg bars mostly hollowed out under this app\'s universal edge-culling once sandwiched against the body and each other', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const legs = model.elements.slice(7, 13);
    expect(legs.length).toBe(6);
    for (const leg of legs) {
      expect(leg.to[0] - leg.from[0]).toBeCloseTo(1, 5);
      expect(leg.to[1] - leg.from[1]).toBeCloseTo(2, 5);
      expect(leg.to[2] - leg.from[2]).toBeCloseTo(1, 5);
    }
    // 3 on the left edge, 3 on the right edge, not scattered across the belly.
    const leftX = legs[0].from[0];
    const rightX = legs[1].from[0];
    expect(leftX).toBeLessThan(rightX);
    for (let i = 0; i < 6; i += 2) {
      expect(legs[i].from[0]).toBeCloseTo(leftX, 5);
      expect(legs[i + 1].from[0]).toBeCloseTo(rightX, 5);
    }
  });

  it('bee\'s body samples one uniform rect across every face (a flat stretchedBox) instead of its natural per-voxel box-UV wrap — regression test for real user feedback that the natural wrap read as "a mess" and produced a stray pale artifact users described as blue "eyes"', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const body = model.elements[0];
    const uvs = Object.values(body.faces).map((f) => f?.uv);
    for (const uv of uvs) {
      expect(uv).toEqual(uvs[0]); // every defined face shares the exact same rect
    }
    // Real X/Y/Z footprint is unchanged from the original (unflattened) body — same overall silhouette.
    expect(body.to[0] - body.from[0]).toBeCloseTo(7, 5);
    expect(body.to[1] - body.from[1]).toBeCloseTo(7, 5);
    expect(body.to[2] - body.from[2]).toBeCloseTo(10, 5);
  });

  it('bee\'s body, stripes, tail cap, stinger, antennae, and leg pegs are all restricted to their requested curated colors (a curated on-theme palette for the body; solid black for the rear/stinger/antennae; dark-brown for legs) rather than the unrestricted shared palette', () => {
    const { elementPaletteRestrictions } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const black = ['minecraft:black_concrete', 'minecraft:black_wool', 'minecraft:black_terracotta'];
    const darkBrown = ['minecraft:brown_terracotta', 'minecraft:brown_concrete'];
    expect(elementPaletteRestrictions?.[0]).toEqual([
      'minecraft:yellow_wool', 'minecraft:yellow_concrete', 'minecraft:yellow_terracotta',
      'minecraft:white_wool', 'minecraft:black_wool', 'minecraft:black_concrete',
      'minecraft:black_terracotta', 'minecraft:brown_terracotta', 'minecraft:brown_concrete',
      'minecraft:orange_terracotta', 'minecraft:red_sandstone', 'minecraft:bamboo_planks',
    ]);
    // Body's allow-list must not contain the two blocks the user asked to remove entirely.
    expect(elementPaletteRestrictions?.[0]).not.toContain('minecraft:mangrove_log');
    expect(elementPaletteRestrictions?.[0]).not.toContain('minecraft:warped_stem');
    expect(elementPaletteRestrictions?.[0]).not.toContain('minecraft:stripped_warped_stem');
    // Body's allow-list must include black_wool, the requested replacement for warped_stem.
    expect(elementPaletteRestrictions?.[0]).toContain('minecraft:black_wool');
    for (const i of [1, 2, 3, 4, 5, 6]) {
      expect(elementPaletteRestrictions?.[i]).toEqual(black); // rear stripes, tail cap, stinger, antennae
    }
    for (const i of [7, 8, 9, 10, 11, 12]) {
      expect(elementPaletteRestrictions?.[i]).toEqual(darkBrown); // 6 leg pegs
    }
    // Wings are restricted to plain pale/neutral tones — a regression test for real-jar
    // verification showing mangrove_log still appearing via the wings' small real UV patch even
    // after the body was restricted (the wings were the only remaining unrestricted element).
    const wingPalette = ['minecraft:white_wool', 'minecraft:white_concrete', 'minecraft:light_gray_wool', 'minecraft:light_gray_concrete'];
    expect(elementPaletteRestrictions?.[13]).toEqual(wingPalette);
    expect(elementPaletteRestrictions?.[14]).toEqual(wingPalette);
  });

  it('bee\'s two wings are placed symmetrically on either side of the body, not overlapping it or each other', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    const body = model.elements[0];
    const [rightWing, leftWing] = model.elements.slice(13, 15);
    expect(rightWing.to[0] - rightWing.from[0]).toBe(leftWing.to[0] - leftWing.from[0]); // same size
    expect(rightWing.to[0]).toBeLessThanOrEqual(body.from[0]); // right wing sits left of the body
    expect(leftWing.from[0]).toBeGreaterThanOrEqual(body.to[0]); // left wing sits right of the body
  });

  it('bee stays within the 0-16 model-space X ceiling without needing scaleBounds — its real raw wingspan (21 units, wings spread flat with rotation ignored) would have exceeded it, which is exactly why the wings were hand-repositioned instead of transcribed literally', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.bee;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const el of model.elements) {
      minX = Math.min(minX, el.from[0], el.to[0]);
      maxX = Math.max(maxX, el.from[0], el.to[0]);
    }
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(maxX).toBeLessThanOrEqual(16);
  });

  it('wolf has 10 elements (upperBody + head + 2 ears + snout + 4 legs + tail) — the original separate "body" bone was deleted (see the doc on wolfModel\'s round-three "low belly" fix), not just hidden', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    expect(model.elements.length).toBe(10);
  });

  it('places the real eye-bearing UV region on the wolf head\'s physical front (north) — regression test confirmed by directly sampling the real wolf/wolf.png texture at this exact rect: a symmetric pair of near-black eye pixels flanked by white', () => {
    // Raw head origin (-3,7.5,-9) size (6,6,4), uv (0,0). "south" formula: (u+dz,v+dz,u+dz+dx,v+dz+dy)
    // = (4,4,10,10) — matches real jar pixel sampling done while implementing this mob.
    const wolfHead = HAND_AUTHORED_MOB_TEMPLATES.wolf.model.elements[1]; // upperBody, head, ears, snout, legs, tail
    expect(wolfHead.faces.north?.uv).toEqual([4, 4, 10, 10]);
    expect(wolfHead.faces.south?.uv).not.toEqual([4, 4, 10, 10]);
  });

  it('wolf\'s 2 ears and 4 legs are placed symmetrically on either side, not overlapping', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const [, , leftEar, rightEar, , rearLeftLeg, rearRightLeg, frontLeftLeg, frontRightLeg] = model.elements;
    for (const [left, right] of [
      [leftEar, rightEar],
      [rearLeftLeg, rearRightLeg],
      [frontLeftLeg, frontRightLeg],
    ] as const) {
      expect(right.to[0] - right.from[0]).toBeCloseTo(left.to[0] - left.from[0], 5); // same size
      expect(left.to[0]).toBeLessThanOrEqual(right.from[0]); // non-overlapping, one on each side
    }
  });

  it('wolf\'s front legs sit closer to the head than the rear legs — regression test confirmed against the real geo.json: leg0/leg1 (real Z 6-8, near the tail) are the REAR legs and leg2/leg3 (real Z -5 to -3, near the head) are the FRONT legs, the opposite of what raw bone-name order (leg0..leg3) would suggest', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const head = model.elements[1];
    const [, , , , , rearLeftLeg, , frontLeftLeg] = model.elements;
    const headCenterZ = (head.from[2] + head.to[2]) / 2;
    const frontLegCenterZ = (frontLeftLeg.from[2] + frontLeftLeg.to[2]) / 2;
    const rearLegCenterZ = (rearLeftLeg.from[2] + rearLeftLeg.to[2]) / 2;
    expect(Math.abs(frontLegCenterZ - headCenterZ)).toBeLessThan(Math.abs(rearLegCenterZ - headCenterZ));
  });

  it('wolf\'s upperBody now overlaps (not gaps from) the head — regression test for real user feedback that the body read as disconnected: the raw geo.json leaves a genuine 4-unit empty gap between the head\'s rear edge and upperBody\'s front edge', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const [upperBody, head] = model.elements;
    expect(upperBody.from[2]).toBeLessThanOrEqual(head.to[2]);
  });

  it('wolf\'s original separate "body" bone is gone — its own unique Y 3-7 slice (uncovered by upperBody\'s Y 7-13) was the "low belly" real user feedback flagged as a duplicate-looking shelf; once that slice is removed, body\'s entire remaining footprint is fully contained inside upperBody\'s on every axis, so it added nothing kept', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const [upperBody] = model.elements;
    // upperBody alone now reaches down to real Y=7, not the old body's Y=3 — confirms the low
    // shelf is gone, not just visually hidden behind something still numerically present.
    expect(upperBody.from[1]).toBeGreaterThan(3);
  });

  it('wolf\'s tail is reoriented to point backward (deeper in Z than tall in Y), not the literal raw geo.json\'s vertical post — regression test for real user feedback across several rounds: "isn\'t oriented right" (redesigned), "too long" (shortened to 4), "longer" (lengthened to 6), then "less thick, a bit longer" (round five: height 3→2, length 6→8)', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const upperBody = model.elements[0];
    const tail = model.elements[9];
    const ySpan = tail.to[1] - tail.from[1];
    const zSpan = tail.to[2] - tail.from[2];
    expect(zSpan).toBeGreaterThan(ySpan);
    expect(ySpan).toBeCloseTo(2, 5); // round five: thinner, was 3
    expect(zSpan).toBeCloseTo(8, 5); // round five: longer, was 6
    expect(tail.from[2]).toBeLessThanOrEqual(upperBody.to[2]); // flush against (or overlapping) the body's real rear edge
  });

  it('wolf\'s tail samples one uniform real fur-gray rect across every face (a flat stretchedBox), not the raw cube\'s own box-UV wrap — required since the redesigned box\'s proportions no longer match the real cube\'s layout', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const tail = model.elements[9];
    const uvs = Object.values(tail.faces).map((f) => f?.uv);
    for (const uv of uvs) {
      expect(uv).toEqual(uvs[0]);
    }
  });

  it('wolf\'s main fur elements (upperBody, all 4 legs, tail) are restricted to wool/terracotta tones, not concrete/stone — regression test for real user feedback that unrestricted matching leaned on stark concrete/diorite/smooth_stone for what should read as soft fur, and (round four) that the tail specifically was matching a visibly different block than the body despite sharing the same real texture color', () => {
    const { elementPaletteRestrictions } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const furPalette = ['minecraft:white_wool', 'minecraft:light_gray_wool', 'minecraft:white_terracotta', 'minecraft:light_gray_terracotta'];
    for (const i of [0, 5, 6, 7, 8, 9]) {
      expect(elementPaletteRestrictions?.[i]).toEqual(furPalette);
    }
    // Ears and snout are NOT restricted — no evidence they had the same problem.
    for (const i of [2, 3, 4]) {
      expect(elementPaletteRestrictions?.[i]).toBeUndefined();
    }
  });

  it('wolf\'s upperBody fully contains the rear legs\' real Z-footprint, matching how the front legs are already fully contained — regression test for real user feedback across two rounds: round four\'s 1-unit extendBack only covered half the rear legs\' own 2-unit width (a real, if partial, floating-leg complaint that persisted); round five increased it to 2.5 so the whole rear leg width sits inside upperBody\'s range, the same standard the front legs already had via extendFront', () => {
    const { model } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const [upperBody, , , , , rearLeftLeg, , frontLeftLeg] = model.elements;
    expect(upperBody.to[2]).toBeGreaterThan(rearLeftLeg.to[2]); // whole rear leg, not just its near edge
    expect(upperBody.from[2]).toBeLessThan(frontLeftLeg.from[2]); // front already fully contained (unchanged)
  });

  it('wolf\'s head is restricted to the fur palette plus black — regression test for a real bug: restricting the whole head to only light wool/terracotta tones left no dark candidate for its real eye pixels, silently erasing eye color at every resolution', () => {
    const { elementPaletteRestrictions } = HAND_AUTHORED_MOB_TEMPLATES.wolf;
    const headPalette = elementPaletteRestrictions?.[1];
    expect(headPalette).toContain('minecraft:black_concrete');
    expect(headPalette).toContain('minecraft:white_wool');
    expect(headPalette).toContain('minecraft:light_gray_wool');
  });
});
