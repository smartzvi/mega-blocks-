import { describe, expect, it } from 'vitest';
import { generateTreeGrid, TREE_SPECIES_NAMES } from './generateTreeGrid';

describe('TREE_SPECIES_NAMES', () => {
  it('lists exactly oak and birch, sorted', () => {
    expect(TREE_SPECIES_NAMES).toEqual(['birch', 'oak']);
  });
});

describe('generateTreeGrid', () => {
  it("builds oak at the real recipe's bounding box (radius 2 -> 5x5 footprint, height 5 trunk + 1 leaf layer above)", () => {
    const { grid, blockIds } = generateTreeGrid('oak');
    expect(grid.sizeX).toBe(5);
    expect(grid.sizeZ).toBe(5);
    expect(grid.sizeY).toBe(6); // trunkHeight(5) + 1
    expect(blockIds).toEqual(new Set(['minecraft:oak_log[axis=y]', 'minecraft:oak_leaves[distance=7,persistent=false,waterlogged=false]']));
  });

  it('places a straight, uninterrupted log trunk at the horizontal center from the ground to the top', () => {
    const { grid } = generateTreeGrid('oak');
    const center = 2; // radius 2 -> center index 2 of a 5-wide grid
    for (let y = 0; y <= 4; y++) {
      expect(grid.voxels[center][y][center]).toBe('minecraft:oak_log[axis=y]');
    }
  });

  it('caps the trunk with a leaf, not an exposed log end — one leaf layer above the topmost log', () => {
    const { grid } = generateTreeGrid('oak');
    const center = 2;
    expect(grid.voxels[center][5][center]).toBe('minecraft:oak_leaves[distance=7,persistent=false,waterlogged=false]');
  });

  it('clips the 4 extreme corners of each full-radius leaf layer (the real blob-canopy look), leaving every other cell in that radius a leaf', () => {
    const { grid } = generateTreeGrid('oak');
    const leafKey = 'minecraft:oak_leaves[distance=7,persistent=false,waterlogged=false]';
    const y = 3; // a full-radius (R=2) leaf layer, per bottomLeafY..topLeafY-1
    // Corners (dx,dz = ±2,±2) clipped:
    for (const dx of [-2, 2]) {
      for (const dz of [-2, 2]) {
        expect(grid.voxels[2 + dx][y][2 + dz]).toBeNull();
      }
    }
    // Every other cell within radius 2 (excluding the trunk's own center column) is a leaf.
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
        const isTrunkCenter = dx === 0 && dz === 0;
        if (isCorner || isTrunkCenter) continue;
        expect(grid.voxels[2 + dx][y][2 + dz]).toBe(leafKey);
      }
    }
  });

  it("keeps oak's canopy to 2 full-radius leaf layers (per explicit user feedback that 3 read as too tall/thick), leaving the trunk row just below it bare", () => {
    const { grid } = generateTreeGrid('oak');
    const center = 2;
    // y=2 sits below the canopy now (bottomLeafY=3) — bare trunk, no leaves wrapped around it.
    expect(grid.voxels[center][2][center]).toBe('minecraft:oak_log[axis=y]');
    expect(grid.voxels[center + 2][2][center]).toBeNull();
    expect(grid.voxels[center][2][center + 2]).toBeNull();
  });

  it('tapers to a smaller radius (a plus/cross shape) at the very top leaf layer', () => {
    const { grid } = generateTreeGrid('oak');
    const leafKey = 'minecraft:oak_leaves[distance=7,persistent=false,waterlogged=false]';
    const y = 5; // topLeafY, radius R-1 = 1
    // Center and the 4 orthogonal neighbors are leaves...
    expect(grid.voxels[2][y][2]).toBe(leafKey);
    expect(grid.voxels[3][y][2]).toBe(leafKey);
    expect(grid.voxels[1][y][2]).toBe(leafKey);
    expect(grid.voxels[2][y][3]).toBe(leafKey);
    expect(grid.voxels[2][y][1]).toBe(leafKey);
    // ...but the diagonal corners at this smaller radius are clipped, same rule as every layer.
    expect(grid.voxels[3][y][3]).toBeNull();
    expect(grid.voxels[1][y][1]).toBeNull();
    // And nothing at all extends out to the full radius 2 on this layer.
    expect(grid.voxels[0][y][2]).toBeNull();
    expect(grid.voxels[4][y][2]).toBeNull();
  });

  it("builds birch at its own real recipe's taller trunk (height 6), same 5x5 canopy footprint as oak", () => {
    const { grid, blockIds } = generateTreeGrid('birch');
    expect(grid.sizeX).toBe(5);
    expect(grid.sizeZ).toBe(5);
    expect(grid.sizeY).toBe(7); // trunkHeight(6) + 1
    expect(blockIds).toEqual(
      new Set(['minecraft:birch_log[axis=y]', 'minecraft:birch_leaves[distance=7,persistent=false,waterlogged=false]'])
    );
    const center = 2;
    for (let y = 0; y <= 5; y++) {
      expect(grid.voxels[center][y][center]).toBe('minecraft:birch_log[axis=y]');
    }
  });

  it('never places a voxel outside the returned grid bounds (every array dimension matches sizeX/sizeY/sizeZ)', () => {
    for (const species of TREE_SPECIES_NAMES) {
      const { grid } = generateTreeGrid(species);
      expect(grid.voxels.length).toBe(grid.sizeX);
      for (const plane of grid.voxels) {
        expect(plane.length).toBe(grid.sizeY);
        for (const column of plane) {
          expect(column.length).toBe(grid.sizeZ);
        }
      }
    }
  });
});
