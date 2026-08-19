import JSZip from 'jszip';

const BLOCK_TEXTURE_PREFIX = 'assets/minecraft/textures/block/';
const ENTITY_TEXTURE_PREFIX = 'assets/minecraft/textures/entity/';
const BLOCK_MODEL_PREFIX = 'assets/minecraft/models/block/';
const BLOCKSTATE_PREFIX = 'assets/minecraft/blockstates/';
const STRUCTURE_PREFIX = 'data/minecraft/structure/';

export interface LoadedArchive {
  /** key = texture path relative to textures/block/, without .png extension (e.g. "oak_log_top") */
  blockTextureFiles: Map<string, () => Promise<Uint8Array>>;
  /** key = texture path relative to textures/entity/, without .png extension (e.g.
   *  "chest/normal", "shulker/shulker_black") — chest/shulker box textures live here, outside
   *  textures/block/, since their rendering is hardcoded rather than model-driven. */
  entityTextureFiles: Map<string, () => Promise<Uint8Array>>;
  /** key = model path relative to models/block/, without .json extension (e.g. "torch") */
  modelFiles: Map<string, () => Promise<Uint8Array>>;
  /** key = block name, e.g. "oak_fence" — every entry here is a real, selectable block. */
  blockStateFiles: Map<string, () => Promise<Uint8Array>>;
  /** key = structure path relative to data/minecraft/structure/, without .nbt extension, nested
   *  folders kept as one searchable string (e.g. "village/plains/houses/plains_small_house_1").
   *  Every entry is a real, built-in structure bundled in the jar — gzip-compressed NBT, same
   *  format parseStructureFile.ts reads. */
  structureFiles: Map<string, () => Promise<Uint8Array>>;
}

export async function loadArchive(file: File): Promise<LoadedArchive> {
  const zip = await JSZip.loadAsync(file);
  const blockTextureFiles = new Map<string, () => Promise<Uint8Array>>();
  const entityTextureFiles = new Map<string, () => Promise<Uint8Array>>();
  const modelFiles = new Map<string, () => Promise<Uint8Array>>();
  const blockStateFiles = new Map<string, () => Promise<Uint8Array>>();
  const structureFiles = new Map<string, () => Promise<Uint8Array>>();

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.startsWith(BLOCK_TEXTURE_PREFIX) && relativePath.endsWith('.png')) {
      const key = relativePath.slice(BLOCK_TEXTURE_PREFIX.length, -'.png'.length);
      blockTextureFiles.set(key, () => entry.async('uint8array'));
    } else if (relativePath.startsWith(ENTITY_TEXTURE_PREFIX) && relativePath.endsWith('.png')) {
      const key = relativePath.slice(ENTITY_TEXTURE_PREFIX.length, -'.png'.length);
      entityTextureFiles.set(key, () => entry.async('uint8array'));
    } else if (relativePath.startsWith(BLOCK_MODEL_PREFIX) && relativePath.endsWith('.json')) {
      const key = relativePath.slice(BLOCK_MODEL_PREFIX.length, -'.json'.length);
      modelFiles.set(key, () => entry.async('uint8array'));
    } else if (relativePath.startsWith(BLOCKSTATE_PREFIX) && relativePath.endsWith('.json')) {
      const key = relativePath.slice(BLOCKSTATE_PREFIX.length, -'.json'.length);
      blockStateFiles.set(key, () => entry.async('uint8array'));
    } else if (relativePath.startsWith(STRUCTURE_PREFIX) && relativePath.endsWith('.nbt')) {
      const key = relativePath.slice(STRUCTURE_PREFIX.length, -'.nbt'.length);
      structureFiles.set(key, () => entry.async('uint8array'));
    }
  });

  if (blockTextureFiles.size === 0) {
    throw new Error(
      'No block textures found under assets/minecraft/textures/block/ — is this a valid Minecraft .jar or resource pack .zip?'
    );
  }

  return { blockTextureFiles, entityTextureFiles, modelFiles, blockStateFiles, structureFiles };
}
