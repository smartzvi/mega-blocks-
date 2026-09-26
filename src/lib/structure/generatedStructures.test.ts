import { describe, expect, it } from 'vitest';
import { GENERATED_STRUCTURE_NAMES, generateStructure } from './generatedStructures';
import { forEachVoxel } from '../voxel/voxelGrid';
import { decodeBlockstateKey } from './blockstateKey';
import { cullInteriorVoxels } from './cullInteriorVoxels';
import { buildStructureVoxelGrid } from './buildStructureVoxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { hasRealJar, loadRealArchive } from '../../testSupport/realJar';

function countByName(name: string) {
  const parsed = generateStructure(name)!;
  const counts: Record<string, number> = {};
  const frames: Record<string, string>[] = [];
  forEachVoxel(parsed.grid, (_x, _y, _z, id) => {
    const { name: n, properties } = decodeBlockstateKey(id);
    counts[n] = (counts[n] ?? 0) + 1;
    if (n === 'minecraft:end_portal_frame') frames.push(properties);
  });
  return { parsed, counts, frames };
}

describe('generated stronghold portal room', () => {
  it('lists both versions', () => {
    expect(GENERATED_STRUCTURE_NAMES).toEqual(['stronghold/portal_room', 'stronghold/portal_room_with_eyes']);
    expect(generateStructure('nope')).toBeNull();
  });

  it.each(GENERATED_STRUCTURE_NAMES)('%s matches the wiki blueprint block counts (except stairs — only the bottom row of 3 is kept, per request) and 11x8x16 size', (name) => {
    const { parsed, counts } = countByName(name);
    expect([parsed.grid.sizeX, parsed.grid.sizeY, parsed.grid.sizeZ]).toEqual([11, 8, 16]);
    expect(counts['minecraft:lava']).toBe(15);
    expect(counts['minecraft:stone_brick_stairs']).toBe(3);
    expect(counts['minecraft:iron_bars']).toBe(39);
    expect(counts['minecraft:end_portal_frame']).toBe(12);
    expect(counts['minecraft:spawner']).toBe(1);
  });

  it('the plain version has 12 empty frames and no portal; the eyes version has 12 eyes and a 3x3 portal', () => {
    const plain = countByName('stronghold/portal_room');
    expect(plain.frames.every((f) => f.eye === 'false')).toBe(true);
    expect(plain.counts['minecraft:end_portal']).toBeUndefined();

    const eyes = countByName('stronghold/portal_room_with_eyes');
    expect(eyes.frames.every((f) => f.eye === 'true')).toBe(true);
    expect(eyes.counts['minecraft:end_portal']).toBe(9);
  });

  it('frames face away from the centre: 3 north, 3 south, 3 west, 3 east', () => {
    const { frames } = countByName('stronghold/portal_room');
    const facing: Record<string, number> = {};
    for (const f of frames) facing[f.facing] = (facing[f.facing] ?? 0) + 1;
    expect(facing).toEqual({ north: 3, south: 3, west: 3, east: 3 });
  });

  it('is deterministic — the same build every time', () => {
    const a = generateStructure('stronghold/portal_room')!;
    const b = generateStructure('stronghold/portal_room')!;
    expect([...a.blockIds].sort()).toEqual([...b.blockIds].sort());
  });
});

describe.skipIf(!hasRealJar())('generated portal room (real jar)', () => {
  it.each(GENERATED_STRUCTURE_NAMES)('%s voxelizes with no missing-texture (magenta) blocks', async (name) => {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, archive.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, archive.entityTextureFiles);
    const { grid, blockIds } = generateStructure(name)!;
    const out = await buildStructureVoxelGrid(cullInteriorVoxels(grid), blockIds, palette, decodeTexture, archive.blockStateFiles, archive.modelFiles, 16);
    const ids = new Set<string>();
    forEachVoxel(out, (_x, _y, _z, id) => ids.add(id));
    expect(ids.size).toBeGreaterThan(3);
    expect([...ids].filter((id) => id.includes('magenta'))).toEqual([]);
  }, 60000);
});
