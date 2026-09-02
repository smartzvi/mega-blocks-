import type { VoxelGrid } from '../../types/minecraft';
import { encodeBlockstateKey } from '../structure/blockstateKey';

/**
 * Trees mode generates a small synthetic "structure" entirely in code — a Minecraft tree isn't a
 * pre-built blueprint the way a village house is (confirmed directly against the real 1.21.8 jar:
 * there's no tree data anywhere under `data/minecraft/structure/`); real trees are grown at
 * runtime from a generation *recipe* instead, shipped as JSON under
 * `data/minecraft/worldgen/configured_feature/<name>.json` (e.g. `oak.json`, `birch.json`). The
 * shape here is built from those real recipes' trunk/foliage parameters, not guessed — but the
 * output is otherwise just an ordinary `{ grid, blockIds }` pair, the exact same shape
 * `parseStructureFile.ts` produces from a real `.nbt` file, so it flows through the unmodified
 * Structure-mode pipeline (`cullInteriorVoxels` → `buildStructureVoxelGrid`) with no changes to
 * either.
 *
 * Two real gotchas, confirmed rather than assumed:
 * - Real tree generation is randomized (a height *range*, not one fixed height) — there's no
 *   single "the" oak tree. This picks one fixed, deterministic value per species (the middle of
 *   the real `base_height`..`base_height+height_rand_a+height_rand_b` range) rather than growing a
 *   different tree every time, the same "one canonical shape, not every random variant" call this
 *   project already made for mob textures (biome/skin variants) and hand-authored geometry.
 * - The real foliage placer for these species (`minecraft:blob_foliage_placer`) is Java game logic,
 *   not data — the JSON only gives its `height`/`radius`/`offset` *parameters*, not the placement
 *   algorithm itself. The shape implemented here (a square cross-section with its 4 extreme
 *   corners clipped at every layer, one size smaller at the very top layer) is vanilla's
 *   well-established, extremely-well-known blob-canopy look — verified against this app's own
 *   voxel output (see generateTreeGrid.test.ts) rather than against decompiled source, which
 *   wasn't available to check byte-for-byte the way this project verifies texture/UV data
 *   elsewhere. If a real screenshot ever shows a mismatch, treat the corner-clipping rule as the
 *   first thing to revisit.
 *
 * Only `oak`/`birch` are implemented — both real generation recipes use the identical
 * `straight_trunk_placer` + `blob_foliage_placer` combination (just different heights/textures),
 * which is why they're grouped as one shape function. `spruce`/`pine` use materially different,
 * more intricate foliage placers (a tapering multi-tier cone with randomized per-layer radius) that
 * need their own dedicated investigation before shipping — deliberately left out of this round
 * rather than guessed.
 */
export type TreeSpecies = 'oak' | 'birch';

interface TreeSpeciesDef {
  logBlock: string;
  leavesBlock: string;
  /** Deterministic trunk height (log count) — see the file doc for why this is one fixed value
   *  rather than the real generation's randomized range. */
  trunkHeight: number;
  /** `blob_foliage_placer`'s own `height`/`radius` params, straight from the real
   *  configured_feature JSON (oak.json / birch.json — both real recipes use `offset: 0`, so it's
   *  omitted here since it never applies a shift). */
  foliageHeight: number;
  foliageRadius: number;
}

// Real base_height/height_rand_a/height_rand_b straight from data/minecraft/worldgen/
// configured_feature/oak.json and birch.json in the real 1.21.8 jar:
//   oak:   base_height=4, height_rand_a=2, height_rand_b=0 -> real height range 4-6, picked 5
//   birch: base_height=5, height_rand_a=2, height_rand_b=0 -> real height range 5-7, picked 6
// Both share foliage_placer: { type: blob_foliage_placer, height: 3, radius: 2, offset: 0 }.
const TREE_SPECIES: Record<TreeSpecies, TreeSpeciesDef> = {
  oak: { logBlock: 'minecraft:oak_log', leavesBlock: 'minecraft:oak_leaves', trunkHeight: 5, foliageHeight: 3, foliageRadius: 2 },
  birch: { logBlock: 'minecraft:birch_log', leavesBlock: 'minecraft:birch_leaves', trunkHeight: 6, foliageHeight: 3, foliageRadius: 2 },
};

export const TREE_SPECIES_NAMES = Object.keys(TREE_SPECIES).sort() as TreeSpecies[];

/**
 * Builds the tree's block layout in the exact `{ grid, blockIds }` shape
 * `parseStructureFile.ts` produces from a real structure file (see this file's own doc). The
 * trunk is a straight log column at the grid's horizontal center, from the ground (y=0) up to its
 * top; the canopy is a rounded "blob" of leaves covering the top `foliageHeight` trunk layers plus
 * one extra layer above the trunk (real vanilla trees always cap with a leaf, not an exposed log
 * end) — the topmost leaf layer uses one less radius than the rest, giving the tapered top every
 * oak/birch tree has. The real generation's separate dirt-block placement underneath the sapling
 * is deliberately not modeled — this produces the tree itself, not a patch of ground under it.
 */
export function generateTreeGrid(species: TreeSpecies): { grid: VoxelGrid; blockIds: Set<string> } {
  const def = TREE_SPECIES[species];
  const trunkTop = def.trunkHeight - 1; // topmost log's y index

  const logKey = encodeBlockstateKey(def.logBlock, { axis: 'y' });
  // Real per-pixel default state every generated leaf block actually has, straight from the same
  // configured_feature JSON (`foliage_provider`) — not just a bare block name.
  const leafKey = encodeBlockstateKey(def.leavesBlock, { distance: '7', persistent: 'false', waterlogged: 'false' });

  const R = def.foliageRadius;
  const sizeX = 2 * R + 1;
  const sizeZ = 2 * R + 1;
  const sizeY = def.trunkHeight + 1; // trunk (y=0..trunkTop) plus one leaf layer above it
  const center = R; // both X and Z center on the trunk column

  const voxels: (string | null)[][][] = Array.from({ length: sizeX }, () =>
    Array.from({ length: sizeY }, () => new Array<string | null>(sizeZ).fill(null))
  );

  for (let y = 0; y <= trunkTop; y++) {
    voxels[center][y][center] = logKey;
  }

  const bottomLeafY = trunkTop - def.foliageHeight + 1;
  const topLeafY = trunkTop + 1;
  for (let y = bottomLeafY; y <= topLeafY; y++) {
    const radius = y === topLeafY ? R - 1 : R;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        if (Math.abs(dx) === radius && Math.abs(dz) === radius) continue; // clip the 4 extreme corners
        if (dx === 0 && dz === 0 && y <= trunkTop) continue; // trunk already occupies this cell
        voxels[center + dx][y][center + dz] = leafKey;
      }
    }
  }

  return { grid: { sizeX, sizeY, sizeZ, voxels }, blockIds: new Set([logKey, leafKey]) };
}
