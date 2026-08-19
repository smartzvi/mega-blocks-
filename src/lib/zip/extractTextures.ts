import type { BlockTextureSet, FaceName, FaceTexture } from '../../types/minecraft';
import { FACE_NAMES } from '../../types/minecraft';
import type { LoadedArchive } from './loadArchive';
import { decodeTextureTile } from './decodeTexture';

// Longest/most-specific suffixes first isn't actually required here since suffixes are
// distinct words, but order still documents precedence when a base name coincidentally
// ends with one of these strings.
const DIRECTIONAL_SUFFIXES: Array<{ suffix: string; face: 'top' | 'bottom' | FaceName }> = [
  { suffix: '_top', face: 'top' },
  { suffix: '_bottom', face: 'bottom' },
  { suffix: '_up', face: 'top' },
  { suffix: '_down', face: 'bottom' },
  { suffix: '_north', face: 'north' },
  { suffix: '_south', face: 'south' },
  { suffix: '_east', face: 'east' },
  { suffix: '_west', face: 'west' },
  { suffix: '_front', face: 'south' },
  { suffix: '_back', face: 'north' },
];
const SIDE_SUFFIX = '_side';

type SlotFace = 'bare' | 'side' | 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';

interface TextureGroup {
  slots: Partial<Record<SlotFace, string>>; // slot -> texture key (path w/o prefix/ext)
}

/** Splits every discovered texture key into (baseName, slot), grouped by baseName. */
function groupTextureKeys(keys: Iterable<string>): Map<string, TextureGroup> {
  const groups = new Map<string, TextureGroup>();

  for (const key of keys) {
    let base = key;
    let slot: SlotFace = 'bare';

    if (key.endsWith(SIDE_SUFFIX)) {
      base = key.slice(0, -SIDE_SUFFIX.length);
      slot = 'side';
    } else {
      const match = DIRECTIONAL_SUFFIXES.find((d) => key.endsWith(d.suffix));
      if (match) {
        base = key.slice(0, -match.suffix.length);
        slot = match.face;
      }
    }

    let group = groups.get(base);
    if (!group) {
      group = { slots: {} };
      groups.set(base, group);
    }
    group.slots[slot] = key;
  }

  return groups;
}

/** Resolves a group's slots into a texture key per output face, per the vanilla fallback rules. */
function resolveFaceKeys(group: TextureGroup): Record<FaceName, string> | null {
  const { slots } = group;
  const sideTex = slots.side ?? slots.bare;
  const topTex = slots.top ?? slots.bare;
  const bottomTex = slots.bottom ?? slots.top ?? slots.bare;

  const resolved: Partial<Record<FaceName, string>> = {
    top: topTex,
    bottom: bottomTex,
    north: slots.north ?? sideTex,
    south: slots.south ?? sideTex,
    east: slots.east ?? sideTex,
    west: slots.west ?? sideTex,
  };

  for (const face of FACE_NAMES) {
    if (!resolved[face]) return null;
  }
  return resolved as Record<FaceName, string>;
}

/**
 * Parses every texture under textures/block/, resolves the 6-face mapping for each block base
 * name, and decodes each unique texture file exactly once (shared across faces that reuse it,
 * e.g. oak_log's bottom reuses its top texture).
 */
export async function extractTextures(archive: LoadedArchive): Promise<Map<string, BlockTextureSet>> {
  const groups = groupTextureKeys(archive.blockTextureFiles.keys());
  const decodedCache = new Map<string, Promise<FaceTexture | null>>();

  const decodeKey = (key: string): Promise<FaceTexture | null> => {
    let cached = decodedCache.get(key);
    if (!cached) {
      const loader = archive.blockTextureFiles.get(key);
      if (!loader) {
        cached = Promise.resolve(null);
      } else {
        cached = loader().then((bytes) => decodeTextureTile(bytes, key));
      }
      decodedCache.set(key, cached);
    }
    return cached;
  };

  const result = new Map<string, BlockTextureSet>();

  for (const [base, group] of groups) {
    const faceKeys = resolveFaceKeys(group);
    if (!faceKeys) {
      console.warn(`Skipping "${base}": could not resolve all 6 faces from available texture files.`);
      continue;
    }

    const decoded = await Promise.all(FACE_NAMES.map((face) => decodeKey(faceKeys[face])));
    if (decoded.some((tex) => tex === null)) continue; // a referenced texture failed to decode

    const textureSet = {} as BlockTextureSet;
    FACE_NAMES.forEach((face, i) => {
      textureSet[face] = decoded[i]!;
    });
    result.set(base, textureSet);
  }

  return result;
}
