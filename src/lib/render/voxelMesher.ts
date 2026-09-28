import { cellKeyOffset, decodeCellKey } from '../voxel/voxelGrid';

/**
 * Turns a voxel grid into renderable geometry: only the faces that touch air, merged into one mesh
 * per CHUNK³ region, all sampling one shared texture atlas.
 *
 * The preview used to draw every voxel as a whole 12-triangle cube (one InstancedMesh per block id).
 * A face between two solid voxels can never be seen, and in a real build most faces are exactly
 * that, so the GPU spent most of its time on hidden triangles, which is what made big builds crawl
 * on phones. Chunking keeps each mesh small enough for 16-bit indices and lets three.js skip the
 * chunks outside the view.
 *
 * Pure and DOM-free, so it can run in a worker and in tests.
 */

export const CHUNK = 32;

/** Face order, shared with the atlas lookup: +x, -x, +y, -y, +z, -z — BoxGeometry's material order,
 *  named east, west, top, bottom, south, north. */
export const FACE_COUNT = 6;

/** Per-face brightness, like the game's own flat shading (top brightest, bottom darkest), so the
 *  shape reads even though the preview has no real lighting. */
const FACE_SHADE = [184, 184, 255, 153, 217, 217];

export interface VoxelMeshChunk {
  /** Grid coordinates of the chunk's low corner. Vertex positions are relative to it. */
  origin: [number, number, number];
  /** 3 per vertex, 0..CHUNK. */
  positions: Uint8Array;
  /** 2 per vertex, atlas coordinates as normalized 16-bit (0..65535 = 0..1), v = 0 at the top. */
  uvs: Uint16Array;
  /** 3 per vertex (one grey level repeated, for three.js vertex colours), normalized 8-bit. */
  shades: Uint8Array;
  indices: Uint16Array | Uint32Array;
}

export interface MeshInput {
  /** Packed cell keys (voxelGrid.ts's format) and, per cell, an index into the block table. */
  keys: Float64Array;
  ids: Uint16Array;
  /** Per block-table index, FACE_COUNT atlas tile indices (-1 = this block isn't drawn at all). */
  faceTiles: Int32Array;
  /** Per atlas tile: u0, v0, u1, v1 (0..1, v0 = the tile's top edge). */
  tileUvs: Float32Array;
}

// Each face's 4 corners as (x, y, z) offsets within the voxel, listed in (u, v) order
// A=(0,1) B=(0,0) C=(1,0) D=(1,1) (v = 1 is the texture's top row), matching THREE.BoxGeometry's own
// layout so every texture keeps the orientation the old cube renderer gave it. Triangles are
// A-B-D and B-C-D, BoxGeometry's winding, so front faces point outward.
const CORNERS: number[][] = [
  // +x: u runs +z → -z, v runs up
  [1, 1, 1, 1, 0, 1, 1, 0, 0, 1, 1, 0],
  // -x: u runs -z → +z
  [0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1],
  // +y: u runs -x → +x, v = 1 at -z
  [0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0],
  // -y: u runs -x → +x, v = 1 at +z
  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1],
  // +z: u runs -x → +x
  [0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1],
  // -z: u runs +x → -x
  [1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0],
];
const CORNER_UV = [0, 1, 0, 0, 1, 0, 1, 1];

const NEIGHBOUR_OFFSETS = [
  cellKeyOffset(1, 0, 0),
  cellKeyOffset(-1, 0, 0),
  cellKeyOffset(0, 1, 0),
  cellKeyOffset(0, -1, 0),
  cellKeyOffset(0, 0, 1),
  cellKeyOffset(0, 0, -1),
];

const MAX_U16_VERTS = 65536;

export function meshVoxels({ keys, ids, faceTiles, tileUvs }: MeshInput): VoxelMeshChunk[] {
  const n = keys.length;

  // Which cells are drawn at all. A block with no tiles (not in the palette) counts as air, so the
  // faces next to it stay visible — the same as the old renderer, which skipped it.
  const solid = new Set<number>();
  for (let i = 0; i < n; i++) if (faceTiles[ids[i] * FACE_COUNT] >= 0) solid.add(keys[i]);

  // Pass 1: each cell's exposed-face mask and chunk, and a face count per chunk.
  const masks = new Uint8Array(n);
  const chunkOf = new Int32Array(n).fill(-1);
  const chunkIndex = new Map<number, number>();
  const origins: [number, number, number][] = [];
  const faceCounts: number[] = [];
  const xyz: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < n; i++) {
    const key = keys[i];
    if (!solid.has(key)) continue;
    let mask = 0;
    let faces = 0;
    for (let f = 0; f < FACE_COUNT; f++) {
      if (!solid.has(key + NEIGHBOUR_OFFSETS[f])) {
        mask |= 1 << f;
        faces++;
      }
    }
    if (faces === 0) continue;
    masks[i] = mask;
    decodeCellKey(key, xyz);
    const cx = Math.floor(xyz[0] / CHUNK);
    const cy = Math.floor(xyz[1] / CHUNK);
    const cz = Math.floor(xyz[2] / CHUNK);
    const ck = (cx * 4096 + cy) * 4096 + cz;
    let c = chunkIndex.get(ck);
    if (c === undefined) {
      c = origins.length;
      chunkIndex.set(ck, c);
      origins.push([cx * CHUNK, cy * CHUNK, cz * CHUNK]);
      faceCounts.push(0);
    }
    chunkOf[i] = c;
    faceCounts[c] += faces;
  }

  // Pass 2: fill each chunk's buffers.
  const chunks: VoxelMeshChunk[] = origins.map((origin, c) => {
    const verts = faceCounts[c] * 4;
    return {
      origin,
      positions: new Uint8Array(verts * 3),
      uvs: new Uint16Array(verts * 2),
      shades: new Uint8Array(verts * 3),
      indices: verts > MAX_U16_VERTS ? new Uint32Array(faceCounts[c] * 6) : new Uint16Array(faceCounts[c] * 6),
    };
  });
  const written = new Int32Array(origins.length); // faces written so far, per chunk

  for (let i = 0; i < n; i++) {
    const c = chunkOf[i];
    if (c < 0) continue;
    const chunk = chunks[c];
    decodeCellKey(keys[i], xyz);
    const lx = xyz[0] - chunk.origin[0];
    const ly = xyz[1] - chunk.origin[1];
    const lz = xyz[2] - chunk.origin[2];
    const mask = masks[i];
    const tileBase = ids[i] * FACE_COUNT;

    for (let f = 0; f < FACE_COUNT; f++) {
      if (!(mask & (1 << f))) continue;
      const face = written[c]++;
      const v0 = face * 4;
      const tile = faceTiles[tileBase + f];
      const u0 = tileUvs[tile * 4];
      const t0 = tileUvs[tile * 4 + 1];
      const u1 = tileUvs[tile * 4 + 2];
      const t1 = tileUvs[tile * 4 + 3];
      const corners = CORNERS[f];
      const shade = FACE_SHADE[f];

      for (let k = 0; k < 4; k++) {
        const v = v0 + k;
        chunk.positions[v * 3] = lx + corners[k * 3];
        chunk.positions[v * 3 + 1] = ly + corners[k * 3 + 1];
        chunk.positions[v * 3 + 2] = lz + corners[k * 3 + 2];
        // CORNER_UV's v = 1 is the texture's top row, which is the tile's top edge t0 in the atlas.
        const cu = CORNER_UV[k * 2];
        const cv = CORNER_UV[k * 2 + 1];
        chunk.uvs[v * 2] = Math.round((cu ? u1 : u0) * 65535);
        chunk.uvs[v * 2 + 1] = Math.round((cv ? t0 : t1) * 65535);
        chunk.shades[v * 3] = shade;
        chunk.shades[v * 3 + 1] = shade;
        chunk.shades[v * 3 + 2] = shade;
      }
      const idx = face * 6;
      chunk.indices[idx] = v0; // A
      chunk.indices[idx + 1] = v0 + 1; // B
      chunk.indices[idx + 2] = v0 + 3; // D
      chunk.indices[idx + 3] = v0 + 1; // B
      chunk.indices[idx + 4] = v0 + 2; // C
      chunk.indices[idx + 5] = v0 + 3; // D
    }
  }

  return chunks;
}

/** Every buffer in the result, for a worker's transfer list. */
export function meshTransferList(chunks: VoxelMeshChunk[]): ArrayBuffer[] {
  return chunks.flatMap((c) => [c.positions.buffer, c.uvs.buffer, c.shades.buffer, c.indices.buffer] as ArrayBuffer[]);
}
