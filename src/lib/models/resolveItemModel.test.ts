import { describe, expect, it } from 'vitest';
import { resolveItemModel } from './resolveItemModel';

function fakeFiles(files: Record<string, unknown>) {
  const map = new Map<string, () => Promise<Uint8Array>>();
  for (const [key, json] of Object.entries(files)) {
    map.set(key, async () => new TextEncoder().encode(JSON.stringify(json)));
  }
  return map;
}

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

    // "facing=east" sorts first alphabetically among the available keys -> y: 90 applied.
    const resolved = await resolveItemModel('ladder', blockStateFiles, modelFiles);
    expect(resolved.model.elements[0].from).toEqual([15.2, 0, 0]);
    expect(resolved.model.elements[0].to).toEqual([15.2, 16, 16]);
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
