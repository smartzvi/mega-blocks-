import type { FaceName, FaceTexture, PaletteEntry } from '../../types/minecraft';
import { FACE_COUNT } from './voxelMesher';

/** The mesher's face order (see voxelMesher.ts). */
export const MESH_FACE_ORDER: FaceName[] = ['east', 'west', 'top', 'bottom', 'south', 'north'];

export interface TextureAtlas {
  canvas: HTMLCanvasElement;
  /** Per tile: u0, v0, u1, v1 in 0..1, v0 = the tile's top edge (the canvas texture uses flipY = false). */
  tileUvs: Float32Array;
  /** Per palette block id, its FACE_COUNT tile indices in MESH_FACE_ORDER. */
  tilesByBlock: Map<string, number[]>;
}

/**
 * Packs every palette face texture into one canvas, so the whole preview is drawn with one material
 * instead of one per face per block. Tiles are all drawn at one size (the largest texture width,
 * capped at 64, so a 32x resource pack keeps its detail) with a 1-pixel border copied from each
 * tile's own edge: without it, rounding at a tile's edge can pick up a neighbouring tile's pixel.
 */
export function buildTextureAtlas(palette: PaletteEntry[]): TextureAtlas {
  const textures: FaceTexture[] = [];
  const indexOf = new Map<FaceTexture, number>();
  const tilesByBlock = new Map<string, number[]>();
  for (const entry of palette) {
    const tiles = MESH_FACE_ORDER.map((face) => {
      const tex = entry.textures[face];
      let index = indexOf.get(tex);
      if (index === undefined) {
        index = textures.length;
        indexOf.set(tex, index);
        textures.push(tex);
      }
      return index;
    });
    tilesByBlock.set(entry.id, tiles);
  }

  const tile = Math.min(64, Math.max(16, ...textures.map((t) => t.width)));
  const slot = tile + 2;
  const cols = Math.max(1, Math.ceil(Math.sqrt(textures.length)));
  const rows = Math.max(1, Math.ceil(textures.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cols * slot;
  canvas.height = rows * slot;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d')!;
  const tileUvs = new Float32Array(textures.length * 4);

  textures.forEach((tex, i) => {
    // Only the top square: an animated texture is a vertical strip of frames.
    const h = Math.min(tex.width, tex.height);
    scratch.width = tex.width;
    scratch.height = h;
    scratchCtx.putImageData(new ImageData(new Uint8ClampedArray(tex.data.subarray(0, tex.width * h * 4)), tex.width, h), 0, 0);

    const x = (i % cols) * slot;
    const y = Math.floor(i / cols) * slot;
    ctx.drawImage(scratch, 0, 0, tex.width, h, x + 1, y + 1, tile, tile);
    // The 1-pixel border: each edge row/column copied outward, then the corners.
    ctx.drawImage(canvas, x + 1, y + 1, tile, 1, x + 1, y, tile, 1);
    ctx.drawImage(canvas, x + 1, y + tile, tile, 1, x + 1, y + tile + 1, tile, 1);
    ctx.drawImage(canvas, x + 1, y, 1, slot, x, y, 1, slot);
    ctx.drawImage(canvas, x + tile, y, 1, slot, x + tile + 1, y, 1, slot);

    tileUvs[i * 4] = (x + 1) / canvas.width;
    tileUvs[i * 4 + 1] = (y + 1) / canvas.height;
    tileUvs[i * 4 + 2] = (x + 1 + tile) / canvas.width;
    tileUvs[i * 4 + 3] = (y + 1 + tile) / canvas.height;
  });

  return { canvas, tileUvs, tilesByBlock };
}

/** The mesher's per-block tile table for one grid's block table (-1 for a block not in the palette). */
export function faceTilesFor(table: string[], atlas: TextureAtlas): Int32Array {
  const out = new Int32Array(table.length * FACE_COUNT).fill(-1);
  table.forEach((blockId, i) => {
    const tiles = atlas.tilesByBlock.get(blockId);
    if (tiles) out.set(tiles, i * FACE_COUNT);
  });
  return out;
}
