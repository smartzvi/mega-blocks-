export const FACE_NAMES = ['top', 'bottom', 'north', 'south', 'east', 'west'] as const;
export type FaceName = (typeof FACE_NAMES)[number];

/** Decoded 16x16 (or first-frame-of-animated) RGBA pixel data for one face. */
export interface FaceTexture {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA, length width*height*4
}

export type BlockTextureSet = Record<FaceName, FaceTexture>;

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export type TintName = 'grass' | 'foliage';

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

/**
 * Broad material grouping used by the matching engine's family-affinity penalty.
 * 'wood_earth' = planks/logs/mud; 'stone_deepslate' = stone/deepslate/tuff/dripstone;
 * 'sand_clay' = terracotta; 'neutrals_concrete' = wool/concrete (the saturated dyed materials).
 */
export type MaterialFamily = 'wood_earth' | 'stone_deepslate' | 'sand_clay' | 'neutrals_concrete';

export interface PaletteEntry {
  id: string; // e.g. 'minecraft:obsidian'
  textureBase: string;
  tint: TintName | null;
  family: MaterialFamily;
  textures: BlockTextureSet; // decoded, tint-applied
  avgLab: Record<FaceName, Lab>;
  avgHsv: Record<FaceName, Hsv>;
  /** See FullCubeBlockDef's doc on the same field (lib/palette/fullCubeBlocks.ts) — carried
   *  through so matchAllFaces can exclude these from specific output faces. */
  gravityAffected?: boolean;
  endGrainTopBottom?: boolean;
  /** See FullCubeBlockDef's `glassOnly` doc — carried through so callers can strip glass out of
   *  the palette for any source that isn't itself glass-related (glassSource.ts). */
  glassOnly?: boolean;
  /** See FullCubeBlockDef's `earthOnly` doc — carried through so callers can strip dirt out of the
   *  palette for any source that isn't itself dirt/grass-family (glassSource.ts). */
  earthOnly?: boolean;
  /** See FullCubeBlockDef's `resinOnly` doc — stripped for every source except lava (glassSource.ts). */
  resinOnly?: boolean;
  /** See FullCubeBlockDef's `lightSource` doc — carried through so callers can strip light
   *  sources out of the palette for specific sources they look bad in (lightSourceExclusion.ts). */
  lightSource?: boolean;
}

/** 16x16 grid of palette block ids matched to one face, grid[v][u]. */
export type FaceMatchGrid = string[][];

export type MatchedFaces = Record<FaceName, FaceMatchGrid>;

export interface VoxelGrid {
  /** Per-axis extent. All three equal (16/32/48/64) for every ordinary cubic grid; independently
   *  larger for a genuinely non-cubic structure that stitches multiple real block positions into
   *  one grid — e.g. a 2-block-tall door doubles sizeY, a 2-block-long bed (head+foot) doubles
   *  sizeZ. */
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  /** Sparse: absence of a cell's key means air (the key is one packed integer, see voxelGrid.ts),
   *  exactly like a `null` cell in the old
   *  dense `(string|null)[][][]` array this replaced. A dense array's allocation is sized by the
   *  full bounding box regardless of how much of it is actually solid — for a shape whose real
   *  content is a small fraction of its bounding box (a tree's rounded canopy, a thin fence line),
   *  that padding is exactly what made higher resolutions hit the memory-safety cap for no real
   *  reason. Never index this directly — use getVoxel/setVoxel/forEachVoxel/cloneVoxelGrid
   *  (lib/voxel/voxelGrid.ts), which every producer/consumer in the app already goes through. */
  voxels: Map<number, string>;
}

/**
 * Target silhouette the assembled hollow-shell cube gets trimmed to before preview/export.
 * 'full_cube' is the untrimmed default. The other three are geometric approximations of the
 * real block shapes (not pixel-perfect hitbox replicas) — see applyShapeCutout.ts for the
 * exact geometry and the reasoning behind each approximation.
 */
export type BlockShape = 'full_cube' | 'slab' | 'stair' | 'door';

/** How a fence, pane/bars, wall or redstone wire picked in Item mode gets its connections (see
 *  lib/models/itemConnections.ts): `stored` is the block's bare default, `all` connects every
 *  side, `none` leaves every side open. Structure mode has no such setting. */
export type ConnectionMode = 'stored' | 'all' | 'none';

/** The real `shape` property a rail (or powered/detector/activator rail) blockstate carries — see
 *  lib/models/railTemplates.ts. Picked manually in Item mode (RailShapeToggle), the same "no real
 *  neighbors to infer from" reasoning ConnectionMode exists for; Structure mode always keeps
 *  whatever shape the file saved instead. */
export type RailShape =
  | 'north_south'
  | 'east_west'
  | 'north_east'
  | 'north_west'
  | 'south_east'
  | 'south_west'
  | 'ascending_north'
  | 'ascending_south'
  | 'ascending_east'
  | 'ascending_west';
