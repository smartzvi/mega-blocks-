import { readFileSync, existsSync } from 'node:fs';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { loadArchive, type LoadedArchive } from '../lib/zip/loadArchive';

/**
 * Lets a Vitest test load the REAL uploaded-jar pipeline (loadArchive → real PNG decode → real
 * color matching) in plain Node, instead of needing the browser dev server. Two things stood in
 * the way of that:
 *
 * 1. `decodeTexture.ts` needs a 2D canvas to decode PNG bytes (`OffscreenCanvas`/`createImageBitmap`
 *    — see its own doc), which don't exist in Vitest's default Node environment. `installCanvasPolyfill`
 *    below backs them with `@napi-rs/canvas` (prebuilt native bindings, no node-gyp/Windows build
 *    step) — the exact same `OffscreenCanvas` branch `decodeTexture.ts` already takes inside a real
 *    Web Worker, so this isn't a new, unproven code path.
 * 2. The real jar is deliberately not checked into this repo (30MB+, the user's own file — see
 *    CLAUDE.md). `loadRealArchive` reads it straight off disk via `fs` instead — no need to copy it
 *    into `public/test-fixtures` and delete it afterward the way the old browser-based verification
 *    flow required.
 *
 * A test that needs real jar data should guard on `hasRealJar()` and skip itself if it's false (see
 * any caller of this module for the pattern), so the suite still passes clean on a machine — or in
 * CI — that doesn't have the jar sitting at `MC_JAR_PATH`.
 */

/** Overridable via `MC_JAR_PATH`; falls back to this project's own established convention path
 *  (see CLAUDE.md's "Verifying rendering changes" section and every prior verification session). */
export const REAL_JAR_PATH = process.env.MC_JAR_PATH || 'C:\\Users\\zvika\\Desktop\\1.21.11.jar';

export function hasRealJar(): boolean {
  return existsSync(REAL_JAR_PATH);
}

let polyfilled = false;

/** Idempotent and safe to call from any environment — only patches globals that are genuinely
 *  missing, so it's a no-op under a real browser or a canvas-capable jsdom setup. */
export function installCanvasPolyfill(): void {
  if (polyfilled) return;
  polyfilled = true;

  if (typeof globalThis.OffscreenCanvas === 'undefined') {
    class OffscreenCanvasPolyfill {
      private canvas: Canvas;
      constructor(width: number, height: number) {
        this.canvas = createCanvas(width, height);
      }
      getContext(kind: '2d') {
        return kind === '2d' ? this.canvas.getContext('2d') : null;
      }
    }
    // @ts-expect-error — a deliberately partial polyfill (2d context only, matching what this
    // app's own decodeTexture.ts ever asks for), not the full browser OffscreenCanvas surface.
    globalThis.OffscreenCanvas = OffscreenCanvasPolyfill;
  }

  if (typeof globalThis.FileReader === 'undefined') {
    // JSZip's own Blob/File-reading path (utils.js) is written against the browser FileReader API,
    // and silently no-ops instead of converting the data if FileReader doesn't exist — which is
    // exactly Node's situation (Node's Blob/File are real, but there's no FileReader), and produces
    // a confusing "not a supported JavaScript type" error from deep inside JSZip with no indication
    // the actual cause is a missing global. A minimal readAsArrayBuffer-only polyfill, backed by the
    // Blob it's already handed, is all JSZip's own usage needs.
    class FileReaderPolyfill extends EventTarget {
      result: ArrayBuffer | null = null;
      onload: ((event: { target: { result: ArrayBuffer | null } }) => void) | null = null;
      onerror: ((event: { target: { error: unknown } }) => void) | null = null;
      readAsArrayBuffer(blob: Blob) {
        blob
          .arrayBuffer()
          .then((buf) => {
            this.result = buf;
            this.onload?.({ target: this });
          })
          .catch((error) => this.onerror?.({ target: { error } }));
      }
    }
    // @ts-expect-error — deliberately partial (readAsArrayBuffer only), matching exactly what
    // JSZip's own prepareContent() uses.
    globalThis.FileReader = FileReaderPolyfill;
  }

  if (typeof globalThis.createImageBitmap === 'undefined') {
    // @napi-rs/canvas's `Image` (from loadImage) already exposes width/height and is directly
    // accepted by its own context's drawImage — so the "bitmap" IS the real Image, just with a
    // no-op `close()` added to satisfy decodeTexture.ts's `bitmap.close()` calls (the real
    // ImageBitmap.close() releases GPU memory; nothing here needs releasing).
    globalThis.createImageBitmap = (async (source: Blob) => {
      const bytes = Buffer.from(await source.arrayBuffer());
      const image = await loadImage(bytes);
      (image as unknown as { close: () => void }).close = () => {};
      return image as unknown as ImageBitmap;
    }) as typeof createImageBitmap;
  }
}

let cachedArchive: LoadedArchive | null = null;

/** Loads the real jar's file maps once per process and reuses them — parsing a 30MB zip's central
 *  directory on every test would add up across a file with several tests. Callers still get their
 *  own fresh decode of whatever individual texture/model/blockstate they ask for; only the
 *  Map<string, loader> structure (cheap) is shared. */
export async function loadRealArchive(): Promise<LoadedArchive> {
  if (cachedArchive) return cachedArchive;
  installCanvasPolyfill();
  const bytes = readFileSync(REAL_JAR_PATH);
  const file = new File([bytes as unknown as BlobPart], REAL_JAR_PATH.split(/[\\/]/).pop()!);
  cachedArchive = await loadArchive(file);
  return cachedArchive;
}
