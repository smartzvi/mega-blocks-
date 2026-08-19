import type { FaceTexture, PaletteEntry, VoxelGrid } from '../../types/minecraft';
import { averageColorHsv, averageColorLab } from '../color/averageColor';
import { matchPixel } from '../matching/matchFace';
import { buildItemVoxelGrid, type TextureDecoder } from '../models/buildItemVoxelGrid';
import { decodeBlockstateKey } from './blockstateKey';
import { resolveFallbackTextureKey } from './resolveFallbackTexture';
import { filterPaletteForSource } from '../palette/glassSource';
import { filterLightSourcesForSource } from '../palette/lightSourceExclusion';

type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;

const MISSING_TEXTURE_SIZE = 16;

/** Mirrors Minecraft's own convention for a genuinely unresolvable texture: an unmistakable
 *  magenta/black checkerboard, so a block this app couldn't find any texture for is still matched
 *  to *something* rather than crashing — its color obviously won't be intentional, but the block
 *  is never silently dropped. */
function buildMissingTexture(): FaceTexture {
  const data = new Uint8ClampedArray(MISSING_TEXTURE_SIZE * MISSING_TEXTURE_SIZE * 4);
  for (let y = 0; y < MISSING_TEXTURE_SIZE; y++) {
    for (let x = 0; x < MISSING_TEXTURE_SIZE; x++) {
      const i = (y * MISSING_TEXTURE_SIZE + x) * 4;
      const isMagenta = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      data[i] = isMagenta ? 255 : 0;
      data[i + 1] = 0;
      data[i + 2] = isMagenta ? 255 : 0;
      data[i + 3] = 255;
    }
  }
  return { width: MISSING_TEXTURE_SIZE, height: MISSING_TEXTURE_SIZE, data };
}

function solidStamp(blockId: string, resolution: number): VoxelGrid {
  const voxels: (string | null)[][][] = [];
  for (let x = 0; x < resolution; x++) {
    const plane: (string | null)[][] = [];
    for (let y = 0; y < resolution; y++) {
      plane.push(new Array<string | null>(resolution).fill(blockId));
    }
    voxels.push(plane);
  }
  return { sizeX: resolution, sizeY: resolution, sizeZ: resolution, voxels };
}

/**
 * Builds one `resolution`^3 "stamp" for a single structure block ID, computed once per unique ID
 * (buildStructureVoxelGrid.ts then stamps it at every position that block occurs) — this is the
 * fix for structure mode's original bug: it used to spatially duplicate a source cell into a
 * solid `scaleFactor`^3 cube of its own raw ID, which ruins geometry (a fence becomes a giant
 * solid fence-textured block) and produces broken exports. Instead, every block is voxelized
 * through the exact same engine Item mode already uses (buildItemVoxelGrid: resolve its real
 * model, sample its real texture pixels, match each exposed voxel face against the real palette)
 * — the same 16x16x16 (or 32/48/64) "shape made of real matched blocks" treatment an item gets,
 * not a flat repeated cube.
 *
 * `blockId` is a full blockstate key (Name[prop=val,...], see blockstateKey.ts) carrying the
 * block's real stored Properties — decoded here and passed through to buildItemVoxelGrid, which
 * threads it into resolveBlockStateModelRefs' property-aware variant selection. This is what makes
 * a stair rotate to its real facing/shape and a door half resolve as its own genuine single-block
 * model (real properties mean resolveItemModel never takes its two-part-stitching shortcut — see
 * its own docs) instead of every instance rendering with one arbitrary default orientation.
 *
 * Two things that engine still can't handle per-cell fall back to a single flat matched color,
 * filling the whole stamp as one solid cube (still a real palette-matched block, just without
 * shape detail — a plain colored cube is a reasonable degrade, not a placeholder to hide):
 * - `MultiCellBlockError` (a hand-authored bed's head/foot): no per-half hand-authored geometry
 *   exists to select via properties, unlike blockstate-driven blocks.
 * - Any other failure (no blockstate/model found at all, no texture decodable): the same
 *   `resolveFallbackTextureKey` chain buildStructurePalette.ts used to use, now feeding a single
 *   representative color into the real matcher instead of just being displayed directly.
 */
export async function buildStructureBlockStamp(
  blockId: string,
  blockStateFiles: FileLoaderMap,
  modelFiles: FileLoaderMap,
  decodeTexture: TextureDecoder,
  palette: PaletteEntry[],
  resolution: number
): Promise<VoxelGrid> {
  if (palette.length === 0) {
    throw new Error('Palette is empty — cannot voxelize structure blocks.');
  }

  const { name, properties } = decodeBlockstateKey(blockId);
  const bareName = name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name;

  try {
    return await buildItemVoxelGrid(bareName, blockStateFiles, modelFiles, decodeTexture, palette, resolution, {
      rejectMultiCell: true,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    });
  } catch {
    // Falls through to the flat-color fallback below for every failure mode — a MultiCellError
    // (bed), an unresolvable blockstate/model, zero elements, or no decodable texture. A
    // structure block is never dropped outright, same guarantee buildStructurePalette.ts used to
    // provide.
  }

  const fallbackKey = await resolveFallbackTextureKey(blockId, blockStateFiles, modelFiles);
  const texture = (fallbackKey && (await decodeTexture(fallbackKey))) || buildMissingTexture();
  const effectivePalette = filterLightSourcesForSource(filterPaletteForSource(palette, bareName), bareName);
  const matched = matchPixel(averageColorLab(texture), averageColorHsv(texture), 'top', effectivePalette).id;
  return solidStamp(matched, resolution);
}
