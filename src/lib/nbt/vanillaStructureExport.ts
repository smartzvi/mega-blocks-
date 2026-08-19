import { nbt, type NbtTag } from '../../types/nbt';
import type { VoxelGrid } from '../../types/minecraft';
import { writeNbt } from './nbtWriter';
import { gzipBytes } from './gzip';
import { DATA_VERSION } from '../blockstate/dataVersion';

/** Builds the vanilla structure-block NBT tag tree (the /structure load format) from a voxel grid. */
export function buildVanillaStructureNbt(grid: VoxelGrid): NbtTag {
  const paletteIds: string[] = [];
  const paletteIndex = new Map<string, number>();
  const blockTags: NbtTag[] = [];

  for (let x = 0; x < grid.sizeX; x++) {
    for (let y = 0; y < grid.sizeY; y++) {
      for (let z = 0; z < grid.sizeZ; z++) {
        const blockId = grid.voxels[x][y][z];
        if (!blockId) continue;

        let index = paletteIndex.get(blockId);
        if (index === undefined) {
          index = paletteIds.length;
          paletteIds.push(blockId);
          paletteIndex.set(blockId, index);
        }

        blockTags.push(
          nbt.compound({
            state: nbt.int(index),
            pos: nbt.list('int', [nbt.int(x), nbt.int(y), nbt.int(z)]),
          })
        );
      }
    }
  }

  const paletteTags = paletteIds.map((id) => nbt.compound({ Name: nbt.string(id) }));

  return nbt.compound({
    DataVersion: nbt.int(DATA_VERSION),
    size: nbt.list('int', [nbt.int(grid.sizeX), nbt.int(grid.sizeY), nbt.int(grid.sizeZ)]),
    entities: nbt.list('compound', []),
    blocks: nbt.list('compound', blockTags),
    palette: nbt.list('compound', paletteTags),
  });
}

/** Serializes and gzips a voxel grid as a vanilla structure .nbt file, ready to download. */
export function exportVanillaStructureNbt(grid: VoxelGrid): Uint8Array {
  const root = buildVanillaStructureNbt(grid);
  const bytes = writeNbt('', root);
  return gzipBytes(bytes);
}
