import { describe, expect, it } from 'vitest';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry, VoxelGrid } from '../../types/minecraft';
import { MAX_FINAL_VOXELS } from './safetyLimits';
import { buildStructureVoxelGrid } from './buildStructureVoxelGrid';

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

function gridOf(sizeX: number, sizeY: number, sizeZ: number, fill: (string | null)[][][]): VoxelGrid {
  return { sizeX, sizeY, sizeZ, voxels: fill };
}

const noFiles = new Map<string, () => Promise<Uint8Array>>();

describe('buildStructureVoxelGrid', () => {
  it('composes a resolution^3 stamp per block at every position it occurs, sizing the output to source*resolution', async () => {
    // Two 1x1x1 cells side by side on X, each a hand-authored bed (multi-cell -> flat solid
    // fallback), so the expected output content is trivially predictable without needing a real
    // blockstate/model fixture.
    const voxels: (string | null)[][][] = [
      [[  'minecraft:red_bed'  ]],
      [[  'minecraft:blue_bed' ]],
    ];
    const culled = gridOf(2, 1, 1, voxels);

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
    expect(result.voxels[0][0][0]).toBe('minecraft:red_color');
    expect(result.voxels[15][15][15]).toBe('minecraft:red_color');
    expect(result.voxels[16][0][0]).toBe('minecraft:blue_color');
    expect(result.voxels[31][15][15]).toBe('minecraft:blue_color');
  });

  it('leaves air cells (null) as null in the composed output, never stamping anything there', async () => {
    const culled = gridOf(2, 1, 1, [[['minecraft:red_bed']], [[null]]]);
    const redTexture = solidTexture(160, 40, 40);
    const decodeTexture = async (key: string) => (key === 'bed/red' ? redTexture : null);
    const palette = [fakePaletteEntry('minecraft:red_color', 160, 40, 40)];

    const result = await buildStructureVoxelGrid(culled, new Set(['minecraft:red_bed']), palette, decodeTexture, noFiles, noFiles, 16);

    const secondCellVoxels = result.voxels.slice(16, 32).flat(2);
    expect(secondCellVoxels.every((v) => v === null)).toBe(true);
  });

  it('merges the doubled wall between two adjacent solid stamps into one skin (cullComposedInterior)', async () => {
    // Same two-adjacent-beds setup as the first test: each is voxelized independently as its own
    // solid 16^3 stamp, so before the final cull pass, the touching x=15/x=16 boundary would both
    // stay solid (each stamp's own wall) — after, that seam should collapse to fully interior,
    // since both sides are true neighbors of a real solid stamp now.
    const culled = gridOf(2, 1, 1, [[['minecraft:red_bed']], [['minecraft:blue_bed']]]);
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
    expect(result.voxels[5][5][5]).toBeNull();
    // The seam between the two stamps (away from the y/z boundary, so genuinely fully surrounded)
    // is now interior too, not a doubled wall.
    expect(result.voxels[15][5][5]).toBeNull();
    expect(result.voxels[16][5][5]).toBeNull();
    // The true outer boundary of the combined shape is untouched.
    expect(result.voxels[0][5][5]).toBe('minecraft:red_color');
    expect(result.voxels[31][5][5]).toBe('minecraft:blue_color');
  });

  it('rejects a combination whose full output volume exceeds the safety cap, before doing the expensive per-block work', async () => {
    // A 100x100x100 source grid at resolution 64 would require 6400^3 output cells — nowhere near
    // computable, and far past MAX_FINAL_VOXELS — must be rejected immediately.
    const bigButSparse: VoxelGrid = { sizeX: 100, sizeY: 100, sizeZ: 100, voxels: [] };
    await expect(buildStructureVoxelGrid(bigButSparse, new Set(), [], async () => null, noFiles, noFiles, 64)).rejects.toThrow(
      new RegExp(MAX_FINAL_VOXELS.toLocaleString().replace(/,/g, '\\,'))
    );
  });
});
