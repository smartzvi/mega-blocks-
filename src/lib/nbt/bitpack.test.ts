import { describe, expect, it } from 'vitest';
import { bitsPerEntryFor, packLongArray, unpackLongArray } from './bitpack';

// Independently-written (not copy-pasted from bitpack.ts) reference unpacker, mirroring the
// same continuous-packing scheme, used to cross-check packLongArray from the opposite direction.
function referenceUnpack(longs: BigInt64Array, bits: number, count: number): number[] {
  const mask = (1n << BigInt(bits)) - 1n;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const bitOffset = i * bits;
    const longIndex = Math.floor(bitOffset / 64);
    const bitInLong = bitOffset % 64;
    const low = BigInt.asUintN(64, longs[longIndex]);
    let value = low >> BigInt(bitInLong);
    if (bitInLong + bits > 64) {
      const high = BigInt.asUintN(64, longs[longIndex + 1]);
      value |= high << BigInt(64 - bitInLong);
    }
    out.push(Number(value & mask));
  }
  return out;
}

describe('bitsPerEntryFor', () => {
  it('is at least 2, and grows with palette size', () => {
    expect(bitsPerEntryFor(1)).toBe(2);
    expect(bitsPerEntryFor(2)).toBe(2);
    expect(bitsPerEntryFor(4)).toBe(2);
    expect(bitsPerEntryFor(5)).toBe(3);
    expect(bitsPerEntryFor(256)).toBe(8);
    expect(bitsPerEntryFor(257)).toBe(9);
  });
});

describe('packLongArray', () => {
  it('matches a hand-verified single-long case: indices [1,2,3,0] at 2 bits', () => {
    // value=1 at bit0, value=2 at bit2, value=3 at bit4, value=0 at bit6:
    // 1 | (2<<2) | (3<<4) | (0<<6) = 1 | 8 | 48 | 0 = 57
    const result = packLongArray([1, 2, 3, 0], 2);
    expect(Array.from(result)).toEqual([57n]);
  });

  it('matches a hand-verified boundary-straddling case (5 bits, entry spans two longs)', () => {
    // 13 entries of 5 bits each: entry index 12 starts at bit offset 60, so its top bit
    // spills into the next long. Computed independently via a from-scratch reference script.
    const indices = new Array(13).fill(0);
    indices[12] = 27; // 0b11011
    const result = packLongArray(indices, 5);
    expect(Array.from(result)).toEqual([-5764607523034234880n, 1n]);
  });

  it('round-trips arbitrary palette indices through an independently-written unpacker', () => {
    const bits = 9;
    const indices = Array.from({ length: 200 }, () => Math.floor(Math.random() * 300));
    const packed = packLongArray(indices, bits);
    const unpacked = referenceUnpack(packed, bits, indices.length);
    expect(unpacked).toEqual(indices);
  });

  it('handles the minimum case of a single entry needing 2 bits', () => {
    const result = packLongArray([3], 2);
    expect(Array.from(result)).toEqual([3n]);
  });
});

describe('unpackLongArray', () => {
  it('matches the hand-verified single-long case in reverse: [1,2,3,0] at 2 bits', () => {
    const result = unpackLongArray(BigInt64Array.from([57n]), 2, 4);
    expect(result).toEqual([1, 2, 3, 0]);
  });

  it('matches the hand-verified boundary-straddling case in reverse (5 bits, entry spans two longs)', () => {
    const indices = new Array(13).fill(0);
    indices[12] = 27;
    const packed = BigInt64Array.from([-5764607523034234880n, 1n]);
    expect(unpackLongArray(packed, 5, 13)).toEqual(indices);
  });

  it('round-trips through packLongArray for arbitrary indices, matching the independent reference unpacker', () => {
    const bits = 9;
    const indices = Array.from({ length: 200 }, () => Math.floor(Math.random() * 300));
    const packed = packLongArray(indices, bits);
    expect(unpackLongArray(packed, bits, indices.length)).toEqual(indices);
    expect(unpackLongArray(packed, bits, indices.length)).toEqual(referenceUnpack(packed, bits, indices.length));
  });

  it('handles bitsPerEntry values that pack multiple entries per long with no straddling (8 bits)', () => {
    const indices = [255, 0, 128, 64, 1, 2, 3, 4];
    const packed = packLongArray(indices, 8);
    expect(unpackLongArray(packed, 8, indices.length)).toEqual(indices);
  });
});
