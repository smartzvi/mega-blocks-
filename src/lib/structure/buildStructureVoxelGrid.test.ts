import { describe, expect, it } from 'vitest';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';
import { MAX_FINAL_VOXELS } from './safetyLimits';
import { buildStructureVoxelGrid } from './buildStructureVoxelGrid';
import type { BuildProgress } from './buildProgress';
import { createVoxelGrid, getVoxel, setVoxel } from '../voxel/voxelGrid';

function solidTexture(r: number, g: number, b: number): FaceTexture {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width: 16, height: 16, data };
}

function fakePaletteEntry(id: string, r: number, g: number, b: number, family: MaterialFamily = 'wood_earth'): PaletteEntry {
  const tex = solidTexture(r, g, b);
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

const noFiles = new Map<string, () => Promise<Uint8Array>>();

describe('buildStructureVoxelGrid', () => {
  it('composes a resolution^3 stamp per block at every position it occurs, sizing the output to source*resolution', async () => {
    // Two 1x1x1 cells side by side on X, each a hand-authored bed (multi-cell -> flat solid
    // fallback), so the expected output content is trivially predictable without needing a real
    // blockstate/model fixture.
    const culled = createVoxelGrid(2, 1, 1);
    setVoxel(culled, 0, 0, 0, 'minecraft:red_bed');
    setVoxel(culled, 1, 0, 0, 'minecraft:blue_bed');

    const redTexture = solidTexture(160, 40, 40);
    const blueTexture = solidTexture(40, 40, 160);
    const decodeTexture = async (key: string) => {
      if (key === 'bed/red') return redTexture;
      if (key === 'bed/blue') return blueTexture;
      return null;
    };
    const palette = [fakePaletteEntry('minecraft:red_color', 160, 40, 40), fakePaletteEntry('minecraft:blue_color', 40, 40, 160)];

    const result = await buildStructureVoxelGrid(
      culled,
      new Set(['minecraft:red_bed', 'minecraft:blue_bed']),
      palette,
      decodeTexture,
      noFiles,
      noFiles,
      16
    );

    expect(result.sizeX).toBe(32); // 2 source cells * resolution 16
    expect(result.sizeY).toBe(16);
    expect(result.sizeZ).toBe(16);
    // First cell's whole 16^3 stamp is the matched red color, second cell's the matched blue color.
    expect(getVoxel(result, 0, 0, 0)).toBe('minecraft:red_color');
    expect(getVoxel(result, 15, 15, 15)).toBe('minecraft:red_color');
    expect(getVoxel(result, 16, 0, 0)).toBe('minecraft:blue_color');
    expect(getVoxel(result, 31, 15, 15)).toBe('minecraft:blue_color');
  });

  it('leaves air cells (null) as null in the composed output, never stamping anything there', async () => {
    const culled = createVoxelGrid(2, 1, 1);
    setVoxel(culled, 0, 0, 0, 'minecraft:red_bed');
    const redTexture = solidTexture(160, 40, 40);
    const decodeTexture = async (key: string) => (key === 'bed/red' ? redTexture : null);
    const palette = [fakePaletteEntry('minecraft:red_color', 160, 40, 40)];

    const result = await buildStructureVoxelGrid(culled, new Set(['minecraft:red_bed']), palette, decodeTexture, noFiles, noFiles, 16);

    for (let x = 16; x < 32; x++) {
      for (let y = 0; y < 16; y++) {
        for (let z = 0; z < 16; z++) {
          expect(getVoxel(result, x, y, z)).toBeNull();
        }
      }
    }
  });

  it('merges the doubled wall between two adjacent solid stamps into one skin (cullComposedInterior)', async () => {
    // Same two-adjacent-beds setup as the first test: each is voxelized independently as its own
    // solid 16^3 stamp, so before the final cull pass, the touching x=15/x=16 boundary would both
    // stay solid (each stamp's own wall) — after, that seam should collapse to fully interior,
    // since both sides are true neighbors of a real solid stamp now.
    const culled = createVoxelGrid(2, 1, 1);
    setVoxel(culled, 0, 0, 0, 'minecraft:red_bed');
    setVoxel(culled, 1, 0, 0, 'minecraft:blue_bed');
    const decodeTexture = async (key: string) => {
      if (key === 'bed/red') return solidTexture(160, 40, 40);
      if (key === 'bed/blue') return solidTexture(40, 40, 160);
      return null;
    };
    const palette = [fakePaletteEntry('minecraft:red_color', 160, 40, 40), fakePaletteEntry('minecraft:blue_color', 40, 40, 160)];

    const result = await buildStructureVoxelGrid(
      culled,
      new Set(['minecraft:red_bed', 'minecraft:blue_bed']),
      palette,
      decodeTexture,
      noFiles,
      noFiles,
      16
    );

    // Deep interior of a single stamp was already null before this pass (hollow shell).
    expect(getVoxel(result, 5, 5, 5)).toBeNull();
    // The seam between the two stamps (away from the y/z boundary, so genuinely fully surrounded)
    // is now interior too, not a doubled wall.
    expect(getVoxel(result, 15, 5, 5)).toBeNull();
    expect(getVoxel(result, 16, 5, 5)).toBeNull();
    // The true outer boundary of the combined shape is untouched.
    expect(getVoxel(result, 0, 5, 5)).toBe('minecraft:red_color');
    expect(getVoxel(result, 31, 5, 5)).toBe('minecraft:blue_color');
  });

  it('lets the side texture carry through the seam between two vertically stacked identical logs, instead of end-capping (same-block adjacency fix)', async () => {
    // A log-like block: distinct "end" (top/bottom, end-grain) vs "side" (bark) textures, real
    // blockstate/model files (not the flat-fallback path) so real per-face color resolution runs.
    const blockStateFiles = new Map([
      ['fake_log', async () => new TextEncoder().encode(JSON.stringify({ variants: { 'axis=y': { model: 'minecraft:block/fake_log' } } }))],
    ]);
    const modelFiles = new Map([
      [
        'fake_log',
        async () =>
          new TextEncoder().encode(
            JSON.stringify({
              textures: { end: 'minecraft:block/fake_log_end', side: 'minecraft:block/fake_log_side' },
              elements: [
                {
                  from: [0, 0, 0],
                  to: [16, 16, 16],
                  faces: {
                    up: { uv: [0, 0, 16, 16], texture: '#end' },
                    down: { uv: [0, 0, 16, 16], texture: '#end' },
                    north: { uv: [0, 0, 16, 16], texture: '#side' },
                    south: { uv: [0, 0, 16, 16], texture: '#side' },
                    east: { uv: [0, 0, 16, 16], texture: '#side' },
                    west: { uv: [0, 0, 16, 16], texture: '#side' },
                  },
                },
              ],
            })
          ),
      ],
    ]);
    const endTexture = solidTexture(220, 180, 90);
    const sideTexture = solidTexture(90, 60, 30);
    const decodeTexture = async (key: string) => {
      if (key === 'fake_log_end') return endTexture;
      if (key === 'fake_log_side') return sideTexture;
      return null;
    };
    const palette = [fakePaletteEntry('minecraft:end_color', 220, 180, 90), fakePaletteEntry('minecraft:side_color', 90, 60, 30)];

    const culled = createVoxelGrid(1, 2, 1);
    setVoxel(culled, 0, 0, 0, 'minecraft:fake_log[axis=y]');
    setVoxel(culled, 0, 1, 0, 'minecraft:fake_log[axis=y]');

    const result = await buildStructureVoxelGrid(culled, new Set(['minecraft:fake_log[axis=y]']), palette, decodeTexture, blockStateFiles, modelFiles, 8);

    expect(result.sizeY).toBe(16); // 2 source cells * resolution 8
    // The real bottom (world y=0, no neighbor below) and real top (world y=15, no neighbor above)
    // keep their genuine end-grain cap — this is an isolated exposed end in both cases.
    expect(getVoxel(result, 0, 0, 4)).toBe('minecraft:end_color');
    expect(getVoxel(result, 0, 15, 4)).toBe('minecraft:end_color');
    // The internal seam (world y=7, top rim of the lower cell; world y=8, bottom rim of the upper
    // cell) is where two real occurrences of the identical block meet — both sides must now show
    // the continuous side (bark) color instead of end-capping.
    expect(getVoxel(result, 0, 7, 4)).toBe('minecraft:side_color');
    expect(getVoxel(result, 0, 8, 4)).toBe('minecraft:side_color');
  });

  it('never applies the same-block seam fix to stairs, even when two identical stair cells are adjacent', async () => {
    // Same log-like end/side texture setup as above, but named as a "stairs" block — proves the
    // exclusion is unconditional (keyed on the block name, not on shape), per explicit instruction
    // not to touch stair rendering while fixing this unrelated seam.
    const blockStateFiles = new Map([
      ['fake_stairs', async () => new TextEncoder().encode(JSON.stringify({ variants: { 'shape=straight': { model: 'minecraft:block/fake_stairs' } } }))],
    ]);
    const modelFiles = new Map([
      [
        'fake_stairs',
        async () =>
          new TextEncoder().encode(
            JSON.stringify({
              textures: { end: 'minecraft:block/fake_log_end', side: 'minecraft:block/fake_log_side' },
              elements: [
                {
                  from: [0, 0, 0],
                  to: [16, 16, 16],
                  faces: {
                    up: { uv: [0, 0, 16, 16], texture: '#end' },
                    down: { uv: [0, 0, 16, 16], texture: '#end' },
                    north: { uv: [0, 0, 16, 16], texture: '#side' },
                    south: { uv: [0, 0, 16, 16], texture: '#side' },
                    east: { uv: [0, 0, 16, 16], texture: '#side' },
                    west: { uv: [0, 0, 16, 16], texture: '#side' },
                  },
                },
              ],
            })
          ),
      ],
    ]);
    const endTexture = solidTexture(220, 180, 90);
    const sideTexture = solidTexture(90, 60, 30);
    const decodeTexture = async (key: string) => {
      if (key === 'fake_log_end') return endTexture;
      if (key === 'fake_log_side') return sideTexture;
      return null;
    };
    const palette = [fakePaletteEntry('minecraft:end_color', 220, 180, 90), fakePaletteEntry('minecraft:side_color', 90, 60, 30)];

    const culled = createVoxelGrid(1, 2, 1);
    setVoxel(culled, 0, 0, 0, 'minecraft:fake_stairs[shape=straight]');
    setVoxel(culled, 0, 1, 0, 'minecraft:fake_stairs[shape=straight]');

    const result = await buildStructureVoxelGrid(
      culled,
      new Set(['minecraft:fake_stairs[shape=straight]']),
      palette,
      decodeTexture,
      blockStateFiles,
      modelFiles,
      8
    );

    // Unlike the log case, the internal seam still end-caps on both sides — stairs are excluded.
    expect(getVoxel(result, 0, 7, 4)).toBe('minecraft:end_color');
    expect(getVoxel(result, 0, 8, 4)).toBe('minecraft:end_color');
  });

  describe('progress reporting', () => {
    const setup = () => {
      const culled = createVoxelGrid(2, 1, 1);
      setVoxel(culled, 0, 0, 0, 'minecraft:red_bed');
      setVoxel(culled, 1, 0, 0, 'minecraft:blue_bed');
      const decodeTexture = async (key: string) => {
        if (key === 'bed/red') return solidTexture(160, 40, 40);
        if (key === 'bed/blue') return solidTexture(40, 40, 160);
        return null;
      };
      const palette = [fakePaletteEntry('minecraft:red_color', 160, 40, 40), fakePaletteEntry('minecraft:blue_color', 40, 40, 160)];
      return { culled, decodeTexture, palette, ids: new Set(['minecraft:red_bed', 'minecraft:blue_bed']) };
    };

    it('reports the stages in order, each ending at 1, with every fraction between 0 and 1 and never going backwards within a stage', async () => {
      const { culled, decodeTexture, palette, ids } = setup();
      const events: BuildProgress[] = [];
      await buildStructureVoxelGrid(culled, ids, palette, decodeTexture, noFiles, noFiles, 16, (p) => events.push(p));

      const stagesSeen = events.map((e) => e.stage).filter((stage, i, all) => all.indexOf(stage) === i);
      expect(stagesSeen).toEqual(['stamps', 'place', 'trim']);
      for (const stage of stagesSeen) {
        const own = events.filter((e) => e.stage === stage).map((e) => e.fraction);
        expect(own[own.length - 1]).toBe(1);
        expect(own.every((f) => f >= 0 && f <= 1)).toBe(true);
        expect([...own].sort((a, b) => a - b)).toEqual(own);
      }
    });

    it('produces exactly the same grid whether or not progress is being reported', async () => {
      const a = setup();
      const b = setup();
      const plain = await buildStructureVoxelGrid(a.culled, a.ids, a.palette, a.decodeTexture, noFiles, noFiles, 16);
      const reported = await buildStructureVoxelGrid(b.culled, b.ids, b.palette, b.decodeTexture, noFiles, noFiles, 16, () => {});
      expect([...reported.voxels].sort()).toEqual([...plain.voxels].sort());
    });
  });

  it('rejects a composition whose real solid-voxel count exceeds the safety cap, before allocating the composed grid', async () => {
    // An 8x8x8 block of single-cell beds (each cell's stamp is a full resolution^3 solid cube via
    // the flat-fallback path) at resolution 64 needs 8*8*8*64^3 = 134,217,728 real solid voxels —
    // far past MAX_FINAL_VOXELS. This is deliberately NOT a sparse/mostly-air grid (the whole point
    // of the sparse VoxelGrid refactor is that a large-but-mostly-empty bounding box should NOT be
    // rejected on that basis alone) — it's genuinely solid throughout, so the real content itself,
    // not the declared size, is what must trip the cap.
    const culled = createVoxelGrid(8, 8, 8);
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 8; y++) {
        for (let z = 0; z < 8; z++) setVoxel(culled, x, y, z, 'minecraft:red_bed');
      }
    }
    const decodeTexture = async (key: string) => (key === 'bed/red' ? solidTexture(160, 40, 40) : null);
    const palette = [fakePaletteEntry('minecraft:red_color', 160, 40, 40)];

    await expect(
      buildStructureVoxelGrid(culled, new Set(['minecraft:red_bed']), palette, decodeTexture, noFiles, noFiles, 64)
    ).rejects.toThrow(new RegExp(MAX_FINAL_VOXELS.toLocaleString().replace(/,/g, '\\,')));
  });
});
