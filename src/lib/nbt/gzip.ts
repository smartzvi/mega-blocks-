import * as pako from 'pako';

export function gzipBytes(data: Uint8Array): Uint8Array {
  return pako.gzip(data);
}

export function ungzipBytes(data: Uint8Array): Uint8Array {
  return pako.ungzip(data);
}

/** Gzip's magic bytes (RFC 1952) — both the jar's bundled structures and real /structure-save
 *  output are gzipped, but a custom upload might not be, so callers detect before decompressing. */
export function looksGzipped(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}
