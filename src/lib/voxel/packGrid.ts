import type { VoxelGrid } from '../../types/minecraft';
import { createVoxelGrid } from './voxelGrid';

/**
 * A VoxelGrid flattened into typed arrays, so it can cross a worker boundary without the cost of
 * cloning a huge Map. Measured on a real 3.47M-voxel structure: receiving that Map from a worker
 * blocked the page for 3.2 s (structured-clone deserialization), which would have cancelled out
 * most of the point of using a worker; typed arrays are handed over by transfer instead, with no
 * copy at all.
 *
 * `keys` are the grid's own packed cell keys (see voxelGrid.ts), shipped as-is — both ends run the
 * same voxelGrid.ts, so nothing is decoded and re-encoded along the way.
 */
export interface PackedVoxelGrid {
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  keys: Float64Array;
  /** Per cell, an index into `table` — a structure has a few hundred distinct block ids at most. */
  ids: Uint16Array;
  table: string[];
}

const MAX_TABLE_SIZE = 65536;

export function packVoxelGrid(grid: VoxelGrid): PackedVoxelGrid {
  const count = grid.voxels.size;
  const keys = new Float64Array(count);
  const ids = new Uint16Array(count);
  const table: string[] = [];
  const indexOf = new Map<string, number>();

  let i = 0;
  for (const [key, blockId] of grid.voxels) {
    let index = indexOf.get(blockId);
    if (index === undefined) {
      index = table.length;
      if (index >= MAX_TABLE_SIZE) throw new Error(`Grid has more than ${MAX_TABLE_SIZE} distinct block ids — can't pack it.`);
      indexOf.set(blockId, index);
      table.push(blockId);
    }
    keys[i] = key;
    ids[i] = index;
    i++;
  }

  return { sizeX: grid.sizeX, sizeY: grid.sizeY, sizeZ: grid.sizeZ, keys, ids, table };
}

/** The buffers to hand to postMessage's transfer list so the arrays move instead of being copied. */
export function transferListOf(packed: PackedVoxelGrid): ArrayBuffer[] {
  return [packed.keys.buffer as ArrayBuffer, packed.ids.buffer as ArrayBuffer];
}

const defaultYield = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export interface UnpackOptions {
  /** Cells rebuilt per slice before handing control back to the browser. */
  chunkSize?: number;
  /** Called after each slice with the fraction done, 0..1. */
  onProgress?: (fraction: number) => void;
  /** How to hand control back to the browser between slices; tests substitute their own. */
  yieldToBrowser?: () => Promise<void>;
}

/** Sized so a slice stays comfortably under one frame-ish budget (measured 25-70 ms in a real
 *  page; 150k cells per slice ran 60-170 ms), keeping the page repainting while a big grid rebuilds. */
export const DEFAULT_UNPACK_CHUNK = 60_000;

/**
 * Rebuilds a VoxelGrid from its packed form in small slices, yielding to the browser between them
 * so a multi-million-cell grid never freezes the page while it is put back together.
 */
export async function unpackVoxelGrid(packed: PackedVoxelGrid, options: UnpackOptions = {}): Promise<VoxelGrid> {
  const { chunkSize = DEFAULT_UNPACK_CHUNK, onProgress, yieldToBrowser = defaultYield } = options;
  const grid = createVoxelGrid(packed.sizeX, packed.sizeY, packed.sizeZ);
  const { keys, ids, table } = packed;
  const total = keys.length;

  for (let start = 0; start < total; start += chunkSize) {
    const end = Math.min(total, start + chunkSize);
    for (let i = start; i < end; i++) grid.voxels.set(keys[i], table[ids[i]]);
    onProgress?.(end / total);
    if (end < total) await yieldToBrowser();
  }
  if (total === 0) onProgress?.(1);

  return grid;
}
