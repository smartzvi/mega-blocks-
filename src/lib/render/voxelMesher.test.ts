import { describe, expect, it } from 'vitest';
import { createVoxelGrid, setVoxel } from '../voxel/voxelGrid';
import { packVoxelGrid } from '../voxel/packGrid';
import { CHUNK, FACE_COUNT, meshVoxels, type VoxelMeshChunk } from './voxelMesher';
import type { VoxelGrid } from '../../types/minecraft';

/** Two tiles: tile 0 at u 0..0.5, tile 1 at u 0.5..1. Every drawn block uses tile 0 on all faces
 *  except 'minecraft:skip', which isn't drawn (not in the palette). */
const TILE_UVS = new Float32Array([0, 0, 0.5, 1, 0.5, 0, 1, 1]);

function mesh(grid: VoxelGrid): VoxelMeshChunk[] {
  const packed = packVoxelGrid(grid);
  const faceTiles = new Int32Array(packed.table.length * FACE_COUNT);
  packed.table.forEach((id, i) => faceTiles.fill(id === 'minecraft:skip' ? -1 : 0, i * FACE_COUNT, (i + 1) * FACE_COUNT));
  return meshVoxels({ keys: packed.keys, ids: packed.ids, faceTiles, tileUvs: TILE_UVS });
}

const faces = (chunks: VoxelMeshChunk[]) => chunks.reduce((sum, c) => sum + c.indices.length / 6, 0);

describe('meshVoxels', () => {
  it('draws all 6 faces of a lone voxel, as 4 vertices and 2 triangles each', () => {
    const grid = createVoxelGrid(4, 4, 4);
    setVoxel(grid, 1, 2, 3, 'minecraft:stone');
    const chunks = mesh(grid);
    expect(chunks).toHaveLength(1);
    expect(faces(chunks)).toBe(6);
    expect(chunks[0].positions.length).toBe(6 * 4 * 3);
    // Every corner lies on the voxel's own unit box.
    for (let v = 0; v < 24; v++) {
      expect([1, 2]).toContain(chunks[0].positions[v * 3]);
      expect([2, 3]).toContain(chunks[0].positions[v * 3 + 1]);
      expect([3, 4]).toContain(chunks[0].positions[v * 3 + 2]);
    }
  });

  it('drops the faces two touching voxels share', () => {
    const grid = createVoxelGrid(4, 4, 4);
    setVoxel(grid, 0, 0, 0, 'minecraft:stone');
    setVoxel(grid, 1, 0, 0, 'minecraft:dirt');
    expect(faces(mesh(grid))).toBe(10);
  });

  it('draws only the outside of a solid cube', () => {
    const grid = createVoxelGrid(3, 3, 3);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) setVoxel(grid, x, y, z, 'minecraft:stone');
    expect(faces(mesh(grid))).toBe(6 * 9);
  });

  it('treats a block that is not drawn as air, so its neighbours keep their faces', () => {
    const grid = createVoxelGrid(4, 4, 4);
    setVoxel(grid, 0, 0, 0, 'minecraft:stone');
    setVoxel(grid, 1, 0, 0, 'minecraft:skip');
    expect(faces(mesh(grid))).toBe(6);
  });

  it('splits across chunks but still culls faces shared over a chunk border', () => {
    const grid = createVoxelGrid(CHUNK * 2, 1, 1);
    setVoxel(grid, CHUNK - 1, 0, 0, 'minecraft:stone');
    setVoxel(grid, CHUNK, 0, 0, 'minecraft:stone');
    const chunks = mesh(grid);
    expect(chunks.map((c) => c.origin)).toEqual([
      [0, 0, 0],
      [CHUNK, 0, 0],
    ]);
    expect(faces(chunks)).toBe(10);
  });

  it('winds every triangle so it faces away from the voxel (visible from outside)', () => {
    const grid = createVoxelGrid(2, 2, 2);
    setVoxel(grid, 0, 0, 0, 'minecraft:stone');
    const [chunk] = mesh(grid);
    const p = (i: number) => [chunk.positions[i * 3], chunk.positions[i * 3 + 1], chunk.positions[i * 3 + 2]];
    for (let t = 0; t < chunk.indices.length; t += 3) {
      const [a, b, c] = [p(chunk.indices[t]), p(chunk.indices[t + 1]), p(chunk.indices[t + 2])];
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
      const centre = [(a[0] + b[0] + c[0]) / 3 - 0.5, (a[1] + b[1] + c[1]) / 3 - 0.5, (a[2] + b[2] + c[2]) / 3 - 0.5];
      expect(normal[0] * centre[0] + normal[1] * centre[1] + normal[2] * centre[2]).toBeGreaterThan(0);
    }
  });

  it("maps each face's texture upright on the sides (the tile's top edge at the top of the voxel)", () => {
    const grid = createVoxelGrid(1, 1, 1);
    setVoxel(grid, 0, 0, 0, 'minecraft:stone');
    const [chunk] = mesh(grid);
    // Side faces are faces 0, 1, 4, 5 in the mesher's order; for them, v = 0 (top) exactly where y = 1.
    for (const face of [0, 1, 4, 5]) {
      for (let k = 0; k < 4; k++) {
        const v = face * 4 + k;
        const y = chunk.positions[v * 3 + 1];
        expect(chunk.uvs[v * 2 + 1]).toBe(y === 1 ? 0 : 65535);
      }
    }
  });

  it('switches to 32-bit indices only when a chunk has more than 65536 vertices', () => {
    const small = createVoxelGrid(2, 1, 1);
    setVoxel(small, 0, 0, 0, 'minecraft:stone');
    expect(mesh(small)[0].indices).toBeInstanceOf(Uint16Array);

    // A 3D checkerboard: no two voxels touch, so every face is exposed.
    const big = createVoxelGrid(CHUNK, CHUNK, CHUNK);
    for (let x = 0; x < CHUNK; x++)
      for (let y = 0; y < CHUNK; y++) for (let z = 0; z < CHUNK; z++) if ((x + y + z) % 2 === 0) setVoxel(big, x, y, z, 'minecraft:stone');
    const [chunk] = mesh(big);
    expect(chunk.indices).toBeInstanceOf(Uint32Array);
    expect(faces([chunk])).toBe((CHUNK ** 3 / 2) * 6);
  });
});
