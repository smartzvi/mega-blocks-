import type { BlockTextureSet, FaceTexture } from '../../types/minecraft';

// One data URL per texture, drawn once from the jar's already-decoded pixels. Keyed by the texture
// object itself, so loading a different jar never shows the previous jar's icons.
const cache = new WeakMap<FaceTexture, string>();

function toDataUrl(tex: FaceTexture): string | null {
  const cached = cache.get(tex);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = tex.width;
  // Animated textures are a vertical strip of frames — show the first frame only.
  const h = Math.min(tex.height, tex.width);
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = new ImageData(new Uint8ClampedArray(tex.data.subarray(0, tex.width * h * 4)), tex.width, h);
  ctx.putImageData(image, 0, 0);
  const url = canvas.toDataURL();
  cache.set(tex, url);
  return url;
}

/**
 * A block's real side texture from the user's own jar, drawn pixel-sharp. Nothing from the game is
 * shipped with the app; this only ever draws what the uploaded jar already contained. Falls back to
 * an empty tile when the texture isn't known.
 */
export function BlockIcon({ textures, size = 18 }: { textures: BlockTextureSet | null | undefined; size?: number }) {
  const url = textures ? toDataUrl(textures.north) : null;
  const style = { width: size, height: size };
  if (!url) return <span className="inline-block shrink-0 rounded-[2px] border border-line bg-raised" style={style} aria-hidden="true" />;
  return <img src={url} alt="" aria-hidden="true" className="pixelated shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.4)]" style={style} />;
}
