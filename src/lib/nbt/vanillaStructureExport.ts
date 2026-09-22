import { nbt } from '../../types/nbt';
import type { VoxelGrid } from '../../types/minecraft';
import { writeNbt } from './nbtWriter';
import { gzipBytes } from './gzip';
import { DATA_VERSION } from '../blockstate/dataVersion';
import { countVoxels, forEachVoxel } from '../voxel/voxelGrid';
import type { ExportProgressCallback } from './exportProgress';

const TAG_END = 0;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;

/** One `blocks` entry is always the same shape — { state: int, pos: [x, y, z] } — so its size is
 *  fixed: state tag (1 type + 2 name length + 5 "state" + 4 value) + pos tag (1 + 2 + 3 "pos" + 1
 *  item type + 4 length + 12 values) + 1 end byte. */
const BLOCK_ENTRY_BYTES = 12 + 23 + 1;

/**
 * Builds the vanilla structure-block NBT (the /structure load format), uncompressed.
 *
 * The `blocks` list is written straight into one buffer. Building a tag object per block and
 * serializing each field as its own tiny chunk cost ~7 µs and a lot of memory per block, so a
 * multi-million-block structure took half a minute and could run the tab out of memory; this is
 * one pass over the voxels. The small header and palette still go through the ordinary NBT writer.
 *
 * `onProgress`, when given, is called with 0..1 as that one pass runs, checked every 4096 blocks
 * rather than every one — same cheap-counter technique cullComposedInterior.ts uses.
 */
export function buildVanillaStructureBytes(grid: VoxelGrid, onProgress?: (fraction: number) => void): Uint8Array {
  const paletteIds: string[] = [];
  const paletteIndex = new Map<string, number>();
  const count = countVoxels(grid);

  const blocks = new Uint8Array(count * BLOCK_ENTRY_BYTES);
  const view = new DataView(blocks.buffer);
  let at = 0;
  let visited = 0;
  forEachVoxel(grid, (x, y, z, blockId) => {
    if (onProgress && count > 0 && ++visited % 4096 === 0) onProgress(visited / count);
    let index = paletteIndex.get(blockId);
    if (index === undefined) {
      index = paletteIds.length;
      paletteIds.push(blockId);
      paletteIndex.set(blockId, index);
    }
    blocks[at] = 3; // int "state"
    blocks[at + 2] = 5;
    blocks[at + 3] = 0x73; // s
    blocks[at + 4] = 0x74; // t
    blocks[at + 5] = 0x61; // a
    blocks[at + 6] = 0x74; // t
    blocks[at + 7] = 0x65; // e
    view.setInt32(at + 8, index, false);
    at += 12;
    blocks[at] = TAG_LIST; // list "pos"
    blocks[at + 2] = 3;
    blocks[at + 3] = 0x70; // p
    blocks[at + 4] = 0x6f; // o
    blocks[at + 5] = 0x73; // s
    blocks[at + 6] = 3; // of ints
    view.setInt32(at + 7, 3, false);
    view.setInt32(at + 11, x, false);
    view.setInt32(at + 15, y, false);
    view.setInt32(at + 19, z, false);
    at += 23;
    blocks[at++] = TAG_END;
  });
  onProgress?.(1);

  // Root compound, in the order the game writes it: DataVersion, size, entities, blocks, palette.
  const head = writeNbt(
    '',
    nbt.compound({
      DataVersion: nbt.int(DATA_VERSION),
      size: nbt.list('int', [nbt.int(grid.sizeX), nbt.int(grid.sizeY), nbt.int(grid.sizeZ)]),
      entities: nbt.list('compound', []),
    })
  ).slice(0, -1); // drop the compound's closing TAG_End — `blocks` and `palette` follow

  const blocksHeader = new Uint8Array(1 + 2 + 6 + 1 + 4);
  const headerView = new DataView(blocksHeader.buffer);
  blocksHeader[0] = TAG_LIST;
  headerView.setUint16(1, 6, false);
  blocksHeader.set(new TextEncoder().encode('blocks'), 3);
  blocksHeader[9] = TAG_COMPOUND;
  headerView.setInt32(10, count, false);

  // Serialized alone, a compound is: 1 type byte + 2 name-length bytes (empty root name) + its
  // fields + TAG_End — the fields and the closing TAG_End are exactly what belongs after `blocks`.
  const tail = writeNbt(
    '',
    nbt.compound({ palette: nbt.list('compound', paletteIds.map((id) => nbt.compound({ Name: nbt.string(id) }))) })
  ).slice(3);

  const out = new Uint8Array(head.length + blocksHeader.length + blocks.length + tail.length);
  out.set(head, 0);
  out.set(blocksHeader, head.length);
  out.set(blocks, head.length + blocksHeader.length);
  out.set(tail, head.length + blocksHeader.length + blocks.length);
  return out;
}

/** Serializes and gzips a voxel grid as a vanilla structure .nbt file, ready to download.
 *  `onProgress`, when given, reports the `write` stage while `buildVanillaStructureBytes` runs (by
 *  far the bulk of the time on a big grid) and the `compress` stage around gzip. */
export function exportVanillaStructureNbt(grid: VoxelGrid, onProgress?: ExportProgressCallback): Uint8Array {
  const bytes = buildVanillaStructureBytes(grid, onProgress && ((fraction) => onProgress({ stage: 'write', fraction })));
  onProgress?.({ stage: 'compress', fraction: 0 });
  const gzipped = gzipBytes(bytes);
  onProgress?.({ stage: 'compress', fraction: 1 });
  return gzipped;
}
