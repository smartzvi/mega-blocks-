import { nbt, type NbtTag } from '../../types/nbt';
import type { VoxelGrid } from '../../types/minecraft';
import { writeNbt } from './nbtWriter';
import { gzipBytes } from './gzip';
import { bitsPerEntryFor, packSparseIndices } from './bitpack';
import { DATA_VERSION } from '../blockstate/dataVersion';
import { countVoxels, forEachVoxel } from '../voxel/voxelGrid';
import type { ExportProgressCallback } from './exportProgress';

// Verified against Litemapy (github.com/SmylerMC/litemapy)'s info.py constants, not assumed.
const LITEMATIC_VERSION = 6;
const LITEMATIC_SUBVERSION = 1;

const AIR_ID = 'minecraft:air';

/** Longest side of one litematic region, in cells. Litematica's BlockStates array is dense over a
 *  region's whole volume, so one region spanning a big structure's bounding box needed a
 *  multi-gigabyte array (a village at 16 voxels per block is ~1.2 billion cells). Splitting into
 *  regions of at most 256^3 cells and skipping the empty ones keeps memory proportional to what's
 *  actually built; Litematica loads a multi-region file as one schematic. Anything up to 256 on
 *  every side still exports as the single "Main" region it always did. */
const REGION_EDGE = 256;

const INT32_MAX = 2_147_483_647;

interface RegionBucket {
  tx: number;
  ty: number;
  tz: number;
  count: number;
  /** Filled in the second pass: local cell index, and index into the shared block-id list. */
  cells: Int32Array;
  ids: Uint16Array;
  filled: number;
}

/**
 * Builds the litematic NBT tag tree. Unlike the vanilla structure format, litematica's
 * BlockStates array is dense — every voxel in a region's volume needs a palette entry, including
 * the hollow interior, so air occupies palette index 0.
 *
 * `onWriteProgress`, when given, is called with 0..1 as the three passes below run (counting,
 * placing, then per-region bit-packing — each visits every solid voxel once, so "voxels visited
 * across all three / 3x the total" is a fair proxy for overall progress). Checked every 4096
 * voxels, not every one — same cheap-counter technique cullComposedInterior.ts uses, so reporting
 * adds almost nothing to a multi-million-voxel grid.
 */
export function buildLitematicNbt(grid: VoxelGrid, name = 'Megablock', onWriteProgress?: (fraction: number) => void): NbtTag {
  const { sizeX, sizeY, sizeZ } = grid;
  const totalForProgress = countVoxels(grid) * 3;
  let visited = 0;
  const reportVisit = () => {
    if (onWriteProgress && totalForProgress > 0 && ++visited % 4096 === 0) onWriteProgress(visited / totalForProgress);
  };
  const tilesX = Math.ceil(sizeX / REGION_EDGE);
  const tilesY = Math.ceil(sizeY / REGION_EDGE);
  const tilesZ = Math.ceil(sizeZ / REGION_EDGE);
  const tileIndex = (tx: number, ty: number, tz: number) => (ty * tilesZ + tz) * tilesX + tx;

  // Pass 1: count the voxels in each region and number the distinct block ids.
  const blockIds: string[] = [];
  const blockIndex = new Map<string, number>();
  const buckets = new Map<number, RegionBucket>();
  let totalBlocks = 0;
  forEachVoxel(grid, (x, y, z, blockId) => {
    reportVisit();
    if (!blockIndex.has(blockId)) {
      blockIndex.set(blockId, blockIds.length);
      blockIds.push(blockId);
    }
    const tx = Math.floor(x / REGION_EDGE);
    const ty = Math.floor(y / REGION_EDGE);
    const tz = Math.floor(z / REGION_EDGE);
    const key = tileIndex(tx, ty, tz);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tx, ty, tz, count: 0, cells: new Int32Array(0), ids: new Uint16Array(0), filled: 0 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    totalBlocks++;
  });
  if (blockIds.length > 65535) throw new Error(`Too many distinct blocks (${blockIds.length}) to export as a litematic.`);

  // Every file needs at least one region, even an entirely empty grid.
  if (buckets.size === 0) {
    buckets.set(0, { tx: 0, ty: 0, tz: 0, count: 0, cells: new Int32Array(0), ids: new Uint16Array(0), filled: 0 });
  }

  const regionSize = (bucket: RegionBucket) => ({
    x: Math.min(REGION_EDGE, sizeX - bucket.tx * REGION_EDGE),
    y: Math.min(REGION_EDGE, sizeY - bucket.ty * REGION_EDGE),
    z: Math.min(REGION_EDGE, sizeZ - bucket.tz * REGION_EDGE),
  });

  // Pass 2: place each voxel in its region, at litematica's ind = (y * sizeZ + z) * sizeX + x.
  for (const bucket of buckets.values()) {
    bucket.cells = new Int32Array(bucket.count);
    bucket.ids = new Uint16Array(bucket.count);
  }
  forEachVoxel(grid, (x, y, z, blockId) => {
    reportVisit();
    const bucket = buckets.get(tileIndex(Math.floor(x / REGION_EDGE), Math.floor(y / REGION_EDGE), Math.floor(z / REGION_EDGE)))!;
    const size = regionSize(bucket);
    const lx = x - bucket.tx * REGION_EDGE;
    const ly = y - bucket.ty * REGION_EDGE;
    const lz = z - bucket.tz * REGION_EDGE;
    bucket.cells[bucket.filled] = (ly * size.z + lz) * size.x + lx;
    bucket.ids[bucket.filled] = blockIndex.get(blockId)!;
    bucket.filled++;
  });

  const single = buckets.size === 1 && tilesX * tilesY * tilesZ === 1;
  const regions: Record<string, NbtTag> = {};
  let totalVolume = 0;

  for (const bucket of buckets.values()) {
    const size = regionSize(bucket);
    const volume = size.x * size.y * size.z;
    totalVolume += volume;

    // A palette local to this region (air first) keeps bitsPerEntry small even when the whole
    // structure uses many block types. Ordered by each block's first cell in litematica's scan
    // order, so the file doesn't depend on the order the grid's voxels happen to be stored in.
    const firstCell = new Map<number, number>();
    for (let i = 0; i < bucket.count; i++) {
      const global = bucket.ids[i];
      const seen = firstCell.get(global);
      if (seen === undefined || bucket.cells[i] < seen) firstCell.set(global, bucket.cells[i]);
    }
    const ordered = [...firstCell.entries()].sort((a, b) => a[1] - b[1]).map(([global]) => global);
    const localOf = new Map<number, number>(ordered.map((global, i) => [global, i + 1]));
    const localIds: string[] = [AIR_ID, ...ordered.map((global) => blockIds[global])];
    const values = new Uint16Array(bucket.count);
    for (let i = 0; i < bucket.count; i++) {
      reportVisit();
      values[i] = localOf.get(bucket.ids[i])!;
    }

    const bitsPerEntry = bitsPerEntryFor(localIds.length);
    const blockStates = packSparseIndices(bucket.cells, values, bucket.count, volume, bitsPerEntry);

    const regionName = single ? 'Main' : `Region_${bucket.tx}_${bucket.ty}_${bucket.tz}`;
    regions[regionName] = nbt.compound({
      Position: nbt.compound({ x: nbt.int(bucket.tx * REGION_EDGE), y: nbt.int(bucket.ty * REGION_EDGE), z: nbt.int(bucket.tz * REGION_EDGE) }),
      Size: nbt.compound({ x: nbt.int(size.x), y: nbt.int(size.y), z: nbt.int(size.z) }),
      BlockStatePalette: nbt.list(
        'compound',
        localIds.map((id) => nbt.compound({ Name: nbt.string(id) }))
      ),
      BlockStates: nbt.longArray(blockStates),
      PendingBlockTicks: nbt.list('compound', []),
      PendingFluidTicks: nbt.list('compound', []),
      TileEntities: nbt.list('compound', []),
      Entities: nbt.list('compound', []),
    });
  }

  const now = BigInt(Date.now());
  const metadata = nbt.compound({
    Author: nbt.string(''),
    Description: nbt.string(''),
    Name: nbt.string(name),
    RegionCount: nbt.int(buckets.size),
    TimeCreated: nbt.long(now),
    TimeModified: nbt.long(now),
    TotalBlocks: nbt.int(Math.min(totalBlocks, INT32_MAX)),
    TotalVolume: nbt.int(Math.min(totalVolume, INT32_MAX)),
    EnclosingSize: nbt.compound({ x: nbt.int(sizeX), y: nbt.int(sizeY), z: nbt.int(sizeZ) }),
    PreviewImageData: nbt.intArray([]),
  });

  onWriteProgress?.(1);
  return nbt.compound({
    Version: nbt.int(LITEMATIC_VERSION),
    SubVersion: nbt.int(LITEMATIC_SUBVERSION),
    MinecraftDataVersion: nbt.int(DATA_VERSION),
    Metadata: metadata,
    Regions: nbt.compound(regions),
  });
}

/** Serializes and gzips a voxel grid as a .litematic file, ready to download. `onProgress`, when
 *  given, reports the `write` stage while `buildLitematicNbt` runs (by far the bulk of the time on
 *  a big grid) and the `compress` stage around gzip (which has no sub-progress of its own). */
export function exportLitematic(grid: VoxelGrid, name?: string, onProgress?: ExportProgressCallback): Uint8Array {
  const root = buildLitematicNbt(grid, name, onProgress && ((fraction) => onProgress({ stage: 'write', fraction })));
  onProgress?.({ stage: 'write', fraction: 1 });
  const bytes = writeNbt('', root);
  onProgress?.({ stage: 'compress', fraction: 0 });
  const gzipped = gzipBytes(bytes);
  onProgress?.({ stage: 'compress', fraction: 1 });
  return gzipped;
}
