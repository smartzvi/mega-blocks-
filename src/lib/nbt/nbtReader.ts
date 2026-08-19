import type { NbtTag } from '../../types/nbt';

const TAG_TYPE_ID: Record<NbtTag['type'], number> = {
  byte: 1,
  short: 2,
  int: 3,
  long: 4,
  float: 5,
  double: 6,
  byteArray: 7,
  string: 8,
  list: 9,
  compound: 10,
  intArray: 11,
  longArray: 12,
};

const TAG_TYPE_NAME = Object.fromEntries(
  Object.entries(TAG_TYPE_ID).map(([name, id]) => [id, name])
) as Record<number, NbtTag['type']>;

/** Growable big-endian binary reader — the inverse of nbtWriter.ts's ByteWriter. */
class ByteReader {
  private bytes: Uint8Array;
  private view: DataView;
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  readByte(): number {
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readUByte(): number {
    const v = this.view.getUint8(this.offset);
    this.offset += 1;
    return v;
  }

  readShort(): number {
    const v = this.view.getInt16(this.offset, false);
    this.offset += 2;
    return v;
  }

  readInt(): number {
    const v = this.view.getInt32(this.offset, false);
    this.offset += 4;
    return v;
  }

  readLong(): bigint {
    const v = this.view.getBigInt64(this.offset, false);
    this.offset += 8;
    return v;
  }

  readFloat(): number {
    const v = this.view.getFloat32(this.offset, false);
    this.offset += 4;
    return v;
  }

  readDouble(): number {
    const v = this.view.getFloat64(this.offset, false);
    this.offset += 8;
    return v;
  }

  readBytes(length: number): Uint8Array {
    const out = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  readUtf8String(): string {
    const length = this.view.getUint16(this.offset, false);
    this.offset += 2;
    const bytes = this.readBytes(length);
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function readPayload(reader: ByteReader, typeId: number): NbtTag {
  switch (typeId) {
    case 1:
      return { type: 'byte', value: reader.readByte() };
    case 2:
      return { type: 'short', value: reader.readShort() };
    case 3:
      return { type: 'int', value: reader.readInt() };
    case 4:
      return { type: 'long', value: reader.readLong() };
    case 5:
      return { type: 'float', value: reader.readFloat() };
    case 6:
      return { type: 'double', value: reader.readDouble() };
    case 7: {
      const length = reader.readInt();
      return { type: 'byteArray', value: new Int8Array(reader.readBytes(length)) };
    }
    case 8:
      return { type: 'string', value: reader.readUtf8String() };
    case 9: {
      // Real-world empty lists commonly use TAG_End (0) as the item type; NbtTag's itemType
      // field still needs some valid tag-type name even though nothing ever reads it when
      // value.length === 0, so fall back to an arbitrary placeholder in that case.
      const itemTypeId = reader.readUByte();
      const length = reader.readInt();
      const value: NbtTag[] = [];
      for (let i = 0; i < length; i++) value.push(readPayload(reader, itemTypeId));
      return { type: 'list', itemType: TAG_TYPE_NAME[itemTypeId] ?? 'byte', value };
    }
    case 10: {
      const value: Record<string, NbtTag> = {};
      for (;;) {
        const childTypeId = reader.readUByte();
        if (childTypeId === 0) break; // TAG_End closes the compound, no length prefix
        const name = reader.readUtf8String();
        value[name] = readPayload(reader, childTypeId);
      }
      return { type: 'compound', value };
    }
    case 11: {
      const length = reader.readInt();
      const value = new Int32Array(length);
      for (let i = 0; i < length; i++) value[i] = reader.readInt();
      return { type: 'intArray', value };
    }
    case 12: {
      const length = reader.readInt();
      const value = new BigInt64Array(length);
      for (let i = 0; i < length; i++) value[i] = reader.readLong();
      return { type: 'longArray', value };
    }
    default:
      throw new Error(`Unrecognized NBT tag type id ${typeId} — not a valid NBT file, or the file is corrupt/truncated.`);
  }
}

/**
 * Parses uncompressed big-endian NBT bytes (the exact inverse of writeNbt in nbtWriter.ts) into
 * the root tag tree, discarding the root's name (real structure/litematic files always use an
 * empty root name in practice). The reader itself is fully schema-agnostic — it parses any valid
 * NBT tree, including block-entity/tile-entity data (chest contents, sign text) whose shape this
 * app never interprets; schema-specific field extraction (`size`, `palette`, `Regions`, ...)
 * happens in the structure-parsing modules that consume this tag tree, not here.
 */
export function readNbt(bytes: Uint8Array): NbtTag {
  const reader = new ByteReader(bytes);
  const rootTypeId = reader.readUByte();
  reader.readUtf8String(); // root name, unused
  return readPayload(reader, rootTypeId);
}
