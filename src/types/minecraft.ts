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
  /** voxels[x][y][z] = palette block id, or null for air (interior). */
  voxels: (string | null)[][][];
}

/**
 * Target silhouette the assembled hollow-shell cube gets trimmed to before preview/export.
 * 'full_cube' is the untrimmed default. The other three are geometric approximations of the
 * real block shapes (not pixel-perfect hitbox replicas) — see applyShapeCutout.ts for the
 * exact geometry and the reasoning behind each approximation.
 */
export type BlockShape = 'full_cube' | 'slab' | 'stair' | 'door';
