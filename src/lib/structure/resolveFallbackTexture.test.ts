import { describe, expect, it } from 'vitest';
import { resolveFallbackTextureKey } from './resolveFallbackTexture';

function fakeFiles(files: Record<string, unknown>) {
  const map = new Map<string, () => Promise<Uint8Array>>();
  for (const [key, json] of Object.entries(files)) {
    map.set(key, async () => new TextEncoder().encode(JSON.stringify(json)));
  }
  return map;
}

describe('resolveFallbackTextureKey', () => {
  it("finds the real texture a block's model references, not a filename guessed from the block name", async () => {
    const blockStateFiles = fakeFiles({
      oak_stairs: { variants: { '': { model: 'minecraft:block/oak_stairs' } } },
    });
    const modelFiles = fakeFiles({
      oak_stairs: {
        textures: { texture: 'minecraft:block/oak_planks' },
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#texture' } } }],
      },
    });

    const key = await resolveFallbackTextureKey('minecraft:oak_stairs', blockStateFiles, modelFiles);
    expect(key).toBe('oak_planks');
  });

  it('resolves a hand-authored block (chest) via its known template, without needing blockstate/model files', async () => {
    const key = await resolveFallbackTextureKey('minecraft:chest', new Map(), new Map());
    expect(key).toBe('chest/normal');
  });

  it('returns null when the block has no resolvable model at all', async () => {
    const key = await resolveFallbackTextureKey('minecraft:some_unresolvable_block', new Map(), new Map());
    expect(key).toBeNull();
  });

  it('accepts a bare name (no "minecraft:" prefix) the same way', async () => {
    const key = await resolveFallbackTextureKey('chest', new Map(), new Map());
    expect(key).toBe('chest/normal');
  });
});
