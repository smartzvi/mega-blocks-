import { describe, expect, it } from 'vitest';
import { nbt, type NbtTag } from '../../types/nbt';
import { writeNbt } from './nbtWriter';
import { readNbt } from './nbtReader';

function roundTrip(tag: NbtTag): NbtTag {
  return readNbt(writeNbt('', tag));
}

describe('readNbt', () => {
  it('round-trips every primitive tag type through the real writer', () => {
    const root = nbt.compound({
      aByte: nbt.byte(-1), // 0xff, must sign-extend back to -1, not read as 255
      aShort: nbt.short(-12345),
      anInt: nbt.int(-2147483648),
      aLong: nbt.long(-9007199254740993n), // beyond safe-integer range, needs real bigint precision
      aFloat: nbt.float(1.5),
      aDouble: nbt.double(3.14159265358979),
      aString: nbt.string('minecraft:oak_planks'),
      aByteArray: nbt.byteArray(Int8Array.from([-1, 0, 1, 127, -128])),
      anIntArray: nbt.intArray([1, -2, 3]),
      aLongArray: nbt.longArray(BigInt64Array.from([1n, -2n, 9007199254740993n])),
    });

    const result = roundTrip(root) as Extract<NbtTag, { type: 'compound' }>;
    expect(result.type).toBe('compound');
    expect(result.value.aByte).toEqual({ type: 'byte', value: -1 });
    expect(result.value.aShort).toEqual({ type: 'short', value: -12345 });
    expect(result.value.anInt).toEqual({ type: 'int', value: -2147483648 });
    expect(result.value.aLong).toEqual({ type: 'long', value: -9007199254740993n });
    expect((result.value.aFloat as { value: number }).value).toBeCloseTo(1.5, 5);
    expect((result.value.aDouble as { value: number }).value).toBeCloseTo(3.14159265358979, 10);
    expect(result.value.aString).toEqual({ type: 'string', value: 'minecraft:oak_planks' });
    expect(Array.from((result.value.aByteArray as { value: Int8Array }).value)).toEqual([-1, 0, 1, 127, -128]);
    expect(Array.from((result.value.anIntArray as { value: Int32Array }).value)).toEqual([1, -2, 3]);
    expect(Array.from((result.value.aLongArray as { value: BigInt64Array }).value)).toEqual([1n, -2n, 9007199254740993n]);
  });

  it('round-trips a nested compound-in-list-in-compound shape (mirrors a real structure palette)', () => {
    const root = nbt.compound({
      palette: nbt.list('compound', [
        nbt.compound({ Name: nbt.string('minecraft:air') }),
        nbt.compound({ Name: nbt.string('minecraft:stone') }),
      ]),
      size: nbt.list('int', [nbt.int(2), nbt.int(3), nbt.int(4)]),
    });

    const result = roundTrip(root) as Extract<NbtTag, { type: 'compound' }>;
    const palette = result.value.palette as Extract<NbtTag, { type: 'list' }>;
    expect(palette.value).toHaveLength(2);
    expect((palette.value[0] as Extract<NbtTag, { type: 'compound' }>).value.Name).toEqual({
      type: 'string',
      value: 'minecraft:air',
    });
    const size = result.value.size as Extract<NbtTag, { type: 'list' }>;
    expect(size.value.map((v) => (v as { value: number }).value)).toEqual([2, 3, 4]);
  });

  it('round-trips an empty compound (immediate TAG_End)', () => {
    const root = nbt.compound({ empty: nbt.compound({}) });
    const result = roundTrip(root) as Extract<NbtTag, { type: 'compound' }>;
    expect((result.value.empty as Extract<NbtTag, { type: 'compound' }>).value).toEqual({});
  });

  it('reads a real-world empty list whose item type byte is TAG_End (0), not a real tag type', () => {
    // Hand-built raw bytes: a root compound with one entry, "items", which is an empty list with
    // an item-type byte of 0 — real NBT files (e.g. an empty TileEntities/Entities list) commonly
    // do this, but this app's own writer never produces it (it always writes the caller's declared
    // itemType even for a zero-length list), so a self-round-trip test can't exercise this case.
    const bytes = new Uint8Array([
      0x0a, // TAG_Compound (root)
      0x00, 0x00, // root name "" (empty)
      0x09, // TAG_List
      0x00, 0x05, 0x69, 0x74, 0x65, 0x6d, 0x73, // name "items" (5 chars)
      0x00, // item type = TAG_End (0) — the real-world quirk being tested
      0x00, 0x00, 0x00, 0x00, // length = 0
      0x00, // TAG_End closes root compound
    ]);

    const result = readNbt(bytes) as Extract<NbtTag, { type: 'compound' }>;
    const items = result.value.items as Extract<NbtTag, { type: 'list' }>;
    expect(items.type).toBe('list');
    expect(items.value).toEqual([]);
  });
});
