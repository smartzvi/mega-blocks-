import type { FaceTexture } from '../../types/minecraft';

const TILE_SIZE = 16;

/** A 2D drawing surface that works both on the page and inside a Web Worker: a worker has no
 *  `document`, so it uses OffscreenCanvas, which has the same drawImage/getImageData API. */
function createContext2d(width: number, height: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext('2d')!;
  }
  return new OffscreenCanvas(width, height).getContext('2d')!;
}

/** Decodes PNG bytes and returns only the top-left 16x16 tile (first animation frame). Returns
 *  null (with a console warning) for anything that isn't a clean 16-wide, 16-multiple-tall PNG. */
export async function decodeTextureTile(bytes: Uint8Array, debugKey: string): Promise<FaceTexture | null> {
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);

  if (bitmap.width !== TILE_SIZE || bitmap.height < TILE_SIZE || bitmap.height % TILE_SIZE !== 0) {
    console.warn(
      `Skipping texture "${debugKey}": expected a 16-wide PNG with height a multiple of 16, got ${bitmap.width}x${bitmap.height} (custom-resolution packs are not supported in v1).`
    );
    bitmap.close();
    return null;
  }

  const ctx = createContext2d(TILE_SIZE, TILE_SIZE);
  // Only the first (top) frame of an animated strip is used as the static representative texture.
  ctx.drawImage(bitmap, 0, 0, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  return { width: TILE_SIZE, height: TILE_SIZE, data: imageData.data };
}

/** Looks up and decodes a single raw texture file by its blockTextureFiles key (e.g.
 *  "cauldron_side"). Returns null if the key isn't present or the file fails to decode. */
export async function loadAndDecodeTexture(
  key: string,
  blockTextureFiles: Map<string, () => Promise<Uint8Array>>
): Promise<FaceTexture | null> {
  const loader = blockTextureFiles.get(key);
  if (!loader) return null;
  const bytes = await loader();
  return decodeTextureTile(bytes, key);
}

/** Decodes PNG bytes at their own native size, no 16-wide assumption — entity textures (chest,
 *  shulker box, ...) are 64x64 atlases, not the single-tile 16x16 block textures decodeTextureTile
 *  expects, so forcing that crop silently discarded them entirely (only the first 16x16 corner
 *  survived the dimension check, which fails outright for anything that isn't already 16 wide). */
async function decodeTextureNative(bytes: Uint8Array): Promise<FaceTexture> {
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);

  const { width, height } = bitmap;
  const ctx = createContext2d(width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, width, height);
  return { width, height, data: imageData.data };
}

/** Looks up and decodes a single raw entity texture file (e.g. "chest/normal") at its native
 *  resolution. Returns null if the key isn't present. */
export async function loadAndDecodeEntityTexture(
  key: string,
  entityTextureFiles: Map<string, () => Promise<Uint8Array>>
): Promise<FaceTexture | null> {
  const loader = entityTextureFiles.get(key);
  if (!loader) return null;
  const bytes = await loader();
  return decodeTextureNative(bytes);
}
