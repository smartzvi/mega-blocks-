import type { VoxelGrid } from '../../types/minecraft';
import { packVoxelGrid, transferListOf } from '../voxel/packGrid';
import type { ExportFormat, ExportWorkerRequest, ExportWorkerResponse } from './exportProtocol';
import type { ExportProgressCallback } from './exportProgress';

/** The slice of the browser Worker API the client uses — a fake implements this in tests. */
export interface ExportWorkerLike {
  postMessage(message: ExportWorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: ExportWorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

/** The worker couldn't be created or crashed — the caller should fall back to exporting on the
 *  main thread instead of failing the export outright. */
export class ExportWorkerUnavailableError extends Error {}

interface Job {
  resolve: (bytes: Uint8Array) => void;
  reject: (error: Error) => void;
  onProgress?: ExportProgressCallback;
}

export interface ExportClient {
  exportGrid(grid: VoxelGrid, format: ExportFormat, name: string, onProgress?: ExportProgressCallback): Promise<Uint8Array>;
  dispose(): void;
}

/**
 * Talks to the export worker. Unlike structureBuildClient, there's no jar to keep loaded between
 * calls — the worker is created lazily and reused (avoiding a fresh-worker startup cost on every
 * export), but every request is otherwise independent, so a crash just discards the worker for the
 * next call to recreate rather than needing any "re-init" bookkeeping.
 */
export function createExportClient(createWorker: () => ExportWorkerLike): ExportClient {
  let worker: ExportWorkerLike | null = null;
  let nextId = 1;
  const jobs = new Map<number, Job>();

  function discardWorker(reason: Error | null): void {
    worker?.terminate();
    worker = null;
    if (reason) {
      for (const job of jobs.values()) job.reject(reason);
    }
    jobs.clear();
  }

  function ensureWorker(): ExportWorkerLike {
    if (worker) return worker;
    let created: ExportWorkerLike;
    try {
      created = createWorker();
    } catch (error) {
      throw new ExportWorkerUnavailableError(error instanceof Error ? error.message : 'Web Workers are not available.');
    }
    created.onmessage = (event) => handleMessage(event.data);
    created.onerror = (event) => discardWorker(new ExportWorkerUnavailableError(event.message ?? 'The export worker crashed.'));
    worker = created;
    return created;
  }

  function handleMessage(message: ExportWorkerResponse): void {
    const job = jobs.get(message.id);
    if (!job) return;

    if (message.type === 'progress') {
      job.onProgress?.(message.progress);
      return;
    }
    jobs.delete(message.id);
    if (message.type === 'error') job.reject(new Error(message.message));
    else job.resolve(message.bytes);
  }

  return {
    exportGrid(grid, format, name, onProgress) {
      let active: ExportWorkerLike;
      try {
        active = ensureWorker();
      } catch (error) {
        return Promise.reject(error);
      }
      const id = nextId++;

      return new Promise<Uint8Array>((resolve, reject) => {
        jobs.set(id, { resolve, reject, onProgress });
        const packed = packVoxelGrid(grid);
        active.postMessage({ type: 'export', id, format, grid: packed, name }, transferListOf(packed));
      });
    },

    dispose() {
      discardWorker(new Error('The export client was disposed.'));
    },
  };
}

// --- the app-wide client ------------------------------------------------------------------------

let sharedClient: ExportClient | null = null;

function shared(): ExportClient {
  sharedClient ??= createExportClient(
    () => new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' }) as unknown as ExportWorkerLike
  );
  return sharedClient;
}

/**
 * Exports a voxel grid to bytes in the background worker, falling back to `mainThread` (the
 * original synchronous export, still with real progress from the instrumented write loop, just
 * without a live-updating bar — see ExportButtons.tsx) when workers aren't supported here or the
 * worker fails to start.
 */
export async function exportGridToBytes(
  grid: VoxelGrid,
  format: ExportFormat,
  name: string,
  onProgress: ExportProgressCallback | undefined,
  mainThread: (onProgress?: ExportProgressCallback) => Uint8Array
): Promise<Uint8Array> {
  if (typeof Worker === 'undefined') return mainThread(onProgress);
  try {
    return await shared().exportGrid(grid, format, name, onProgress);
  } catch (error) {
    if (error instanceof ExportWorkerUnavailableError) return mainThread(onProgress);
    throw error;
  }
}
