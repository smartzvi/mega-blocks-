import { describe, expect, it } from 'vitest';
import { resolveItemModel } from './resolveItemModel';

function fakeFiles(files: Record<string, unknown>) {
  const map = new Map<string, () => Promise<Uint8Array>>();
  for (const [key, json] of Object.entries(files)) {
    map.set(key, async () => new TextEncoder().encode(JSON.stringify(json)));
  }
  return map;
}

describe('resolveItemModel — redstone wire', () => {
  // Trimmed slice of the real redstone_wire.json: every part is conditional.
  const wireFiles = () => ({
    blockStates: fakeFiles({
      redstone_wire: {
        multipart: [
          { apply: { model: 'minecraft:block/dot' }, when: { OR: [{ east: 'none', north: 'none', south: 'none', west: 'none' }, { east: 'side|up', north: 'side|up' }] } },
          { apply: { model: 'minecraft:block/side' }, when: { north: 'side|up' } },
          { apply: { model: 'minecraft:block/side', y: 90 }, when: { east: 'side|up' } },
          { apply: { model: 'minecraft:block/up' }, when: { north: 'up' } },
        ],
      },
    }),
    models: fakeFiles({
      dot: { textures: { line: 'minecraft:block/redstone_dust_dot' }, elements: [{ from: [0, 0.25, 0], to: [16, 0.25, 16], faces: { up: { uv: [0, 0, 16, 16], texture: '#line' } } }] },
      side: { textures: { line: 'minecraft:block/redstone_dust_line0' }, elements: [{ from: [0, 0.25, 0], to: [16, 0.25, 8], faces: { up: { uv: [0, 0, 16, 8], texture: '#line' } } }] },
      up: { textures: { line: 'minecraft:block/redstone_dust_line0' }, elements: [{ from: [0, 0, 0.25], to: [16, 16, 0.25], faces: { south: { uv: [0, 0, 16, 16], texture: '#line' } } }] },
    }),
  });

  it('with no properties (item mode) resolves a flat four-way cross, not every part including the vertical climb pieces', async () => {
    const { blockStates, models } = wireFiles();
    const resolved = await resolveItemModel('redstone_wire', blockStates, models);
    // dot (adjacent sides connect) + north arm + east arm; the `up` climb piece is NOT included
    expect(resolved.model.elements).toHaveLength(3);
    const climbs = resolved.model.elements.filter((el) => el.to[1] - el.from[1] > 1);
    expect(climbs).toHaveLength(0);
  });

  it('with real properties, honors them instead of the item-mode default', async () => {
    const { blockStates, models } = wireFiles();
    const resolved = await resolveItemModel('redstone_wire', blockStates, models, { north: 'up', east: 'none', south: 'none', west: 'none' });
    expect(resolved.model.elements.some((el) => el.to[1] - el.from[1] > 1)).toBe(true); // the climb piece
  });
});

describe('resolveItemModel — iron bars', () => {
  // Structure of the real template_bars_side.json: a flat pane, a volumetric one-face "edge cap"
  // box, and flat top/bottom rims.
  const barsFiles = () => ({
    blockStates: fakeFiles({
      iron_bars: { multipart: [{ apply: { model: 'minecraft:block/iron_bars_post_ends' } }, { when: { north: 'true' }, apply: { model: 'minecraft:block/iron_bars_side' } }] },
    }),
    models: fakeFiles({
      iron_bars_post_ends: {
        textures: { bars: 'minecraft:block/iron_bars' },
        elements: [{ from: [7, 0.001, 7], to: [9, 0.001, 9], faces: { up: { uv: [7, 7, 9, 9], texture: '#bars' } } }],
      },
      iron_bars_side: {
        textures: { bars: 'minecraft:block/iron_bars' },
        elements: [
          { from: [8, 0, 0], to: [8, 16, 8], faces: { west: { uv: [16, 0, 8, 16], texture: '#bars' }, east: { uv: [8, 0, 16, 16], texture: '#bars' } } },
          { from: [7, 0, 0], to: [9, 16, 7], faces: { north: { uv: [7, 0, 9, 16], texture: '#bars' } } },
          { from: [7, 0.001, 0], to: [9, 0.001, 7], faces: { up: { uv: [7, 0, 9, 7], texture: '#bars' } } },
        ],
      },
    }),
  });

  it('drops the one-face volumetric edge-cap box but keeps the flat pane and rim decals, so the bars stay see-through', async () => {
    const { blockStates, models } = barsFiles();
    const resolved = await resolveItemModel('iron_bars', blockStates, models, { north: 'true' });
    const boxes = resolved.model.elements.filter((el) => el.to.every((v, i) => Math.abs(v - el.from[i]) > 0.01));
    expect(boxes).toHaveLength(0); // no solid volumes left
    expect(resolved.model.elements).toHaveLength(3); // post rim + pane + side rim
  });

  it('leaves non-bars models with partial volumetric boxes untouched', async () => {
    const blockStates = fakeFiles({ cactus_like: { variants: { '': { model: 'minecraft:block/cactus_like' } } } });
    const models = fakeFiles({
      cactus_like: { textures: { t: 'minecraft:block/cactus_side' }, elements: [{ from: [1, 0, 1], to: [15, 16, 15], faces: { up: { uv: [0, 0, 16, 16], texture: '#t' } } }] },
    });
    const resolved = await resolveItemModel('cactus_like', blockStates, models);
    expect(resolved.model.elements).toHaveLength(1);
  });
});

describe('resolveItemModel', () => {
  it('resolves oak_fence end-to-end: multipart -> unconditional post -> parent chain -> merged texture', async () => {
    const blockStateFiles = fakeFiles({
      oak_fence: {
        multipart: [
          { apply: { model: 'minecraft:block/oak_fence_post' } },
          { when: { north: 'true' }, apply: { model: 'minecraft:block/oak_fence_side' } },
        ],
      },
    });
    const modelFiles = fakeFiles({
      oak_fence_post: { parent: 'minecraft:block/fence_post', textures: { texture: 'minecraft:block/oak_planks' } },
      fence_post: {
        textures: { particle: '#texture' },
        elements: [{ from: [6, 0, 6], to: [10, 16, 10], faces: { up: { uv: [6, 6, 10, 10], texture: '#texture' } } }],
      },
    });

    const resolved = await resolveItemModel('oak_fence', blockStateFiles, modelFiles);
    expect(resolved.heightUnits).toBe(16);
    expect(resolved.model.elements).toHaveLength(1); // only the unconditional post, not the conditional side
    expect(resolved.model.elements[0].from).toEqual([6, 0, 6]);
    expect(resolved.model.textures.texture).toBe('minecraft:block/oak_planks');
  });

  it('applies the variant y rotation end-to-end when facing=north is absent, like a facing-only ladder', async () => {
    const blockStateFiles = fakeFiles({
      ladder: {
        variants: {
          'facing=east': { model: 'minecraft:block/ladder', y: 90 },
          'facing=south': { model: 'minecraft:block/ladder', y: 180 },
          'facing=west': { model: 'minecraft:block/ladder', y: 270 },
        },
      },
    });
    const modelFiles = fakeFiles({
      ladder: {
        textures: { texture: 'block/ladder' },
        elements: [
          {
            from: [0, 0, 15.2],
            to: [16, 16, 15.2],
            faces: { north: { uv: [0, 0, 16, 16], texture: '#texture' } },
          },
        ],
      },
    });

    // "facing=east" sorts first alphabetically among the available keys -> y: 90 applied. Real
    // facing=east ladders mount on the block's WEST wall (confirmed real-game behavior), so this
    // plane lands near x=0, not x=16.
    const resolved = await resolveItemModel('ladder', blockStateFiles, modelFiles);
    expect(resolved.model.elements[0].from[0]).toBeCloseTo(0.8);
    expect(resolved.model.elements[0].from[1]).toBe(0);
    expect(resolved.model.elements[0].from[2]).toBe(0);
    expect(resolved.model.elements[0].to[0]).toBeCloseTo(0.8);
    expect(resolved.model.elements[0].to[1]).toBe(16);
    expect(resolved.model.elements[0].to[2]).toBe(16);
    expect(resolved.model.elements[0].faces.east).toBeDefined(); // north relabeled to east by the 90° rotation
    expect(resolved.model.elements[0].faces.north).toBeUndefined();
  });

  it('resolves a single "" variant with multiple self-contained elements and merges textures, like cauldron', async () => {
    const blockStateFiles = fakeFiles({ cauldron: { variants: { '': { model: 'minecraft:block/cauldron' } } } });
    const modelFiles = fakeFiles({
      cauldron: {
        textures: { top: 'block/cauldron_top', side: 'block/cauldron_side' },
        elements: [
          { from: [0, 3, 0], to: [2, 16, 16], faces: { up: { texture: '#top' } } },
          { from: [2, 3, 2], to: [14, 4, 14], faces: {} },
        ],
      },
    });

    const resolved = await resolveItemModel('cauldron', blockStateFiles, modelFiles);
    expect(resolved.heightUnits).toBe(16);
    expect(resolved.model.elements).toHaveLength(2);
    expect(resolved.model.textures.top).toBe('block/cauldron_top');
  });

  it('throws a clear error when the blockstate is missing entirely', async () => {
    await expect(resolveItemModel('nonexistent', fakeFiles({}), fakeFiles({}))).rejects.toThrow(/no blockstate found/i);
  });

  it('combines a real two-part door (half=lower/upper) into one 32-unit-tall model, shifting the upper half by 16', async () => {
    // Mirrors the real oak_door.json / oak_door_bottom_left.json / oak_door_top_left.json shapes
    // exactly: each half is its own parent-referencing model, each defining BOTH "bottom" and
    // "top" texture variables (as vanilla's real files do), pointing at the respective real pngs.
    const blockStateFiles = fakeFiles({
      oak_door: {
        variants: {
          'facing=north,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left' },
          'facing=north,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left' },
        },
      },
    });
    const modelFiles = fakeFiles({
      oak_door_bottom_left: {
        parent: 'minecraft:block/door_bottom_left',
        textures: { bottom: 'minecraft:block/oak_door_bottom', top: 'minecraft:block/oak_door_top' },
      },
      oak_door_top_left: {
        parent: 'minecraft:block/door_top_left',
        textures: { bottom: 'minecraft:block/oak_door_bottom', top: 'minecraft:block/oak_door_top' },
      },
      door_bottom_left: {
        textures: { particle: '#bottom' },
        elements: [
          {
            from: [0, 0, 0],
            to: [3, 16, 16],
            faces: {
              north: { uv: [3, 0, 0, 16], texture: '#bottom' },
              south: { uv: [0, 0, 3, 16], texture: '#bottom' },
            },
          },
        ],
      },
      door_top_left: {
        textures: { particle: '#top' },
        elements: [
          {
            from: [0, 0, 0],
            to: [3, 16, 16],
            faces: {
              north: { uv: [3, 0, 0, 16], texture: '#top' },
              south: { uv: [0, 0, 3, 16], texture: '#top' },
            },
          },
        ],
      },
    });

    const resolved = await resolveItemModel('oak_door', blockStateFiles, modelFiles);
    expect(resolved.heightUnits).toBe(32);
    expect(resolved.model.elements).toHaveLength(2);

    const [lowerEl, upperEl] = resolved.model.elements;
    expect(lowerEl.from).toEqual([0, 0, 0]);
    expect(lowerEl.to).toEqual([3, 16, 16]);
    expect(upperEl.from).toEqual([0, 16, 0]); // shifted up by 16
    expect(upperEl.to).toEqual([3, 32, 16]);

    // Each half resolves its own texture correctly (namespaced, so "top"/"bottom" from one half
    // never collides with the other's).
    const lowerTexRef = lowerEl.faces.north!.texture;
    const upperTexRef = upperEl.faces.north!.texture;
    expect(resolved.model.textures[lowerTexRef.slice(1)]).toBe('minecraft:block/oak_door_bottom');
    expect(resolved.model.textures[upperTexRef.slice(1)]).toBe('minecraft:block/oak_door_top');
  });

  it('does not treat an ordinary block with an unrelated variant property as two-part', async () => {
    const blockStateFiles = fakeFiles({ cauldron: { variants: { '': { model: 'minecraft:block/cauldron' } } } });
    const modelFiles = fakeFiles({
      cauldron: { textures: {}, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }] },
    });
    const resolved = await resolveItemModel('cauldron', blockStateFiles, modelFiles);
    expect(resolved.heightUnits).toBe(16);
  });

  it('resolves just one half as an ordinary single-block model when given real properties, instead of stitching both halves together', async () => {
    // Structure mode's case: a real door blockstate, but this specific structure cell IS the
    // upper half at a specific position — it should render as its own genuine 16-tall model using
    // its own real texture, not get combined with a (non-existent, at this position) lower half.
    const blockStateFiles = fakeFiles({
      oak_door: {
        variants: {
          'facing=north,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left' },
          'facing=north,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left' },
        },
      },
    });
    const modelFiles = fakeFiles({
      oak_door_bottom_left: { textures: { bottom: 'minecraft:block/oak_door_bottom' }, elements: [{ from: [0, 0, 0], to: [3, 16, 16], faces: {} }] },
      oak_door_top_left: { textures: { top: 'minecraft:block/oak_door_top' }, elements: [{ from: [0, 0, 0], to: [3, 16, 16], faces: {} }] },
    });

    const resolved = await resolveItemModel('oak_door', blockStateFiles, modelFiles, {
      facing: 'north',
      half: 'upper',
      hinge: 'left',
      open: 'false',
    });
    expect(resolved.heightUnits).toBe(16);
    expect(resolved.depthUnits).toBe(16);
    expect(resolved.model.elements).toHaveLength(1); // just this half, not stitched with the other
    expect(resolved.model.textures.top).toBe('minecraft:block/oak_door_top');
  });
});
