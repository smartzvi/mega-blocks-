import { describe, expect, it } from 'vitest';
import { decodeBlockstateKey, encodeBlockstateKey } from './blockstateKey';

describe('encodeBlockstateKey', () => {
  it('returns the bare name when there are no properties', () => {
    expect(encodeBlockstateKey('minecraft:stone')).toBe('minecraft:stone');
    expect(encodeBlockstateKey('minecraft:stone', {})).toBe('minecraft:stone');
  });

  it('sorts property keys alphabetically regardless of input order, so the same block+properties always produces the same string', () => {
    const a = encodeBlockstateKey('minecraft:oak_stairs', { shape: 'straight', facing: 'east', half: 'bottom' });
    const b = encodeBlockstateKey('minecraft:oak_stairs', { half: 'bottom', shape: 'straight', facing: 'east' });
    expect(a).toBe(b);
    expect(a).toBe('minecraft:oak_stairs[facing=east,half=bottom,shape=straight]');
  });
});

describe('decodeBlockstateKey', () => {
  it('round-trips a bare name with no properties', () => {
    expect(decodeBlockstateKey('minecraft:stone')).toEqual({ name: 'minecraft:stone', properties: {} });
  });

  it('round-trips a key with properties', () => {
    const key = encodeBlockstateKey('minecraft:oak_door', { facing: 'north', half: 'upper', hinge: 'left', open: 'false' });
    expect(decodeBlockstateKey(key)).toEqual({
      name: 'minecraft:oak_door',
      properties: { facing: 'north', half: 'upper', hinge: 'left', open: 'false' },
    });
  });
});
