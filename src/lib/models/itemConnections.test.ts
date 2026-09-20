import { describe, expect, it } from 'vitest';
import { connectionFamily, forcedConnectionProperties, itemConnectionProperties } from './itemConnections';

describe('connectionFamily', () => {
  it('recognizes fences, panes/bars, walls and redstone wire, and nothing else', () => {
    expect(connectionFamily('minecraft:oak_fence')).toBe('fence');
    expect(connectionFamily('minecraft:nether_brick_fence')).toBe('fence');
    expect(connectionFamily('minecraft:glass_pane[north=true]')).toBe('pane');
    expect(connectionFamily('minecraft:white_stained_glass_pane')).toBe('pane');
    expect(connectionFamily('minecraft:iron_bars')).toBe('pane');
    expect(connectionFamily('minecraft:copper_bars')).toBe('pane');
    expect(connectionFamily('minecraft:cobblestone_wall')).toBe('wall');
    expect(connectionFamily('minecraft:redstone_wire')).toBe('wire');
    expect(connectionFamily('minecraft:oak_fence_gate')).toBeNull();
    expect(connectionFamily('minecraft:oak_wall_sign')).toBeNull();
    expect(connectionFamily('minecraft:stone')).toBeNull();
    expect(connectionFamily('oak_planks')).toBeNull();
  });
});

describe('forced connection properties', () => {
  it('builds per-family all-connected and all-open sets', () => {
    expect(forcedConnectionProperties('fence', 'all')).toEqual({ north: 'true', east: 'true', south: 'true', west: 'true' });
    expect(forcedConnectionProperties('pane', 'none')).toEqual({ north: 'false', east: 'false', south: 'false', west: 'false' });
    expect(forcedConnectionProperties('wall', 'all')).toEqual({ north: 'low', east: 'low', south: 'low', west: 'low', up: 'true' });
    expect(forcedConnectionProperties('wall', 'none')).toEqual({ north: 'none', east: 'none', south: 'none', west: 'none', up: 'true' });
    expect(forcedConnectionProperties('wire', 'all')).toEqual({ north: 'side', east: 'side', south: 'side', west: 'side' });
    expect(forcedConnectionProperties('wire', 'none')).toEqual({ north: 'none', east: 'none', south: 'none', west: 'none' });
  });
});

describe('itemConnectionProperties', () => {
  it('gives properties only for the two forced modes and only for connecting blocks', () => {
    expect(itemConnectionProperties('oak_fence', 'all')).toEqual({ north: 'true', east: 'true', south: 'true', west: 'true' });
    expect(itemConnectionProperties('glass_pane', 'none')).toEqual({ north: 'false', east: 'false', south: 'false', west: 'false' });
    expect(itemConnectionProperties('oak_fence', 'stored')).toBeUndefined();
    expect(itemConnectionProperties('stone', 'all')).toBeUndefined();
  });
});
