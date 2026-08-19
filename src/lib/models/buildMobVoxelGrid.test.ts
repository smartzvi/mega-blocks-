import { describe, expect, it } from 'vitest';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import type { FaceTexture, MaterialFamily, PaletteEntry } from '../../types/minecraft';
import { buildMobVoxelGrid } from './buildMobVoxelGrid';

function solidTexture(r: number, g: number, b: number, width = 64, height = 32): FaceTexture {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function fakePaletteEntry(id: string, r: number, g: number, b: number, family: MaterialFamily = 'wood_earth'): PaletteEntry {
  const tex = solidTexture(r, g, b, 16, 16);
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

describe('buildMobVoxelGrid', () => {
  it('voxelizes a quadruped (pig) at resolution 16, sizing Y/Z per its real proportions, not squashed to a cube', async () => {
    const pigTexture = solidTexture(240, 180, 190); // pink-ish, 64x32 matching the real texture
    const decodeTexture = async (key: string) => (key === 'pig/temperate_pig' ? pigTexture : null);
    const palette = [fakePaletteEntry('minecraft:pink_wool', 240, 180, 190)];

    const grid = await buildMobVoxelGrid('pig', decodeTexture, palette, 16);

    expect(grid.sizeX).toBe(16);
    // pig heightUnits=16, depthUnits=24 (computed from real geometry) -> resolutionY=16, resolutionZ=24 at scale 1.
    expect(grid.sizeY).toBe(16);
    expect(grid.sizeZ).toBe(24);
    const nonNull = grid.voxels.flat(2).filter((v) => v !== null);
    expect(nonNull.length).toBeGreaterThan(0);
    expect(nonNull.every((id) => id === 'minecraft:pink_wool')).toBe(true);
  });

  it('voxelizes the shared biped model (zombie) as genuinely 2 blocks tall', async () => {
    const zombieTexture = solidTexture(50, 120, 50, 64, 64); // green-ish, 64x64 matching the real texture
    const decodeTexture = async (key: string) => (key === 'zombie/zombie' ? zombieTexture : null);
    const palette = [fakePaletteEntry('minecraft:green_wool', 50, 120, 50)];

    const grid = await buildMobVoxelGrid('zombie', decodeTexture, palette, 16);

    expect(grid.sizeX).toBe(16);
    expect(grid.sizeY).toBe(32); // heightUnits=32 -> genuinely 2 blocks tall at resolution 16
    expect(grid.sizeZ).toBe(8);
    const nonNull = grid.voxels.flat(2).filter((v) => v !== null);
    expect(nonNull.length).toBeGreaterThan(0);
  });

  it('scales resolution like every other mode (voxels-per-source-block, not a fixed 16)', async () => {
    const texture = solidTexture(200, 200, 200, 64, 32);
    const decodeTexture = async () => texture;
    const palette = [fakePaletteEntry('minecraft:white_wool', 200, 200, 200)];

    const grid = await buildMobVoxelGrid('chicken', decodeTexture, palette, 32);
    // chicken heightUnits=15, depthUnits=11 -> at resolution 32 (scale 2): Y=round(32*15/16)=30, Z=round(32*11/16)=22.
    expect(grid.sizeX).toBe(32);
    expect(grid.sizeY).toBe(30);
    expect(grid.sizeZ).toBe(22);
  });

  it('throws a clear error for an unknown mob name, with no resolver fallback to fall back to', async () => {
    await expect(buildMobVoxelGrid('creeper', async () => null, [], 16)).rejects.toThrow(/no hand-authored mob template/i);
  });

  it('throws when no referenced texture could be decoded at all', async () => {
    await expect(buildMobVoxelGrid('pig', async () => null, [], 16)).rejects.toThrow(/couldn't decode/i);
  });
});
