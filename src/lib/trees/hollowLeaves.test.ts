import { describe, expect, it } from 'vitest';
import { createVoxelGrid, getVoxel, setVoxel } from '../voxel/voxelGrid';
import { hollowLeafInterior } from './hollowLeaves';

const LEAF = 'minecraft:oak_leaves[distance=7]';
const LOG = 'minecraft:oak_log[axis=y]';
const R = 4;
// The finished grid holds palette-matched blocks, not the source names (a leaf comes out as green concrete).
const LEAF_VOXEL = 'minecraft:green_concrete';
const LOG_VOXEL = 'minecraft:oak_planks';

/** Stamps one source block as the hollow box the real pipeline produces: only its outer layer. */
function stampBlock(grid: ReturnType<typeof createVoxelGrid>, cx: number, cy: number, cz: number, id: string) {
  const voxel = id === LOG ? LOG_VOXEL : LEAF_VOXEL;
  for (let x = 0; x < R; x++)
    for (let y = 0; y < R; y++)
      for (let z = 0; z < R; z++) {
        const onShell = [x, y, z].some((v) => v === 0 || v === R - 1);
        if (onShell) setVoxel(grid, cx * R + x, cy * R + y, cz * R + z, voxel);
      }
}

function build(cells: [number, number, number, string][], size: number) {
  const source = createVoxelGrid(size, size, size);
  const grid = createVoxelGrid(size * R, size * R, size * R);
  for (const [x, y, z, id] of cells) {
    setVoxel(source, x, y, z, id);
    stampBlock(grid, x, y, z, id);
  }
  return { source, grid };
}

describe('hollowLeafInterior', () => {
  it('leaves a lone leaf block untouched (every face touches air)', () => {
    const { source, grid } = build([[0, 0, 0, LEAF]], 1);
    expect(hollowLeafInterior(grid, source, R).voxels.size).toBe(grid.voxels.size);
  });

  it('removes the wall two touching leaf blocks share, keeps the outside skin', () => {
    const { source, grid } = build(
      [
        [0, 0, 0, LEAF],
        [1, 0, 0, LEAF],
      ],
      2
    );
    const hollow = hollowLeafInterior(grid, source, R);
    // Shared face: x = R-1 of the first block and x = R of the second, away from the other faces.
    expect(getVoxel(hollow, R - 1, 1, 1)).toBeNull();
    expect(getVoxel(hollow, R, 1, 1)).toBeNull();
    // The outside faces stay, and so do the edges where the shared face meets them.
    expect(getVoxel(hollow, 0, 1, 1)).toBe(LEAF_VOXEL);
    expect(getVoxel(hollow, 2 * R - 1, 1, 1)).toBe(LEAF_VOXEL);
    expect(getVoxel(hollow, R - 1, 0, 1)).toBe(LEAF_VOXEL); // bottom skin, at the seam
    expect(getVoxel(hollow, R, 1, R - 1)).toBe(LEAF_VOXEL); // side skin, at the seam
  });

  it('opens a 3x3x3 leaf cube into a single closed shell with an empty inside', () => {
    const cells: [number, number, number, string][] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) cells.push([x, y, z, LEAF]);
    const { source, grid } = build(cells, 3);
    const hollow = hollowLeafInterior(grid, source, R);
    const n = 3 * R;
    // Any voxel not on the outside of the whole cube is gone.
    let inside = 0;
    let shell = 0;
    for (let x = 0; x < n; x++)
      for (let y = 0; y < n; y++)
        for (let z = 0; z < n; z++) {
          const onOutside = [x, y, z].some((v) => v === 0 || v === n - 1);
          const present = getVoxel(hollow, x, y, z) !== null;
          if (!onOutside && present) inside++;
          if (onOutside && present) shell++;
        }
    expect(inside).toBe(0);
    expect(shell).toBe(n ** 3 - (n - 2) ** 3); // the whole outer skin, no gaps
  });

  it('never removes log voxels, but does open the leaf wall that touches a log', () => {
    const { source, grid } = build(
      [
        [0, 0, 0, LOG],
        [1, 0, 0, LEAF],
      ],
      2
    );
    const hollow = hollowLeafInterior(grid, source, R);
    const logVoxels = [...grid.voxels.values()].filter((v) => v === LOG_VOXEL).length;
    expect([...hollow.voxels.values()].filter((v) => v === LOG_VOXEL).length).toBe(logVoxels);
    expect(getVoxel(hollow, R, 1, 1)).toBeNull(); // the leaf's wall facing the log
    expect(getVoxel(hollow, R - 1, 1, 1)).toBe(LOG_VOXEL); // the log's own wall stays
  });

  it('treats a block culled from the source grid as air only if it is truly absent, so use the unculled source', () => {
    // A leaf whose neighbour exists in `source` loses that wall even though nothing is drawn there.
    const { source, grid } = build(
      [
        [0, 0, 0, LEAF],
        [1, 0, 0, LEAF],
      ],
      2
    );
    for (let x = R; x < 2 * R; x++) for (let y = 0; y < R; y++) for (let z = 0; z < R; z++) setVoxel(grid, x, y, z, null);
    const hollow = hollowLeafInterior(grid, source, R);
    expect(getVoxel(hollow, R - 1, 1, 1)).toBeNull();
  });
});
