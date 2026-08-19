import { nbt, type NbtTag } from '../../types/nbt';
import type { VoxelGrid } from '../../types/minecraft';
import { writeNbt } from './nbtWriter';
import { gzipBytes } from './gzip';
import { bitsPerEntryFor, packLongArray } from './bitpack';
import { DATA_VERSION } from '../blockstate/dataVersion';

// Verified against Litemapy (github.com/SmylerMC/litemapy)'s info.py constants, not assumed.
const LITEMATIC_VERSION = 6;
const LITEMATIC_SUBVERSION = 1;

const AIR_ID = 'minecraft:air';

/**
 * Builds the litematic NBT tag tree. Unlike the vanilla structure format, litematica's
 * BlockStates array is dense — every voxel in the region volume needs a palette entry,
 * including the hollow interior, so air occupies palette index 0.
 */
export function buildLitematicNbt(grid: VoxelGrid, name = 'Megablock'): NbtTag {
  const { sizeX, sizeY, sizeZ } = grid;

  const paletteIds: string[] = [AIR_ID];
  const paletteIndex = new Map<string, number>([[AIR_ID, 0]]);
  const indices: number[] = [];
  let totalBlocks = 0;

  // Iteration order y, z, x (x fastest) so the pushed sequence matches litematica's
  // ind = (y * sizeZ + z) * sizeX + x indexing exactly.
  for (let y = 0; y < sizeY; y++) {
    for (let z = 0; z < sizeZ; z++) {
      for (let x = 0; x < sizeX; x++) {
        const blockId = grid.voxels[x][y][z] ?? AIR_ID;
        let index = paletteIndex.get(blockId);
        if (index === undefined) {
          index = paletteIds.length;
          paletteIds.push(blockId);
          paletteIndex.set(blockId, index);
        }
        indices.push(index);
        if (blockId !== AIR_ID) totalBlocks++;
      }
    }
  }

  const bitsPerEntry = bitsPerEntryFor(paletteIds.length);
  const blockStates = packLongArray(indices, bitsPerEntry);
  const paletteTags = paletteIds.map((id) => nbt.compound({ Name: nbt.string(id) }));
  const now = BigInt(Date.now());

  const region = nbt.compound({
    Position: nbt.compound({ x: nbt.int(0), y: nbt.int(0), z: nbt.int(0) }),
    Size: nbt.compound({ x: nbt.int(sizeX), y: nbt.int(sizeY), z: nbt.int(sizeZ) }),
    BlockStatePalette: nbt.list('compound', paletteTags),
    BlockStates: nbt.longArray(blockStates),
    PendingBlockTicks: nbt.list('compound', []),
    PendingFluidTicks: nbt.list('compound', []),
    TileEntities: nbt.list('compound', []),
    Entities: nbt.list('compound', []),
  });

  const metadata = nbt.compound({
    Author: nbt.string(''),
    Description: nbt.string(''),
    Name: nbt.string(name),
    RegionCount: nbt.int(1),
    TimeCreated: nbt.long(now),
    TimeModified: nbt.long(now),
    TotalBlocks: nbt.int(totalBlocks),
    TotalVolume: nbt.int(sizeX * sizeY * sizeZ),
    EnclosingSize: nbt.compound({ x: nbt.int(sizeX), y: nbt.int(sizeY), z: nbt.int(sizeZ) }),
    PreviewImageData: nbt.intArray([]),
  });

  return nbt.compound({
    Version: nbt.int(LITEMATIC_VERSION),
    SubVersion: nbt.int(LITEMATIC_SUBVERSION),
    MinecraftDataVersion: nbt.int(DATA_VERSION),
    Metadata: metadata,
    Regions: nbt.compound({ Main: region }),
  });
}

/** Serializes and gzips a voxel grid as a .litematic file, ready to download. */
export function exportLitematic(grid: VoxelGrid, name?: string): Uint8Array {
  const root = buildLitematicNbt(grid, name);
  const bytes = writeNbt('', root);
  return gzipBytes(bytes);
}
