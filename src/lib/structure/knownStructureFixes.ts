import type { VoxelGrid } from '../../types/minecraft';
import { encodeBlockstateKey } from './blockstateKey';
import { setVoxel } from '../voxel/voxelGrid';

interface StructureFix {
  /** Source-grid position, in the structure's own (unscaled) coordinates. */
  pos: readonly [x: number, y: number, z: number];
  name: string;
  properties: Record<string, string>;
}

/**
 * Corrects a small number of individually-verified real placement errors in specific bundled
 * vanilla structure files — not a rendering, rotation, or model-resolution bug on this app's side
 * (both were checked directly against the real jar and are correct; see project memory), and not
 * a general pattern applied automatically, since every other stair in every other structure is
 * presumed correct until it's specifically investigated and confirmed otherwise, the same way this
 * one was.
 *
 * `village/plains/houses/plains_small_house_3`, roof peak, back-right corner (source position
 * (4,6,4)): every one of the roof's other three matching corners (front-left, front-right,
 * back-left, at this same ring and the wider ring below) is mirror-symmetric with its opposite —
 * e.g. front-left is `facing=east,shape=outer_right` and front-right correctly mirrors it as
 * `facing=east,shape=outer_left`; back-left is `facing=south,shape=outer_right` and by that same
 * pattern back-right should mirror it as `facing=north,shape=outer_left`. The real stored block at
 * back-right is instead `facing=west,shape=outer_right` — confirmed directly against the raw NBT
 * bytes (not a parsing artifact), and directly reported by the user via a real in-game screenshot
 * of this exact structure, where every other corner reads as correct and only this one looks
 * wrong. Left uncorrected, its "outer_right" nub sits facing the wrong way — a visible seam at
 * 1-block scale, a large one at megablock scale.
 */
const KNOWN_FIXES: Record<string, StructureFix[]> = {
  'village/plains/houses/plains_small_house_3': [
    {
      pos: [4, 6, 4],
      name: 'minecraft:oak_stairs',
      properties: { facing: 'north', half: 'bottom', shape: 'outer_left', waterlogged: 'false' },
    },
  ],
};

/**
 * Applies any corrections registered for `structureName` (the same searchable path
 * `StructureSource.name` carries, e.g. "village/plains/houses/plains_small_house_3") to `grid` in
 * place, then returns it. A no-op for every structure not specifically listed above. Positions
 * outside the grid's real bounds are skipped rather than throwing, so a future structure-file
 * update that shrinks a structure can't turn a stale fix into a crash.
 *
 * Also adds the corrected blockstate key to `blockIds` in place — `buildStructureVoxelGrid.ts`
 * only ever builds a stamp for a key that's actually in this set (computed once per unique id, not
 * per occurrence), so a corrected cell whose new key isn't already present would otherwise have no
 * stamp to composite and crash. The original (now possibly unused) key is deliberately left in
 * place rather than pruned — a harmless unused stamp, not worth the complexity of checking whether
 * some other real cell still needs it.
 */
export function applyKnownStructureFixes(structureName: string, grid: VoxelGrid, blockIds: Set<string>): VoxelGrid {
  const fixes = KNOWN_FIXES[structureName];
  if (!fixes) return grid;

  for (const fix of fixes) {
    const [x, y, z] = fix.pos;
    if (x < 0 || x >= grid.sizeX || y < 0 || y >= grid.sizeY || z < 0 || z >= grid.sizeZ) continue;
    const key = encodeBlockstateKey(fix.name, fix.properties);
    setVoxel(grid, x, y, z, key);
    blockIds.add(key);
  }

  return grid;
}
