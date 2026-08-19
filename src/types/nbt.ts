// Minimal write-only NBT tag tree. Values that need true 64-bit precision use bigint.
export type NbtTag =
  | { type: 'byte'; value: number }
  | { type: 'short'; value: number }
  | { type: 'int'; value: number }
  | { type: 'long'; value: bigint }
  | { type: 'float'; value: number }
  | { type: 'double'; value: number }
  | { type: 'byteArray'; value: Int8Array }
  | { type: 'string'; value: string }
  | { type: 'list'; itemType: NbtTag['type']; value: NbtTag[] }
  | { type: 'compound'; value: Record<string, NbtTag> }
  | { type: 'intArray'; value: Int32Array }
  | { type: 'longArray'; value: BigInt64Array };

export const nbt = {
  byte: (value: number): NbtTag => ({ type: 'byte', value }),
  short: (value: number): NbtTag => ({ type: 'short', value }),
  int: (value: number): NbtTag => ({ type: 'int', value }),
  long: (value: bigint): NbtTag => ({ type: 'long', value }),
  float: (value: number): NbtTag => ({ type: 'float', value }),
  double: (value: number): NbtTag => ({ type: 'double', value }),
  byteArray: (value: Int8Array): NbtTag => ({ type: 'byteArray', value }),
  string: (value: string): NbtTag => ({ type: 'string', value }),
  list: (itemType: NbtTag['type'], value: NbtTag[]): NbtTag => ({ type: 'list', itemType, value }),
  compound: (value: Record<string, NbtTag>): NbtTag => ({ type: 'compound', value }),
  intArray: (value: Int32Array | number[]): NbtTag => ({
    type: 'intArray',
    value: value instanceof Int32Array ? value : Int32Array.from(value),
  }),
  longArray: (value: BigInt64Array): NbtTag => ({ type: 'longArray', value }),
};
