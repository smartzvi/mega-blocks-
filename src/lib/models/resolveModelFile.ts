import type { BlockModel } from '../../types/item';
import { parseBlockModel } from './parseBlockModel';
import { texturePathToKey } from './resolveTextureVariable';

type ModelFiles = Map<string, () => Promise<Uint8Array>>;

interface RawModelShape {
  parent?: string;
  textures?: Record<string, string>;
  elements?: unknown[];
}

const MAX_PARENT_HOPS = 12;

async function loadRawModel(name: string, modelFiles: ModelFiles): Promise<unknown> {
  const load = modelFiles.get(name);
  if (!load) {
    throw new Error(`No block model found for "${name}" at assets/minecraft/models/block/${name}.json.`);
  }
  const bytes = await load();
  return JSON.parse(new TextDecoder().decode(bytes));
}

/**
 * Resolves a block model by name, following its `parent` chain (however many hops) until it
 * finds a model with local `elements` — the common vanilla pattern of a leaf model that only
 * overrides a texture variable on a shared template (oak_fence_post -> fence_post is exactly
 * this; some chains go one level deeper). Each level's own `textures` overrides what it
 * inherits, closer-to-the-leaf winning on a shared key, same as vanilla's actual override
 * semantics. Guards against cycles/runaway chains with a hop limit — real vanilla chains are
 * only 1-2 hops deep.
 */
export async function resolveModelFile(name: string, modelFiles: ModelFiles): Promise<BlockModel> {
  const visited = new Set<string>();
  let currentName = name;
  // Collected as we walk leaf -> parent -> grandparent -> ...; index 0 ends up being the
  // level closest to the elements-bearing base, so applying them in array order after seeding
  // from the base naturally lets the true leaf (added last) win.
  const overrideLayers: Record<string, string>[] = [];

  for (let hop = 0; hop < MAX_PARENT_HOPS; hop++) {
    if (visited.has(currentName)) {
      throw new Error(`Model parent cycle detected while resolving "${name}" (revisited "${currentName}").`);
    }
    visited.add(currentName);

    const raw = (await loadRawModel(currentName, modelFiles)) as RawModelShape;

    if (raw.elements && raw.elements.length > 0) {
      const base = parseBlockModel(raw);
      let textures = base.textures;
      for (const layer of overrideLayers) textures = { ...textures, ...layer };
      return { elements: base.elements, textures };
    }

    if (!raw.parent) {
      return parseBlockModel(raw); // no elements, no parent — always throws its own clear error
    }

    overrideLayers.unshift(raw.textures ?? {});
    currentName = texturePathToKey(raw.parent);
  }

  throw new Error(`Model parent chain for "${name}" exceeded ${MAX_PARENT_HOPS} hops.`);
}
