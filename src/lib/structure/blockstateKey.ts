/**
 * A structure cell's real identity is its block Name *plus* its Properties (facing, half, shape,
 * axis, ...) — two oak_stairs facing different directions need genuinely different voxel stamps,
 * not the same one. Rather than changing `VoxelGrid.voxels` (shared with block/item mode, always
 * a plain palette id there) to carry a separate properties field, this module folds Properties
 * into the id string itself using vanilla's own blockstate string convention
 * (`Name[prop=val,prop=val]`, keys sorted alphabetically so the same block+properties combination
 * always produces the same string regardless of the NBT compound's iteration order) — a structure
 * cell's `voxels[x][y][z]` value is one of these combined keys (or plain `Name` when there are no
 * properties), and every downstream consumer that needs the real block name or its properties back
 * (buildStructureBlockStamp.ts, resolveFallbackTexture.ts, cullInteriorVoxels.ts) decodes it here.
 */
export function encodeBlockstateKey(name: string, properties?: Record<string, string>): string {
  if (!properties) return name;
  const keys = Object.keys(properties).sort();
  if (keys.length === 0) return name;
  return `${name}[${keys.map((k) => `${k}=${properties[k]}`).join(',')}]`;
}

export function decodeBlockstateKey(key: string): { name: string; properties: Record<string, string> } {
  const start = key.indexOf('[');
  if (start === -1) return { name: key, properties: {} };

  const name = key.slice(0, start);
  const body = key.slice(start + 1, key.endsWith(']') ? -1 : undefined);
  const properties: Record<string, string> = {};
  if (body) {
    for (const pair of body.split(',')) {
      const eq = pair.indexOf('=');
      if (eq === -1) continue;
      properties[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return { name, properties };
}
