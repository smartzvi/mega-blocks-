import { looksGzipped, ungzipBytes } from '../nbt/gzip';
import { readNbt } from '../nbt/nbtReader';
import type { ParsedStructure } from './common';
import { parseLitematic } from './parseLitematic';
import { parseVanillaStructure } from './parseVanillaStructure';

/**
 * Top-level structure-file entry point: detects gzip (both jar-bundled and real /structure-save
 * output are gzipped; a custom upload might not be), parses the NBT tree, and dispatches to the
 * matching format parser by root compound keys. Neither vanilla structure (`size`/`palette`/
 * `blocks`) nor litematic (`Regions`/`Version`) share any top-level key with WorldEdit's
 * `.schem`/`.schematic` formats (`Width`/`Height`/`Length`/`BlockData` or `Blocks`/`Data`), so a
 * mistaken upload of one of those gets a clear named error here instead of a silent misparse.
 */
export async function parseStructureFile(bytes: Uint8Array): Promise<ParsedStructure> {
  const decompressed = looksGzipped(bytes) ? ungzipBytes(bytes) : bytes;

  let root;
  try {
    root = readNbt(decompressed);
  } catch {
    throw new Error("Couldn't parse this file as NBT — it may be corrupt, truncated, or not a structure file at all.");
  }

  if (root.type !== 'compound') {
    throw new Error('Not a valid structure file — the root NBT tag is not a compound.');
  }

  const keys = new Set(Object.keys(root.value));
  if (keys.has('Regions') && keys.has('Version')) {
    return parseLitematic(root);
  }
  if (keys.has('size') && keys.has('palette') && keys.has('blocks')) {
    return parseVanillaStructure(root);
  }

  throw new Error(
    `Unrecognized structure format — expected a vanilla /structure .nbt file ("size"/"palette"/"blocks") ` +
      `or a Litematica .litematic file ("Regions"/"Version"), but found: ${[...keys].join(', ') || '(empty)'}. ` +
      `WorldEdit .schem/.schematic files are not supported.`
  );
}
