const MAX_HOPS = 8;

/**
 * Walks a face's texture reference (e.g. "#side") through a model's merged `textures` map until
 * it resolves to a real path (e.g. "minecraft:block/cauldron_side") — variables can chain
 * through several levels of a parent hierarchy (a leaf's "#texture" pointing at a variable the
 * parent itself only re-exports). Throws on a cycle or a dangling reference rather than looping
 * forever or silently returning garbage.
 */
export function resolveTexturePath(ref: string, textures: Record<string, string>): string {
  let current = ref;
  const seen = new Set<string>();

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (!current.startsWith('#')) return current;
    if (seen.has(current)) {
      throw new Error(`Texture variable cycle detected resolving "${ref}".`);
    }
    seen.add(current);

    const varName = current.slice(1);
    const next = textures[varName];
    if (next === undefined) {
      throw new Error(`Texture variable "${current}" has no definition (while resolving "${ref}").`);
    }
    current = next;
  }

  throw new Error(`Texture variable "${ref}" didn't resolve to a real path within ${MAX_HOPS} hops.`);
}

/** "minecraft:block/cauldron_side" | "block/cauldron_side" | "cauldron_side" -> "cauldron_side",
 *  matching the key format loadArchive.ts uses for blockTextureFiles. */
export function texturePathToKey(path: string): string {
  const withoutNamespace = path.includes(':') ? path.split(':')[1] : path;
  return withoutNamespace.startsWith('block/') ? withoutNamespace.slice('block/'.length) : withoutNamespace;
}
