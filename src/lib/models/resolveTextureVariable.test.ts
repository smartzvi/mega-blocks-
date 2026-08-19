import { describe, expect, it } from 'vitest';
import { resolveTexturePath, texturePathToKey } from './resolveTextureVariable';

describe('resolveTexturePath', () => {
  it('resolves a single-hop variable reference to a real path', () => {
    expect(resolveTexturePath('#side', { side: 'minecraft:block/cauldron_side' })).toBe('minecraft:block/cauldron_side');
  });

  it('follows a chain of variable references (leaf -> parent re-export)', () => {
    expect(resolveTexturePath('#texture', { texture: '#all', all: 'block/torch' })).toBe('block/torch');
  });

  it('throws on a dangling reference with no definition', () => {
    expect(() => resolveTexturePath('#missing', {})).toThrow(/no definition/i);
  });

  it('throws on a cycle instead of looping forever', () => {
    expect(() => resolveTexturePath('#a', { a: '#b', b: '#a' })).toThrow(/cycle/i);
  });
});

describe('texturePathToKey', () => {
  it('strips the minecraft: namespace and block/ prefix', () => {
    expect(texturePathToKey('minecraft:block/cauldron_side')).toBe('cauldron_side');
  });

  it('strips just the block/ prefix when there is no namespace', () => {
    expect(texturePathToKey('block/oak_planks')).toBe('oak_planks');
  });

  it('leaves a bare key untouched', () => {
    expect(texturePathToKey('oak_planks')).toBe('oak_planks');
  });
});
