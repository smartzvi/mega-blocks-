import type { NbtTag } from '../../types/nbt';
import { bitsPerEntryFor, unpackLongArray } from '../nbt/bitpack';
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

interface RegionBox {
  minX: number;
  minY: number;
  minZ: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

/** Litematica's Size can be negative per-axis, meaning "extends in the negative direction from
 *  Position" — normalize every region to a true min-corner + non-negative size before use. */
function normalizeAxis(position: number, size: number): { min: number; size: number } {
  return size >= 0 ? { min: position, size } : { min: position + size + 1, size: -size };
}

function normalizeRegionBox(position: { x: number; y: number; z: number }, size: { x: number; y: number; z: number }): RegionBox {
  const nx = normalizeAxis(position.x, size.x);
  const ny = normalizeAxis(position.y, size.y);
  const nz = normalizeAxis(position.z, size.z);
  return { minX: nx.min, minY: ny.min, minZ: nz.min, sizeX: nx.size, sizeY: ny.size, sizeZ: nz.size };
}

interface RawPaletteEntry {
  name: string;
  properties?: Record<string, string>;
}

interface RawRegion {
  box: RegionBox;
  paletteEntries: RawPaletteEntry[];
  blockStates: BigInt64Array;
}

function readVec3Compound(tag: NbtTag | undefined, field: string): { x: number; y: number; z: number } {
  const c = asCompound(tag, field);
  return { x: asIntLike(c.x, `${field}.x`), y: asIntLike(c.y, `${field}.y`), z: asIntLike(c.z, `${field}.z`) };
}

function parseRegion(name: string, regionTag: NbtTag): RawRegion {
  const regionValue = asCompound(regionTag, `Regions.${name}`);
  const position = readVec3Compound(regionValue.Position, `Regions.${name}.Position`);
  const size = readVec3Compound(regionValue.Size, `Regions.${name}.Size`);
  const box = normalizeRegionBox(position, size);
  checkVolume(box.sizeX * box.sizeY * box.sizeZ, MAX_SOURCE_VOLUME, `Region "${name}"`);

  const paletteTags = asList(regionValue.BlockStatePalette, `Regions.${name}.BlockStatePalette`);
  const paletteEntries = paletteTags.map((entry) => {
    const field = `Regions.${name}.BlockStatePalette[i]`;
    const compound = asCompound(entry, field);
    return { name: asString(compound.Name, `${field}.Name`), properties: parsePaletteEntryProperties(compound, field) };
  });

  const blockStatesTag = regionValue.BlockStates;
  if (!blockStatesTag || blockStatesTag.type !== 'longArray') {
    throw new Error(`"Regions.${name}.BlockStates" must be an NBT long array, got ${blockStatesTag?.type ?? 'nothing'}.`);
  }

  return { box, paletteEntries, blockStates: blockStatesTag.value };
}

/** Parses a Litematica .litematic file: `Regions` is a compound keyed by arbitrary region names
 *  (this app's own exporter only ever writes one, "Main", but real files can have several),
 *  each with its own Position/Size/BlockStatePalette/BlockStates (bit-packed via the same
 *  continuous scheme `bitpack.ts` already implements). All regions are composited into one grid
 *  sized to their union bounding box; on overlap, later regions (file order) win. */
export function parseLitematic(root: NbtTag): ParsedStructure {
  const rootValue = asCompound(root, 'root');
  const regionsValue = asCompound(rootValue.Regions, 'Regions');
  const regionNames = Object.keys(regionsValue);
  if (regionNames.length === 0) throw new Error('This litematic file has no regions.');

  const regions = regionNames.map((name) => parseRegion(name, regionsValue[name]));

  const minX = Math.min(...regions.map((r) => r.box.minX));
  const minY = Math.min(...regions.map((r) => r.box.minY));
  const minZ = Math.min(...regions.map((r) => r.box.minZ));
  const maxX = Math.max(...regions.map((r) => r.box.minX + r.box.sizeX));
  const maxY = Math.max(...regions.map((r) => r.box.minY + r.box.sizeY));
  const maxZ = Math.max(...regions.map((r) => r.box.minZ + r.box.sizeZ));
  const sizeX = maxX - minX;
  const sizeY = maxY - minY;
  const sizeZ = maxZ - minZ;
  checkVolume(sizeX * sizeY * sizeZ, MAX_SOURCE_VOLUME, 'The combined litematic regions');

  const grid = createEmptyGrid(sizeX, sizeY, sizeZ);

  for (const region of regions) {
    const volume = region.box.sizeX * region.box.sizeY * region.box.sizeZ;
    const bitsPerEntry = bitsPerEntryFor(region.paletteEntries.length);
    const indices = unpackLongArray(region.blockStates, bitsPerEntry, volume);

    // Iteration order matches litematicExport.ts's writer exactly: y outer, z middle, x inner.
    let i = 0;
    for (let y = 0; y < region.box.sizeY; y++) {
      for (let z = 0; z < region.box.sizeZ; z++) {
        for (let x = 0; x < region.box.sizeX; x++) {
          const paletteIndex = indices[i++];
          const paletteEntry = region.paletteEntries[paletteIndex];
          const name = paletteEntry ? normalizeBlockName(paletteEntry.name) : null;
          const key = name ? encodeBlockstateKey(name, paletteEntry.properties) : null;

          const gx = region.box.minX + x - minX;
          const gy = region.box.minY + y - minY;
          const gz = region.box.minZ + z - minZ;
          grid.voxels[gx][gy][gz] = key; // last region wins on overlap, including overwriting with air
        }
      }
    }
  }

  // Derived from the final composited grid, not accumulated during the region loop — a block
  // added by an earlier region can be fully overwritten by a later overlapping region, and
  // blockIds should only ever reflect what's actually present in the final result.
  const blockIds = new Set<string>();
  for (let x = 0; x < sizeX; x++) {
    for (let y = 0; y < sizeY; y++) {
      for (let z = 0; z < sizeZ; z++) {
        const id = grid.voxels[x][y][z];
        if (id) blockIds.add(id);
      }
    }
  }

  return { grid, blockIds };
}
