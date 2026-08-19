/**
 * Litematica's BlockStates long-array packing: palette indices are packed back-to-back with
 * NO per-long padding, so an entry can straddle two adjacent 64-bit longs (unlike vanilla's
 * post-1.16 padded chunk-section packing). Verified against Litemapy's LitematicaBitArray
 * (github.com/SmylerMC/litemapy) rather than trusted from memory, since a plausible-but-wrong
 * packing here produces a file that opens without error but scrambles block positions.
 */
export function packLongArray(indices: number[], bitsPerEntry: number): BigInt64Array {
  const totalBits = indices.length * bitsPerEntry;
  const numLongs = Math.ceil(totalBits / 64) || 1;
  const longs = new Array<bigint>(numLongs).fill(0n);
  const mask = (1n << BigInt(bitsPerEntry)) - 1n;

  for (let i = 0; i < indices.length; i++) {
    const value = BigInt(indices[i]) & mask;
    const bitOffset = i * bitsPerEntry;
    const longIndex = bitOffset >> 6; // Math.floor(bitOffset / 64)
    const bitInLong = bitOffset & 63; // bitOffset % 64

    longs[longIndex] |= value << BigInt(bitInLong);

    if (bitInLong + bitsPerEntry > 64) {
      const bitsWrittenInFirst = 64 - bitInLong;
      longs[longIndex + 1] |= value >> BigInt(bitsWrittenInFirst);
    }
  }

  return BigInt64Array.from(longs.map((v) => BigInt.asIntN(64, v)));
}

export function bitsPerEntryFor(paletteSize: number): number {
  return Math.max(2, Math.ceil(Math.log2(paletteSize)));
}

/**
 * Inverse of packLongArray: unpacks `count` palette indices from litematica's continuous
 * (unpadded, straddling-allowed) bit-packed long array. `BigInt.asUintN(64, ...)` is required
 * before shifting each long — BigInt64Array entries are signed, and a naive `>>` on a negative
 * bigint in JS sign-extends (fills with 1 bits) rather than zero-filling, which would corrupt the
 * high bits being OR'd in from the next long.
 */
export function unpackLongArray(longs: BigInt64Array, bitsPerEntry: number, count: number): number[] {
  const mask = (1n << BigInt(bitsPerEntry)) - 1n;
  const indices: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const bitOffset = i * bitsPerEntry;
    const longIndex = bitOffset >> 6;
    const bitInLong = bitOffset & 63;

    const low = BigInt.asUintN(64, longs[longIndex]);
    let value = low >> BigInt(bitInLong);

    if (bitInLong + bitsPerEntry > 64 && longIndex + 1 < longs.length) {
      const high = BigInt.asUintN(64, longs[longIndex + 1]);
      const bitsWrittenInFirst = 64 - bitInLong;
      value |= high << BigInt(bitsWrittenInFirst);
    }

    indices[i] = Number(value & mask);
  }

  return indices;
}
