import { describe, expect, it } from 'vitest';
import { findTwoPartVariantKeys, resolveBlockStateModelRefs } from './parseBlockState';

// A trimmed slice of the real assets/minecraft/blockstates/oak_door.json — only "half" actually
// differs between a lower/upper pair, matching the real file's structure exactly.
const OAK_DOOR_LIKE_BLOCKSTATE = {
  variants: {
    'facing=east,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left' },
    'facing=east,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left' },
    'facing=north,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left', y: 270 },
    'facing=north,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left', y: 270 },
    'facing=south,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left', y: 90 },
    'facing=south,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left', y: 90 },
    'facing=west,half=lower,hinge=left,open=false': { model: 'minecraft:block/oak_door_bottom_left', y: 180 },
    'facing=west,half=upper,hinge=left,open=false': { model: 'minecraft:block/oak_door_top_left', y: 180 },
  },
};

describe('resolveBlockStateModelRefs', () => {
  it('picks the property-less "" variant key when present, like real cauldron.json', () => {
    const refs = resolveBlockStateModelRefs({ variants: { '': { model: 'minecraft:block/cauldron' } } }, 'cauldron');
    expect(refs).toEqual([{ model: 'minecraft:block/cauldron', x: 0, y: 0 }]);
  });

  it('picks the facing=north variant and carries its y rotation, like real ladder.json', () => {
    const refs = resolveBlockStateModelRefs(
      {
        variants: {
          'facing=east': { model: 'minecraft:block/ladder', y: 90 },
          'facing=north': { model: 'minecraft:block/ladder' },
          'facing=south': { model: 'minecraft:block/ladder', y: 180 },
          'facing=west': { model: 'minecraft:block/ladder', y: 270 },
        },
      },
      'ladder'
    );
    expect(refs).toEqual([{ model: 'minecraft:block/ladder', x: 0, y: 0 }]);
  });

  it('falls back to the alphabetically-first key when no facing=north or "" variant exists', () => {
    const refs = resolveBlockStateModelRefs(
      {
        variants: {
          'facing=west': { model: 'minecraft:block/x', y: 270 },
          'facing=east': { model: 'minecraft:block/x', y: 90 },
          'facing=south': { model: 'minecraft:block/x', y: 180 },
        },
      },
      'x'
    );
    expect(refs).toEqual([{ model: 'minecraft:block/x', x: 0, y: 90 }]); // "facing=east" sorts first
  });

  it('unwraps a weighted-array variant value by taking the first entry', () => {
    const refs = resolveBlockStateModelRefs(
      { variants: { '': [{ model: 'minecraft:block/stone', weight: 1 }, { model: 'minecraft:block/stone_mirrored' }] } },
      'stone'
    );
    expect(refs[0].model).toBe('minecraft:block/stone');
  });

  it('keeps only unconditional multipart parts, like real oak_fence.json', () => {
    const refs = resolveBlockStateModelRefs(
      {
        multipart: [
          { apply: { model: 'minecraft:block/oak_fence_post' } },
          { when: { north: 'true' }, apply: { model: 'minecraft:block/oak_fence_side', y: 0 } },
          { when: { east: 'true' }, apply: { model: 'minecraft:block/oak_fence_side', y: 90 } },
        ],
      },
      'oak_fence'
    );
    expect(refs).toEqual([{ model: 'minecraft:block/oak_fence_post', x: 0, y: 0 }]);
  });

  it('falls back to every multipart part when none is unconditional, like real cobblestone_wall.json', () => {
    // Walls gate even their center post behind a condition (an "up" property), unlike a fence
    // whose post really is unconditional — with zero unconditional parts, render the
    // maximally-connected shape (post + all arms) instead of throwing.
    const refs = resolveBlockStateModelRefs(
      {
        multipart: [
          { when: { up: 'true' }, apply: { model: 'minecraft:block/cobblestone_wall_post' } },
          { when: { north: 'low' }, apply: { model: 'minecraft:block/cobblestone_wall_side' } },
          { when: { east: 'low' }, apply: { model: 'minecraft:block/cobblestone_wall_side', y: 90 } },
        ],
      },
      'cobblestone_wall'
    );
    expect(refs).toEqual([
      { model: 'minecraft:block/cobblestone_wall_post', x: 0, y: 0 },
      { model: 'minecraft:block/cobblestone_wall_side', x: 0, y: 0 },
      { model: 'minecraft:block/cobblestone_wall_side', x: 0, y: 90 },
    ]);
  });

  it('throws for a blockstate with neither variants nor multipart', () => {
    expect(() => resolveBlockStateModelRefs({}, 'weird_block')).toThrow(/neither/i);
  });

  it('picks the variant matching real known properties instead of the property-less default, like a real stair', () => {
    const stairsLike = {
      variants: {
        'facing=east,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs' },
        'facing=north,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs', y: 270 },
        'facing=south,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs', y: 90 },
        'facing=west,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs', y: 180 },
        'facing=east,half=bottom,shape=inner_left': { model: 'minecraft:block/oak_stairs_inner' },
      },
    };
    const refs = resolveBlockStateModelRefs(stairsLike, 'oak_stairs', { facing: 'south', half: 'bottom', shape: 'straight' });
    expect(refs).toEqual([{ model: 'minecraft:block/oak_stairs', x: 0, y: 90 }]);

    const cornerRefs = resolveBlockStateModelRefs(stairsLike, 'oak_stairs', { facing: 'east', half: 'bottom', shape: 'inner_left' });
    expect(cornerRefs).toEqual([{ model: 'minecraft:block/oak_stairs_inner', x: 0, y: 0 }]);
  });

  it('picks up the "x" rotation a real upside-down (half=top) stair variant applies, alongside its facing-driven "y"', () => {
    const stairsLike = {
      variants: {
        'facing=east,half=bottom,shape=straight': { model: 'minecraft:block/oak_stairs' },
        'facing=east,half=top,shape=straight': { model: 'minecraft:block/oak_stairs', x: 180 },
        'facing=south,half=top,shape=straight': { model: 'minecraft:block/oak_stairs', x: 180, y: 90 },
      },
    };
    const refs = resolveBlockStateModelRefs(stairsLike, 'oak_stairs', { facing: 'south', half: 'top', shape: 'straight' });
    expect(refs).toEqual([{ model: 'minecraft:block/oak_stairs', x: 180, y: 90 }]);
  });

  it('matches a variant key as a subset — ignores known properties the key never mentions (e.g. waterlogged)', () => {
    const refs = resolveBlockStateModelRefs(
      { variants: { 'facing=north': { model: 'minecraft:block/x' }, 'facing=south': { model: 'minecraft:block/x', y: 180 } } },
      'x',
      { facing: 'south', waterlogged: 'true' }
    );
    expect(refs).toEqual([{ model: 'minecraft:block/x', x: 0, y: 180 }]);
  });

  it('falls back to the property-less default pick when the given properties match no variant at all', () => {
    const refs = resolveBlockStateModelRefs(
      {
        variants: {
          'facing=north': { model: 'minecraft:block/x' },
          'facing=south': { model: 'minecraft:block/x', y: 180 },
        },
      },
      'x',
      { facing: 'up' } // doesn't match "north" or "south" — no variant key can match
    );
    expect(refs).toEqual([{ model: 'minecraft:block/x', x: 0, y: 0 }]); // falls back to the facing=north default
  });
});

// Trimmed but structurally exact slices of real 1.21.11 blockstates (dumped from the jar).
const OAK_FENCE = {
  multipart: [
    { apply: { model: 'minecraft:block/oak_fence_post' } },
    { apply: { model: 'minecraft:block/oak_fence_side', uvlock: true }, when: { north: 'true' } },
    { apply: { model: 'minecraft:block/oak_fence_side', uvlock: true, y: 90 }, when: { east: 'true' } },
    { apply: { model: 'minecraft:block/oak_fence_side', uvlock: true, y: 180 }, when: { south: 'true' } },
    { apply: { model: 'minecraft:block/oak_fence_side', uvlock: true, y: 270 }, when: { west: 'true' } },
  ],
};

const COBBLESTONE_WALL = {
  multipart: [
    { apply: { model: 'minecraft:block/cobblestone_wall_post' }, when: { up: 'true' } },
    { apply: { model: 'minecraft:block/cobblestone_wall_side' }, when: { north: 'low' } },
    { apply: { model: 'minecraft:block/cobblestone_wall_side', y: 90 }, when: { east: 'low' } },
    { apply: { model: 'minecraft:block/cobblestone_wall_side_tall' }, when: { north: 'tall' } },
    { apply: { model: 'minecraft:block/cobblestone_wall_side_tall', y: 90 }, when: { east: 'tall' } },
  ],
};

const IRON_BARS = {
  multipart: [
    { apply: { model: 'minecraft:block/iron_bars_post_ends' } },
    { apply: { model: 'minecraft:block/iron_bars_post' }, when: { east: 'false', north: 'false', south: 'false', west: 'false' } },
    { apply: { model: 'minecraft:block/iron_bars_cap' }, when: { east: 'false', north: 'true', south: 'false', west: 'false' } },
    { apply: { model: 'minecraft:block/iron_bars_side' }, when: { north: 'true' } },
    { apply: { model: 'minecraft:block/iron_bars_side', y: 90 }, when: { east: 'true' } },
  ],
};

describe('resolveBlockStateModelRefs — multipart `when` evaluated against real properties', () => {
  it('a fence with real north=true,east=true renders its post plus exactly those two arms', () => {
    const refs = resolveBlockStateModelRefs(OAK_FENCE, 'oak_fence', { north: 'true', east: 'true', south: 'false', west: 'false', waterlogged: 'false' });
    expect(refs).toEqual([
      { model: 'minecraft:block/oak_fence_post', x: 0, y: 0 },
      { model: 'minecraft:block/oak_fence_side', x: 0, y: 0 },
      { model: 'minecraft:block/oak_fence_side', x: 0, y: 90 },
    ]);
  });

  it('a fence with all sides false renders just the post', () => {
    const refs = resolveBlockStateModelRefs(OAK_FENCE, 'oak_fence', { north: 'false', east: 'false', south: 'false', west: 'false' });
    expect(refs).toEqual([{ model: 'minecraft:block/oak_fence_post', x: 0, y: 0 }]);
  });

  it('a wall with a real post and mixed low/tall arms picks each arm\'s own model', () => {
    const refs = resolveBlockStateModelRefs(COBBLESTONE_WALL, 'cobblestone_wall', { up: 'true', north: 'low', east: 'tall', south: 'none', west: 'none' });
    expect(refs).toEqual([
      { model: 'minecraft:block/cobblestone_wall_post', x: 0, y: 0 },
      { model: 'minecraft:block/cobblestone_wall_side', x: 0, y: 0 },
      { model: 'minecraft:block/cobblestone_wall_side_tall', x: 0, y: 90 },
    ]);
  });

  it('a wall with up=false drops the post — no longer the maximally-connected fallback', () => {
    const refs = resolveBlockStateModelRefs(COBBLESTONE_WALL, 'cobblestone_wall', { up: 'false', north: 'low', east: 'none' });
    expect(refs).toEqual([{ model: 'minecraft:block/cobblestone_wall_side', x: 0, y: 0 }]);
  });

  it('iron bars with a single north connection pick the cap and the side, not the bare post', () => {
    const refs = resolveBlockStateModelRefs(IRON_BARS, 'iron_bars', { north: 'true', east: 'false', south: 'false', west: 'false' });
    expect(refs.map((r) => r.model)).toEqual([
      'minecraft:block/iron_bars_post_ends',
      'minecraft:block/iron_bars_cap',
      'minecraft:block/iron_bars_side',
    ]);
  });

  it('supports "a|b" alternatives, OR and AND conditions', () => {
    const state = {
      multipart: [
        { apply: { model: 'minecraft:block/alt' }, when: { north: 'low|tall' } },
        { apply: { model: 'minecraft:block/or' }, when: { OR: [{ east: 'true' }, { west: 'true' }] } },
        { apply: { model: 'minecraft:block/and' }, when: { AND: [{ up: 'true' }, { south: 'true' }] } },
      ],
    };
    expect(resolveBlockStateModelRefs(state, 'x', { north: 'tall', west: 'true', up: 'true', south: 'false' }).map((r) => r.model)).toEqual([
      'minecraft:block/alt',
      'minecraft:block/or',
    ]);
    expect(resolveBlockStateModelRefs(state, 'x', { north: 'none', east: 'false', west: 'false', up: 'true', south: 'true' }).map((r) => r.model)).toEqual([
      'minecraft:block/and',
    ]);
  });

  it('treats a property the block does not carry as non-matching, even for a "false" condition', () => {
    const refs = resolveBlockStateModelRefs(IRON_BARS, 'iron_bars', { north: 'true' }); // east/south/west unknown
    expect(refs.map((r) => r.model)).toEqual(['minecraft:block/iron_bars_post_ends', 'minecraft:block/iron_bars_side']);
  });

  it('falls back to the property-less default when properties satisfy no part at all', () => {
    const refs = resolveBlockStateModelRefs(COBBLESTONE_WALL, 'cobblestone_wall', { up: 'false', north: 'none', east: 'none' });
    expect(refs).toHaveLength(COBBLESTONE_WALL.multipart.length); // all-conditional -> every part, unchanged behavior
  });

  it('a connected glass pane drops its center post (it shows through the transparent glass as a stray bar), but an isolated pane keeps it', () => {
    const pane = {
      multipart: [
        { apply: { model: 'minecraft:block/glass_pane_post' } },
        { apply: { model: 'minecraft:block/glass_pane_side' }, when: { north: 'true' } },
        { apply: { model: 'minecraft:block/glass_pane_side_alt' }, when: { south: 'true' } },
        { apply: { model: 'minecraft:block/glass_pane_noside' }, when: { east: 'false' } },
      ],
    };
    const connected = resolveBlockStateModelRefs(pane, 'glass_pane', { north: 'true', south: 'true', east: 'false', west: 'false' });
    expect(connected.map((r) => r.model)).toEqual(['minecraft:block/glass_pane_side', 'minecraft:block/glass_pane_side_alt', 'minecraft:block/glass_pane_noside']);

    const isolated = resolveBlockStateModelRefs(pane, 'glass_pane', { north: 'false', south: 'false', east: 'false', west: 'false' });
    expect(isolated.map((r) => r.model)).toContain('minecraft:block/glass_pane_post');

    const iron = resolveBlockStateModelRefs(IRON_BARS, 'iron_bars', { north: 'true', east: 'false', south: 'false', west: 'false' });
    expect(iron.map((r) => r.model)).toContain('minecraft:block/iron_bars_post_ends');
  });

  it('without properties (item mode), behavior is unchanged: fence stays a bare post', () => {
    expect(resolveBlockStateModelRefs(OAK_FENCE, 'oak_fence')).toEqual([{ model: 'minecraft:block/oak_fence_post', x: 0, y: 0 }]);
  });
});

describe('findTwoPartVariantKeys', () => {
  it('finds the matching lower/upper pair, preferring facing=north, like real oak_door.json', () => {
    const result = findTwoPartVariantKeys(OAK_DOOR_LIKE_BLOCKSTATE);
    expect(result).toEqual({
      lower: { model: 'minecraft:block/oak_door_bottom_left', x: 0, y: 270 },
      upper: { model: 'minecraft:block/oak_door_top_left', x: 0, y: 270 },
    });
  });

  it('returns null for an ordinary single-story variants block (no "half" property)', () => {
    expect(findTwoPartVariantKeys({ variants: { '': { model: 'minecraft:block/cauldron' } } })).toBeNull();
  });

  it('returns null for a multipart block', () => {
    expect(
      findTwoPartVariantKeys({ multipart: [{ apply: { model: 'minecraft:block/oak_fence_post' } }] })
    ).toBeNull();
  });

  it('returns null when a half=lower key exists but has no matching half=upper counterpart', () => {
    expect(findTwoPartVariantKeys({ variants: { 'half=lower': { model: 'minecraft:block/x' } } })).toBeNull();
  });
});
