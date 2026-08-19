import { describe, expect, it } from 'vitest';
import { resolveModelFile } from './resolveModelFile';

function fakeModelFiles(files: Record<string, unknown>) {
  const map = new Map<string, () => Promise<Uint8Array>>();
  for (const [key, json] of Object.entries(files)) {
    map.set(key, async () => new TextEncoder().encode(JSON.stringify(json)));
  }
  return map;
}

describe('resolveModelFile', () => {
  it('returns a self-contained model directly, no parent lookup needed', async () => {
    const files = fakeModelFiles({
      standalone: { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }] },
    });
    const model = await resolveModelFile('standalone', files);
    expect(model.elements).toHaveLength(1);
  });

  it('follows one parent hop and merges the leaf textures over the parent ones, like real oak_fence_post -> fence_post', async () => {
    const files = fakeModelFiles({
      oak_fence_post: { parent: 'minecraft:block/fence_post', textures: { texture: 'minecraft:block/oak_planks' } },
      fence_post: {
        textures: { particle: '#texture' },
        elements: [
          {
            from: [6, 0, 6],
            to: [10, 16, 10],
            faces: { up: { uv: [6, 6, 10, 10], texture: '#texture' } },
          },
        ],
      },
    });
    const model = await resolveModelFile('oak_fence_post', files);
    expect(model.elements).toHaveLength(1);
    expect(model.elements[0].faces.top).toEqual({ uv: [6, 6, 10, 10], texture: '#texture' });
    expect(model.textures.texture).toBe('minecraft:block/oak_planks'); // leaf override
    expect(model.textures.particle).toBe('#texture'); // inherited from parent
  });

  it('follows two parent hops, with the leaf winning over both ancestors on a shared key', async () => {
    const files = fakeModelFiles({
      leaf: { parent: 'mid', textures: { color: 'leaf-value' } },
      mid: { parent: 'root', textures: { color: 'mid-value', extra: 'mid-extra' } },
      root: { textures: { color: 'root-value' }, elements: [{ from: [0, 0, 0], to: [1, 1, 1], faces: {} }] },
    });
    const model = await resolveModelFile('leaf', files);
    expect(model.textures.color).toBe('leaf-value'); // leaf beats mid and root
    expect(model.textures.extra).toBe('mid-extra'); // inherited from mid, not overridden by leaf
  });

  it('throws a clear error for a parent-only leaf whose parent is ALSO parent-only elsewhere in a cycle', async () => {
    const files = fakeModelFiles({
      a: { parent: 'b' },
      b: { parent: 'a' },
    });
    await expect(resolveModelFile('a', files)).rejects.toThrow(/cycle/i);
  });

  it('throws a clear error when the named model file is missing entirely', async () => {
    const files = fakeModelFiles({});
    await expect(resolveModelFile('nonexistent', files)).rejects.toThrow(/no block model found/i);
  });

  it('throws when a leaf in the chain has neither parent nor elements', async () => {
    const files = fakeModelFiles({ leaf: { parent: 'deadend' }, deadend: {} });
    await expect(resolveModelFile('leaf', files)).rejects.toThrow(/elements/i);
  });
});
