import { describe, expect, it } from 'vitest';
import { buildMobVoxelGrid } from './buildMobVoxelGrid';
import { BOAT_WOODS, boatTemplateFor } from './boatTemplates';
import { minecartOnRailTemplate, minecartTemplate } from './cartTemplates';
import { resolveTexturePath, texturePathToKey } from './resolveTextureVariable';
import type { HandAuthoredTemplate } from './handAuthoredTemplates';
import { forEachVoxel, getVoxel } from '../voxel/voxelGrid';
import { buildPalette } from '../palette/buildPalette';
import { extractTextures } from '../zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { playerDims, spawnAboveCenter, stepPlayer, type PlayerState } from '../walk/playerPhysics';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from '../../testSupport/realJar';

describe.skipIf(!hasRealJar())(`minecart and boat (real jar: ${REAL_JAR_PATH})`, () => {
  async function setup() {
    const archive = await loadRealArchive();
    const palette = buildPalette(await extractTextures(archive));
    const decode = async (key: string) =>
      (await loadAndDecodeEntityTexture(key, archive.entityTextureFiles)) ?? loadAndDecodeTexture(key, archive.blockTextureFiles);
    return { archive, palette, decode };
  }

  /** Every face of every element (of the cart or boat itself) must sample only genuinely opaque texels: a transparent one silently
   *  becomes air (CLAUDE.md), and the cart's underside rim atlas region is exactly such a trap. */
  async function expectAllRectsOpaque(template: HandAuthoredTemplate, decode: (k: string) => Promise<{ width: number; height: number; data: Uint8ClampedArray } | null>, label: string) {
    const cache = new Map<string, Awaited<ReturnType<typeof decode>>>();
    for (const el of template.model.elements) {
      for (const face of Object.values(el.faces)) {
        if (!face) continue;
        const key = texturePathToKey(resolveTexturePath(face.texture, template.model.textures));
        // The rail under a cart is a genuine cutout (its tie gaps are real transparent texels, and expected).
        if (!key.startsWith('minecart') && !key.startsWith('boat/')) continue;
        if (!cache.has(key)) cache.set(key, await decode(key));
        const tex = cache.get(key);
        expect(tex, `${label}: texture ${key} decodes`).toBeTruthy();
        const [u0, v0, u1, v1] = face.uv;
        for (let y = Math.floor(v0); y < Math.ceil(v1); y++) {
          for (let x = Math.floor(u0); x < Math.ceil(u1); x++) {
            expect(tex!.data[(y * tex!.width + x) * 4 + 3], `${label}: ${key} texel (${x},${y}) in rect ${face.uv}`).toBeGreaterThan(0);
          }
        }
      }
    }
  }

  it('every UV rect of the minecart, on every rail shape, is fully opaque in the real texture', async () => {
    const { decode } = await setup();
    await expectAllRectsOpaque(minecartTemplate(), decode, 'minecart');
    for (const shape of ['north_south', 'east_west', 'south_east', 'ascending_north', 'ascending_south', 'ascending_east', 'ascending_west'] as const) {
      await expectAllRectsOpaque(minecartOnRailTemplate(shape), decode, `cart on ${shape}`);
    }
  });

  it('every UV rect of the boat is fully opaque in every wood\'s real texture', async () => {
    const { decode } = await setup();
    for (const wood of BOAT_WOODS) await expectAllRectsOpaque(boatTemplateFor(wood), decode, `boat ${wood}`);
  });

  it('the minecart voxelizes, hollow, in metal greys, with no missing-texture colour', async () => {
    const { palette, decode } = await setup();
    const grid = await buildMobVoxelGrid('minecart', decode, palette, 16);
    expect([grid.sizeX, grid.sizeY, grid.sizeZ]).toEqual([16, 10, 20]);
    expect(getVoxel(grid, 8, 0, 10)).not.toBeNull(); // floor
    expect(getVoxel(grid, 8, 4, 10)).toBeNull(); // open inside
    expect(getVoxel(grid, 0, 5, 10)).not.toBeNull(); // wall
    const ids = new Set<string>();
    forEachVoxel(grid, (_x, _y, _z, id) => ids.add(id));
    expect([...ids].filter((id) => /magenta|pink|red|green|blue|yellow|orange/.test(id))).toEqual([]);
  });

  it('a cart on each rail shape voxelizes without throwing, at the resolutions the app offers', async () => {
    const { palette, decode } = await setup();
    for (const resolution of [16, 32]) {
      for (const shape of ['north_south', 'south_east', 'ascending_north', 'ascending_south', 'ascending_east', 'ascending_west'] as const) {
        const grid = await buildMobVoxelGrid('minecart on rail', decode, palette, resolution, { railShape: shape });
        expect(grid.voxels.size, `${shape} @${resolution}`).toBeGreaterThan(0);
      }
    }
  }, 60000);

  it('each boat wood voxelizes using only that wood\'s own blocks (pale oak, with none in the palette, may use the pale tones)', async () => {
    const { palette, decode } = await setup();
    for (const wood of BOAT_WOODS) {
      const grid = await buildMobVoxelGrid('boat', decode, palette, 16, { boatWood: wood });
      expect([grid.sizeX, grid.sizeY, grid.sizeZ]).toEqual([44, 13, 32]);
      const ids = new Set<string>();
      forEachVoxel(grid, (_x, _y, _z, id) => ids.add(id));
      if (wood === 'pale_oak') continue;
      for (const id of ids) expect(id, wood).toContain(wood);
    }
  }, 60000);

  it('a player can drop into the boat, land on its floor, and is held in by the hull', async () => {
    const { palette, decode } = await setup();
    const grid = await buildMobVoxelGrid('boat', decode, palette, 16, { boatWood: 'oak' });
    const dims = playerDims(1); // walk mode's scale: one voxel is one block
    const isSolid = (x: number, y: number, z: number) => getVoxel(grid, x, y, z) !== null;

    // Dropped above the middle of the hull (the grid centre, X=22, Z=16), not the oars.
    let s: PlayerState = spawnAboveCenter(grid.sizeX, grid.sizeY, grid.sizeZ);
    for (let i = 0; i < 600 && !s.onGround; i++) s = stepPlayer(s, { forward: 0, strafe: 0, yaw: 0, jump: false }, 1 / 60, isSolid, dims);
    expect(s.onGround).toBe(true);
    expect(s.pos[1]).toBeCloseTo(3, 4); // standing on the hull floor, not on the rim
    expect(s.pos[0]).toBeGreaterThan(16);
    expect(s.pos[0]).toBeLessThan(28); // inside the walls

    // Walking sideways into the port wall stops at it: the 6-tall wall is more than a jump.
    const YAW_EAST = -Math.PI / 2;
    for (let i = 0; i < 600; i++) s = stepPlayer(s, { forward: 1, strafe: 0, yaw: YAW_EAST, jump: true }, 1 / 60, isSolid, dims);
    expect(s.pos[0]).toBeLessThan(28.01 - dims.halfWidth + 0.5);
  });
});
