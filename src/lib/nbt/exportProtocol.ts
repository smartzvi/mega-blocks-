import type { PackedVoxelGrid } from '../voxel/packGrid';
import type { ExportProgress } from './exportProgress';

export type ExportFormat = 'litematic' | 'nbt';

/** The one message the page sends to the export worker: everything needed for one file, since
 *  unlike the structure-build worker there's no jar/palette to load first — this is a pure
 *  transform of an already-finished grid into bytes. */
export interface ExportWorkerRequest {
  type: 'export';
  id: number;
  format: ExportFormat;
  grid: PackedVoxelGrid;
  /** Only used for the litematic format's Metadata.Name. */
  name: string;
}

/** Messages the worker sends back. */
export type ExportWorkerResponse =
  | { type: 'progress'; id: number; progress: ExportProgress }
  | { type: 'done'; id: number; bytes: Uint8Array }
  | { type: 'error'; id: number; message: string };
