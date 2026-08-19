import { describe, expect, it } from 'vitest';
import { rasterizeItemModel } from './rasterizeModel';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';
import type { BlockModel } from '../../types/item';

function fakePaletteEntry(id: string, r: number, g: number, b: number, family: MaterialFamily = 'stone_deepslate'): PaletteEntry {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  const tex: FaceTexture = { width: 16, height: 16, data };
  const lab = averageColorLab(tex);
  const hsv = averageColorHsv(tex);
  return {
    id,
    textureBase: id,
    tint: null,
    family,
    textures: { top: tex, bottom: tex, north: tex, south: tex, east: tex, west: tex },
    avgLab: { top: lab, bottom: lab, north: lab, south: lab, east: lab, west: lab },
    avgHsv: { top: hsv, bottom: hsv, north: hsv, south: hsv, east: hsv, west: hsv },
  };
}

/** Blank 16x16 texture, background filled, then a set of 4x4 uv regions painted distinct colors. */
function paintedTexture(regions: Record<string, { rect: [number, number, number, number]; rgb: [number, number, number] }>): FaceTexture {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 128;
    data[i + 3] = 255;
  }
  for (const { rect, rgb } of Object.values(regions)) {
    const [u1, v1, u2, v2] = rect;
    for (let v = v1; v < v2; v++) {
      for (let u = u1; u < u2; u++) {
        const i = (v * 16 + u) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
      }
    }
  }
  return { width: 16, height: 16, data };
}

describe('rasterizeItemModel', () => {
  it('hollows out the interior of a full-cube element, like the existing cube shell', () => {
    const model: BlockModel = {
      textures: { all: 'all' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            top: { uv: [0, 0, 16, 16], texture: '#all' },
            bottom: { uv: [0, 0, 16, 16], texture: '#all' },
            north: { uv: [0, 0, 16, 16], texture: '#all' },
            south: { uv: [0, 0, 16, 16], texture: '#all' },
            east: { uv: [0, 0, 16, 16], texture: '#all' },
            west: { uv: [0, 0, 16, 16], texture: '#all' },
          },
        },
      ],
    };
    const texture = paintedTexture({ all: { rect: [0, 0, 16, 16], rgb: [200, 30, 30] } });
    const palette = [fakePaletteEntry('minecraft:red_filler', 200, 30, 30)];

    const grid = rasterizeItemModel(model, new Map([['all', texture]]), palette, 4);
    const flat = grid.voxels.flat(2);
    const nonNull = flat.filter((v) => v !== null);

    expect(grid.sizeX).toBe(4);
    expect(grid.sizeY).toBe(4);
    expect(grid.sizeZ).toBe(4);
    expect(nonNull).toHaveLength(4 ** 3 - 2 ** 3); // 56, same hollow-shell formula as the cube pipeline
    expect(nonNull.every((id) => id === 'minecraft:red_filler')).toBe(true);
  });

  it('samples each exposed face from its own declared UV rect and matches the right palette color', () => {
    const regions = {
      top: { rect: [0, 0, 4, 4] as [number, number, number, number], rgb: [255, 0, 0] as [number, number, number] },
      bottom: { rect: [4, 0, 8, 4] as [number, number, number, number], rgb: [0, 255, 0] as [number, number, number] },
      north: { rect: [8, 0, 12, 4] as [number, number, number, number], rgb: [0, 0, 255] as [number, number, number] },
      south: { rect: [12, 0, 16, 4] as [number, number, number, number], rgb: [255, 255, 0] as [number, number, number] },
      west: { rect: [0, 4, 4, 8] as [number, number, number, number], rgb: [255, 0, 255] as [number, number, number] },
      east: { rect: [4, 4, 8, 8] as [number, number, number, number], rgb: [0, 255, 255] as [number, number, number] },
    };
    const model: BlockModel = {
      textures: { x: 'x' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: Object.fromEntries(Object.entries(regions).map(([face, r]) => [face, { uv: r.rect, texture: '#x' }])) as BlockModel['elements'][0]['faces'],
        },
      ],
    };
    const texture = paintedTexture(regions);
    const palette = Object.entries(regions).map(([face, r]) => fakePaletteEntry(`minecraft:${face}_color`, ...r.rgb));

    const grid = rasterizeItemModel(model, new Map([['x', texture]]), palette, 4);

    expect(grid.voxels[1][3][1]).toBe('minecraft:top_color'); // y=3 boundary, x/z interior
    expect(grid.voxels[1][0][1]).toBe('minecraft:bottom_color'); // y=0 boundary
    expect(grid.voxels[1][1][0]).toBe('minecraft:north_color'); // z=0 boundary
    expect(grid.voxels[1][1][3]).toBe('minecraft:south_color'); // z=3 boundary
    expect(grid.voxels[0][1][1]).toBe('minecraft:west_color'); // x=0 boundary
    expect(grid.voxels[3][1][1]).toBe('minecraft:east_color'); // x=3 boundary
  });

  it('keeps a thin torch-like element fully solid (no hollowed-out interior) since every voxel touches open space', () => {
    const model: BlockModel = {
      textures: { torch: 'torch' },
      elements: [
        {
          from: [7, 0, 7],
          to: [9, 10, 9],
          faces: {
            north: { uv: [7, 6, 9, 16], texture: '#torch' },
          },
        },
      ],
    };
    const texture = paintedTexture({ torch: { rect: [7, 6, 9, 16], rgb: [180, 140, 40] } });
    const palette = [fakePaletteEntry('minecraft:torch_color', 180, 140, 40)];

    const grid = rasterizeItemModel(model, new Map([['torch', texture]]), palette, 16);
    const flat = grid.voxels.flat(2);
    const nonNull = flat.filter((v) => v !== null);

    expect(nonNull).toHaveLength(2 * 10 * 2); // full 2x10x2 volume, nothing hollowed out
    expect(nonNull.every((id) => id === 'minecraft:torch_color')).toBe(true);
  });

  it('keeps a degenerate zero-thickness element (like real ladder.json) visible instead of vanishing', () => {
    const model: BlockModel = {
      textures: { t: 't' },
      elements: [
        {
          from: [0, 0, 15.2],
          to: [16, 16, 15.2], // z-from === z-to, a flat overlay decal
          faces: { south: { uv: [0, 0, 16, 16], texture: '#t' } },
        },
      ],
    };
    const texture = paintedTexture({ t: { rect: [0, 0, 16, 16], rgb: [90, 60, 30] } });
    const palette = [fakePaletteEntry('minecraft:ladder_color', 90, 60, 30)];

    const grid = rasterizeItemModel(model, new Map([['t', texture]]), palette, 16);
    const flat = grid.voxels.flat(2);
    const nonNull = flat.filter((v) => v !== null);

    expect(nonNull.length).toBeGreaterThan(0); // must not vanish entirely
    expect(nonNull.every((id) => id === 'minecraft:ladder_color')).toBe(true);
  });

  it('leaves a voxel as air (null) when its sampled pixel is fully transparent, instead of matching the stored RGB behind it', () => {
    // Half the texture region is transparent with garbage black RGB behind it (mimicking real
    // ladder.png's rung gaps) — a transparent sample must never be matched to a color, since that
    // reproduces the original "mega torch" black_concrete bug.
    const data = new Uint8ClampedArray(16 * 16 * 4);
    for (let v = 0; v < 16; v++) {
      for (let u = 0; u < 16; u++) {
        const i = (v * 16 + u) * 4;
        if (u < 8) {
          data[i] = data[i + 1] = data[i + 2] = 0;
          data[i + 3] = 0; // transparent, garbage black RGB
        } else {
          data[i] = 200;
          data[i + 1] = 150;
          data[i + 2] = 50;
          data[i + 3] = 255;
        }
      }
    }
    const texture: FaceTexture = { width: 16, height: 16, data };

    const model: BlockModel = {
      textures: { t: 't' },
      elements: [
        {
          from: [0, 15, 0],
          to: [16, 16, 16], // a single 1-voxel-thick top layer
          faces: { top: { uv: [0, 0, 16, 16], texture: '#t' } },
        },
      ],
    };
    const palette = [fakePaletteEntry('minecraft:black_concrete', 20, 20, 20), fakePaletteEntry('minecraft:orange_wool', 200, 150, 50)];

    const grid = rasterizeItemModel(model, new Map([['t', texture]]), palette, 16);
    const layer = grid.voxels.map((plane) => plane[15]); // y = 15 layer, indexed [x][z]

    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 16; z++) expect(layer[x][z]).toBeNull();
    }
    for (let x = 8; x < 16; x++) {
      for (let z = 0; z < 16; z++) expect(layer[x][z]).toBe('minecraft:orange_wool');
    }
  });

  it('falls back to an earlier co-located element when a later one at the same position is fully transparent (real redstone_dust_dot.json bug)', () => {
    // Real vanilla stacks an opaque "#line" element under a mostly-transparent "#overlay" tint
    // element at the IDENTICAL from/to (redstone_dust_dot.json does exactly this). Only tracking
    // the last-added element per voxel meant every voxel's only owner was the transparent
    // overlay, and the whole block rasterized to zero voxels.
    const opaqueTexture = paintedTexture({ line: { rect: [0, 0, 16, 16], rgb: [180, 20, 20] } });
    const transparentData = new Uint8ClampedArray(16 * 16 * 4); // alpha 0 everywhere
    const transparentTexture: FaceTexture = { width: 16, height: 16, data: transparentData };

    const model: BlockModel = {
      textures: { line: 'line', overlay: 'overlay' },
      elements: [
        {
          from: [0, 0.25, 0],
          to: [16, 0.25, 16], // degenerate y-thickness, like the real model
          faces: {
            top: { uv: [0, 0, 16, 16], texture: '#line' },
            bottom: { uv: [0, 0, 16, 16], texture: '#line' },
          },
        },
        {
          from: [0, 0.25, 0],
          to: [16, 0.25, 16], // same exact position, added after — would "win" under last-owner-only
          faces: {
            top: { uv: [0, 0, 16, 16], texture: '#overlay' },
            bottom: { uv: [0, 0, 16, 16], texture: '#overlay' },
          },
        },
      ],
    };
    const palette = [fakePaletteEntry('minecraft:red_wire_color', 180, 20, 20)];
    const textures = new Map([
      ['line', opaqueTexture],
      ['overlay', transparentTexture],
    ]);

    const grid = rasterizeItemModel(model, textures, palette, 16);
    const nonNull = grid.voxels.flat(2).filter((v) => v !== null);

    expect(nonNull.length).toBeGreaterThan(0); // must not vanish entirely
    expect(nonNull.every((id) => id === 'minecraft:red_wire_color')).toBe(true);
  });

  it('falls back to another defined face when a face references an undecoded texture', () => {
    const model: BlockModel = {
      textures: { missing: 'missing', backup: 'backup' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: {
            north: { uv: [0, 0, 16, 16], texture: '#missing' }, // no entry in the textures map below
            top: { uv: [0, 0, 16, 16], texture: '#backup' },
          },
        },
      ],
    };
    const texture = paintedTexture({ backup: { rect: [0, 0, 16, 16], rgb: [10, 200, 10] } });
    const palette = [fakePaletteEntry('minecraft:backup_color', 10, 200, 10)];

    // Only "backup" is decoded — "missing" has no entry, simulating a failed/unresolved texture.
    const grid = rasterizeItemModel(model, new Map([['backup', texture]]), palette, 4);
    const flat = grid.voxels.flat(2);
    const nonNull = flat.filter((v) => v !== null);

    expect(nonNull.length).toBeGreaterThan(0);
    expect(nonNull.every((id) => id === 'minecraft:backup_color')).toBe(true);
  });

  it('produces a sizeY = 2x tall grid when modelHeightUnits=32, for a combined two-part door', () => {
    // Two full-footprint elements stacked in model space: lower spans y 0-16, upper y 16-32 —
    // exactly what resolveItemModel produces for a real two-part door.
    const model: BlockModel = {
      textures: { lower: 'lower', upper: 'upper' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: { top: { uv: [0, 0, 16, 16], texture: '#lower' }, bottom: { uv: [0, 0, 16, 16], texture: '#lower' } },
        },
        {
          from: [0, 16, 0],
          to: [16, 32, 16],
          faces: { top: { uv: [0, 0, 16, 16], texture: '#upper' }, bottom: { uv: [0, 0, 16, 16], texture: '#upper' } },
        },
      ],
    };
    const lowerTex = paintedTexture({ l: { rect: [0, 0, 16, 16], rgb: [120, 80, 40] } });
    const upperTex = paintedTexture({ u: { rect: [0, 0, 16, 16], rgb: [40, 80, 120] } });
    const palette = [
      fakePaletteEntry('minecraft:lower_color', 120, 80, 40),
      fakePaletteEntry('minecraft:upper_color', 40, 80, 120),
    ];
    const textures = new Map([
      ['lower', lowerTex],
      ['upper', upperTex],
    ]);

    const grid = rasterizeItemModel(model, textures, palette, 16, 32);

    expect(grid.sizeX).toBe(16);
    expect(grid.sizeY).toBe(32);
    expect(grid.sizeZ).toBe(16);
    // Bottom of the lower half (y=0) reads as the lower color; top of the upper half (y=31)
    // reads as the upper color — confirms both halves landed at the right Y range, not just
    // that colors exist somewhere.
    expect(grid.voxels[8][0][8]).toBe('minecraft:lower_color');
    expect(grid.voxels[8][31][8]).toBe('minecraft:upper_color');
  });

  it('supports modelDepthUnits for a genuinely 2-block-long structure (e.g. a hand-authored bed), independent of Y', () => {
    const model: BlockModel = {
      textures: { head: 'head', foot: 'foot' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: { top: { uv: [0, 0, 16, 16], texture: '#head' }, bottom: { uv: [0, 0, 16, 16], texture: '#head' } },
        },
        {
          from: [0, 0, 16],
          to: [16, 16, 32],
          faces: { top: { uv: [0, 0, 16, 16], texture: '#foot' }, bottom: { uv: [0, 0, 16, 16], texture: '#foot' } },
        },
      ],
    };
    const headTex = paintedTexture({ h: { rect: [0, 0, 16, 16], rgb: [200, 60, 60] } });
    const footTex = paintedTexture({ f: { rect: [0, 0, 16, 16], rgb: [60, 60, 200] } });
    const palette = [
      fakePaletteEntry('minecraft:head_color', 200, 60, 60),
      fakePaletteEntry('minecraft:foot_color', 60, 60, 200),
    ];
    const textures = new Map([
      ['head', headTex],
      ['foot', footTex],
    ]);

    const grid = rasterizeItemModel(model, textures, palette, 16, 16, 32);

    expect(grid.sizeX).toBe(16);
    expect(grid.sizeY).toBe(16);
    expect(grid.sizeZ).toBe(32); // genuinely 2 blocks long, not squashed into one
    // Head end (z=0) reads as the head color; foot end (z=31) reads as the foot color — confirms
    // both halves landed at the right Z range, independent of the Y axis door uses.
    expect(grid.voxels[8][0][0]).toBe('minecraft:head_color');
    expect(grid.voxels[8][0][31]).toBe('minecraft:foot_color');
  });

  it('uses elementPaletteOverrides for the owning element index, ignoring the shared palette even when it would be a closer color match', () => {
    // Both elements are painted the exact same color. Without an override, both would match
    // "minecraft:close" (a near-perfect color match). With element 0 overridden to a palette that
    // only contains "minecraft:restricted" (a poor color match), element 0 must use that instead —
    // proving the override wins over raw color distance, not just over a tie.
    const model: BlockModel = {
      textures: { lower: 'lower', upper: 'upper' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 16, 16],
          faces: { top: { uv: [0, 0, 16, 16], texture: '#lower' }, bottom: { uv: [0, 0, 16, 16], texture: '#lower' } },
        },
        {
          from: [0, 16, 0],
          to: [16, 32, 16],
          faces: { top: { uv: [0, 0, 16, 16], texture: '#upper' }, bottom: { uv: [0, 0, 16, 16], texture: '#upper' } },
        },
      ],
    };
    const sameColorTex = paintedTexture({ c: { rect: [0, 0, 16, 16], rgb: [200, 200, 200] } });
    const textures = new Map([
      ['lower', sameColorTex],
      ['upper', sameColorTex],
    ]);
    const close = fakePaletteEntry('minecraft:close', 200, 200, 200);
    const restricted = fakePaletteEntry('minecraft:restricted', 10, 10, 10);
    const palette = [close, restricted];

    const grid = rasterizeItemModel(model, textures, palette, 16, 32, 16, new Map([[0, [restricted]]]));

    expect(grid.voxels[8][0][8]).toBe('minecraft:restricted'); // element 0 (lower), overridden
    expect(grid.voxels[8][31][8]).toBe('minecraft:close'); // element 1 (upper), shared palette, unaffected
  });
});
