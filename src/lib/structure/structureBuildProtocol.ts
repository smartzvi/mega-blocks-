import type { PaletteEntry } from '../../types/minecraft';
import type { PackedVoxelGrid } from '../voxel/packGrid';
import type { BuildProgress } from './buildProgress';

/** Messages the page sends to the structure-build worker. */
export type WorkerRequest =
  /** Load the jar and remember the palette. Sent once per (file, palette) pair; the worker keeps
   *  both across builds, so later builds skip the multi-second jar load. */
  | { type: 'init'; file: File; palette: PaletteEntry[] }
  /** Build one structure's final voxel grid from its already-culled source grid. */
  | { type: 'build'; id: number; culled: PackedVoxelGrid; blockIds: string[]; resolution: number };

/** Messages the worker sends back. */
export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'progress'; id: number; progress: BuildProgress }
  | { type: 'done'; id: number; packed: PackedVoxelGrid }
  /** `id` is absent for a failure that isn't tied to one build (the jar failing to load). */
  | { type: 'error'; id?: number; message: string };
