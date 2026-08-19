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

/** Growable big-endian binary writer, used to serialize an NBT tag tree. */
class ByteWriter {
  private chunks: Uint8Array[] = [];

  private push(bytes: Uint8Array) {
    this.chunks.push(bytes);
  }

  writeByte(value: number) {
    this.push(new Uint8Array([value & 0xff]));
  }

  writeShort(value: number) {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setInt16(0, value, false);
    this.push(new Uint8Array(buf));
  }

  writeUShort(value: number) {
    const buf = new ArrayBuffer(2);
    new DataView(buf).setUint16(0, value, false);
    this.push(new Uint8Array(buf));
  }

  writeInt(value: number) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, false);
    this.push(new Uint8Array(buf));
  }

  writeLong(value: bigint) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigInt64(0, BigInt.asIntN(64, value), false);
    this.push(new Uint8Array(buf));
  }

  writeFloat(value: number) {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, false);
    this.push(new Uint8Array(buf));
  }

  writeDouble(value: number) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, value, false);
    this.push(new Uint8Array(buf));
  }

  writeBytes(bytes: Uint8Array) {
    this.push(bytes);
  }

  writeUtf8String(value: string) {
    const utf8 = new TextEncoder().encode(value);
    this.writeUShort(utf8.length);
    this.push(utf8);
  }

  toUint8Array(): Uint8Array {
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

function writePayload(writer: ByteWriter, tag: NbtTag) {
  switch (tag.type) {
    case 'byte':
      writer.writeByte(tag.value);
      break;
    case 'short':
      writer.writeShort(tag.value);
      break;
    case 'int':
      writer.writeInt(tag.value);
      break;
    case 'long':
      writer.writeLong(tag.value);
      break;
    case 'float':
      writer.writeFloat(tag.value);
      break;
    case 'double':
      writer.writeDouble(tag.value);
      break;
    case 'byteArray':
      writer.writeInt(tag.value.length);
      writer.writeBytes(new Uint8Array(tag.value.buffer, tag.value.byteOffset, tag.value.length));
      break;
    case 'string':
      writer.writeUtf8String(tag.value);
      break;
    case 'list':
      writer.writeByte(TAG_TYPE_ID[tag.itemType]);
      writer.writeInt(tag.value.length);
      for (const item of tag.value) writePayload(writer, item);
      break;
    case 'compound':
      for (const [name, child] of Object.entries(tag.value)) {
        writer.writeByte(TAG_TYPE_ID[child.type]);
        writer.writeUtf8String(name);
        writePayload(writer, child);
      }
      writer.writeByte(0); // TAG_End
      break;
    case 'intArray':
      writer.writeInt(tag.value.length);
      for (const v of tag.value) writer.writeInt(v);
      break;
    case 'longArray':
      writer.writeInt(tag.value.length);
      for (const v of tag.value) writer.writeLong(v);
      break;
  }
}

/** Serializes a named root compound tag into uncompressed big-endian NBT bytes. */
export function writeNbt(rootName: string, root: NbtTag): Uint8Array {
  const writer = new ByteWriter();
  writer.writeByte(TAG_TYPE_ID[root.type]);
  writer.writeUtf8String(rootName);
  writePayload(writer, root);
  return writer.toUint8Array();
}
