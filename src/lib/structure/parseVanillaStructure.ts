import type { NbtTag } from '../../types/nbt';
import { encodeBlockstateKey } from './blockstateKey';
import {
  asCompound,
  asIntLike,
  asList,
  asString,
  createEmptyGrid,
  normalizeBlockName,
  parsePaletteEntryProperties,
  type ParsedStructure,
} from './common';
import { MAX_SOURCE_VOLUME, checkVolume } from './safetyLimits';

/** Parses the vanilla /structure-save NBT schema: `size` (3 ints), `palette` (list of
 *  `{Name, Properties?}` — Properties kept and folded into each cell's blockstate key, see
 *  blockstateKey.ts), `blocks` (list of `{state, pos, nbt?}` — sparse, one entry per non-air
 *  block; `nbt` per-block tile-entity data ignored). Matches this app's own
 *  `vanillaStructureExport.ts` schema exactly, since that's exactly what the real format is. */
export function parseVanillaStructure(root: NbtTag): ParsedStructure {
  const rootValue = asCompound(root, 'root');

  const sizeTags = asList(rootValue.size, 'size');
  if (sizeTags.length !== 3) throw new Error(`"size" must have exactly 3 entries, got ${sizeTags.length}.`);
  const [sizeX, sizeY, sizeZ] = sizeTags.map((t) => asIntLike(t, 'size[i]'));
  checkVolume(sizeX * sizeY * sizeZ, MAX_SOURCE_VOLUME, 'This structure');

  const paletteTags = asList(rootValue.palette, 'palette');
  const paletteEntries = paletteTags.map((entry) => {
    const compound = asCompound(entry, 'palette[i]');
    return { name: asString(compound.Name, 'palette[i].Name'), properties: parsePaletteEntryProperties(compound, 'palette[i]') };
  });

  const grid = createEmptyGrid(sizeX, sizeY, sizeZ);
  const blockIds = new Set<string>();

  const blockTags = asList(rootValue.blocks, 'blocks');
  for (const blockTag of blockTags) {
    const blockValue = asCompound(blockTag, 'blocks[i]');
    const stateIndex = asIntLike(blockValue.state, 'blocks[i].state');
    const posTags = asList(blockValue.pos, 'blocks[i].pos');
    if (posTags.length !== 3) throw new Error(`"blocks[i].pos" must have exactly 3 entries, got ${posTags.length}.`);
    const [x, y, z] = posTags.map((t) => asIntLike(t, 'blocks[i].pos[i]'));

    const paletteEntry = paletteEntries[stateIndex];
    if (paletteEntry === undefined) {
      throw new Error(`Block at (${x},${y},${z}) references palette index ${stateIndex}, out of range (palette has ${paletteEntries.length} entries).`);
    }
    if (x < 0 || x >= sizeX || y < 0 || y >= sizeY || z < 0 || z >= sizeZ) {
      throw new Error(`Block position (${x},${y},${z}) is outside the declared structure size (${sizeX},${sizeY},${sizeZ}).`);
    }
    const name = normalizeBlockName(paletteEntry.name);
    const key = name ? encodeBlockstateKey(name, paletteEntry.properties) : null;
    grid.voxels[x][y][z] = key;
    if (key) blockIds.add(key);
  }

  return { grid, blockIds };
}
