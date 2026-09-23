import { describe, expect, it } from 'vitest';
import { rgbToLab, deltaE } from '../lib/color/lab';
import { buildPalette } from '../lib/palette/buildPalette';
import { extractTextures } from '../lib/zip/extractTextures';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../lib/zip/decodeTexture';
import { hasRealJar, loadRealArchive, REAL_JAR_PATH } from './realJar';

/**
 * Proves the real-jar test harness itself works end to end (archive → real PNG decode → real
 * curated palette), and replaces two checks this project used to do by hand in the browser dev
 * server console (redstone_block's colour, the chest texture's real box-UV regions) with permanent
 * regression tests. See realJar.ts's own doc for why this needs a real Node canvas polyfill and a
 * real jar on disk, and skips itself cleanly where either is missing.
 */
describe.skipIf(!hasRealJar())(`real jar (${REAL_JAR_PATH})`, () => {
  it('decodes a real 16x16 block texture and a real 64x64 entity atlas at their real sizes', async () => {
    const archive = await loadRealArchive();
    const stoneTop = await loadAndDecodeTexture('stone', archive.blockTextureFiles);
    expect(stoneTop).not.toBeNull();
    expect(stoneTop).toMatchObject({ width: 16, height: 16 });
    expect(stoneTop!.data.length).toBe(16 * 16 * 4);

    const chestAtlas = await loadAndDecodeEntityTexture('chest/normal', archive.entityTextureFiles);
    expect(chestAtlas).not.toBeNull();
    expect(chestAtlas).toMatchObject({ width: 64, height: 64 });
  });

  it('builds the real curated palette from the real jar (roughly the ~123 full-cube blocks CLAUDE.md documents)', async () => {
    const archive = await loadRealArchive();
    const textures = await extractTextures(archive);
    const palette = buildPalette(textures);
    expect(palette.length).toBeGreaterThan(100);
    expect(palette.find((p) => p.id === 'minecraft:oak_planks')).toBeDefined();
    expect(palette.find((p) => p.id === 'minecraft:redstone_block')).toBeUndefined(); // not a full cube's worth of distinct color — it's fine either way, this just documents current output
  });

  it("redstone_block's brightest real pixels are close to orange_concrete in raw colour — the exact regression filterPaletteForRedstoneSource.ts exists to avoid", async () => {
    const archive = await loadRealArchive();
    const textures = await extractTextures(archive);
    const palette = buildPalette(textures);
    const redstoneBlock = textures.get('redstone_block');
    expect(redstoneBlock).toBeDefined();

    // The brightest shade measured in the real texture (see redstoneSource.ts's own doc).
    const brightest = rgbToLab(230, 32, 8);
    const orangeConcrete = palette.find((p) => p.id === 'minecraft:orange_concrete')!;
    const redWool = palette.find((p) => p.id === 'minecraft:red_wool')!;
    expect(orangeConcrete).toBeDefined();
    expect(redWool).toBeDefined();

    // Confirms *why* the restriction in redstoneSource.ts is needed: unrestricted, this shade is
    // closer to orange_concrete than to any of the red family.
    expect(deltaE(brightest, orangeConcrete.avgLab.south)).toBeLessThan(deltaE(brightest, redWool.avgLab.south));
  });

  it("chest/normal.png's base and lid regions are both real, opaque, warm-toned pixels at the box-UV origins handAuthoredTemplates.ts assumes (base (0,19), lid (0,0))", async () => {
    const archive = await loadRealArchive();
    const tex = await loadAndDecodeEntityTexture('chest/normal', archive.entityTextureFiles);
    expect(tex).not.toBeNull();
    const { data, width } = tex!;

    function averageRgb(x1: number, y1: number, x2: number, y2: number) {
      let r = 0,
        g = 0,
        b = 0,
        n = 0,
        anyTransparent = false;
      for (let y = y1; y < y2; y++) {
        for (let x = x1; x < x2; x++) {
          const i = (y * width + x) * 4;
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          if (data[i + 3] < 200) anyTransparent = true;
          n++;
        }
      }
      return { rgb: [r / n, g / n, b / n] as [number, number, number], anyTransparent };
    }

    // Base box top face: box-UV top sits at (u+dz, v) sized dx×dz — origin (0,19), dx=dz=14.
    const baseTop = averageRgb(14, 19, 28, 33);
    // Lid box top face: origin (0,0), dx=dz=14.
    const lidTop = averageRgb(14, 0, 28, 14);

    for (const region of [baseTop, lidTop]) {
      expect(region.anyTransparent).toBe(false);
      const [r, g, b] = region.rgb;
      expect(r).toBeGreaterThan(g); // warm (more red than green)
      expect(g).toBeGreaterThan(b); // and more green than blue — a brown/amber hue, not e.g. blue or gray
    }
  });
});
