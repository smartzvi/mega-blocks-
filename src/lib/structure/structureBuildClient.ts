import type { PaletteEntry, VoxelGrid } from '../../types/minecraft';
import { packVoxelGrid, transferListOf, unpackVoxelGrid } from '../voxel/packGrid';
import { createVoxelGrid, setVoxel } from '../voxel/voxelGrid';
import type { BuildProgressCallback } from './buildProgress';
import type { WorkerRequest, WorkerResponse } from './structureBuildProtocol';

/** The slice of the browser Worker API the client uses — a fake implements this in tests. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}

/** The worker couldn't be created or crashed on startup — the caller should fall back to building
 *  on the main thread instead of failing the build. */
export class WorkerUnavailableError extends Error {}

export interface BuildRequest {
  file: File;
  palette: PaletteEntry[];
  /** The already-culled source grid (cheap to make; only the heavy stamping/composing is offloaded). */
  culled: VoxelGrid;
  blockIds: Iterable<string>;
  resolution: number;
}

export interface BuildOptions {
  signal?: AbortSignal;
  onProgress?: BuildProgressCallback;
  /** Test hooks for the page-side rebuild of the returned grid. */
  yieldToBrowser?: () => Promise<void>;
  unpackChunkSize?: number;
}

interface Job {
  startedAt: number;
  cancelled: boolean;
  onProgress?: BuildProgressCallback;
  resolve: (grid: VoxelGrid) => void;
  reject: (error: Error) => void;
  options: BuildOptions;
}

function abortError(): Error {
  return new DOMException('The build was cancelled.', 'AbortError');
}

export interface StructureBuildClient {
  build(request: BuildRequest, options?: BuildOptions): Promise<VoxelGrid>;
  dispose(): void;
}

/**
 * Talks to the structure-build worker. The worker (and the jar it loaded) is created lazily and
 * kept between builds, and re-initialised only when the jar or palette actually changes. A build
 * that is cancelled after running for a while terminates the worker outright so the next build
 * starts promptly; a cancellation of a build that has only just begun lets it finish in the
 * background and simply discards the result, since tearing the worker down would cost a full jar
 * reload for what is usually a fraction of a second of stray work (rapidly clicking through small
 * structures must not get slower than before).
 */
export function createStructureBuildClient(
  createWorker: () => WorkerLike,
  settings: { terminateAfterMs?: number; now?: () => number } = {}
): StructureBuildClient {
  const { terminateAfterMs = 1500, now = () => performance.now() } = settings;

  let worker: WorkerLike | null = null;
  let initFile: File | null = null;
  let initPalette: PaletteEntry[] | null = null;
  let nextId = 1;
  const jobs = new Map<number, Job>();

  function discardWorker(reason: Error | null): void {
    worker?.terminate();
    worker = null;
    initFile = null;
    initPalette = null;
    if (reason) {
      for (const job of jobs.values()) if (!job.cancelled) job.reject(reason);
    }
    jobs.clear();
  }

  function ensureWorker(): WorkerLike {
    if (worker) return worker;
    let created: WorkerLike;
    try {
      created = createWorker();
    } catch (error) {
      throw new WorkerUnavailableError(error instanceof Error ? error.message : 'Web Workers are not available.');
    }
    created.onmessage = (event) => handleMessage(event.data);
    created.onerror = (event) => discardWorker(new WorkerUnavailableError(event.message ?? 'The build worker crashed.'));
    worker = created;
    return created;
  }

  function handleMessage(message: WorkerResponse): void {
    if (message.type === 'ready') return;
    if (message.type === 'error' && message.id === undefined) {
      discardWorker(new WorkerUnavailableError(message.message));
      return;
    }
    const job = message.type === 'progress' || message.type === 'done' || message.type === 'error' ? jobs.get(message.id!) : undefined;
    if (!job) return;

    if (message.type === 'progress') {
      if (!job.cancelled) job.onProgress?.(message.progress);
      return;
    }
    jobs.delete(message.id!);
    if (job.cancelled) return;

    if (message.type === 'error') {
      job.reject(new Error(message.message));
      return;
    }
    const { onProgress, yieldToBrowser, unpackChunkSize } = job.options;
    unpackVoxelGrid(message.packed, {
      chunkSize: unpackChunkSize,
      yieldToBrowser,
      onProgress: (fraction) => {
        if (!job.cancelled) onProgress?.({ stage: 'prepare', fraction });
      },
    }).then(
      (grid) => (job.cancelled ? undefined : job.resolve(grid)),
      (error) => job.reject(error instanceof Error ? error : new Error(String(error)))
    );
  }

  return {
    build(request, options = {}) {
      if (options.signal?.aborted) return Promise.reject(abortError());

      let active: WorkerLike;
      try {
        active = ensureWorker();
      } catch (error) {
        return Promise.reject(error);
      }
      const id = nextId++;

      return new Promise<VoxelGrid>((resolve, reject) => {
        const job: Job = { startedAt: now(), cancelled: false, onProgress: options.onProgress, resolve, reject, options };
        jobs.set(id, job);

        options.signal?.addEventListener(
          'abort',
          () => {
            if (job.cancelled) return;
            job.cancelled = true;
            reject(abortError());
            if (now() - job.startedAt > terminateAfterMs) discardWorker(null);
          },
          { once: true }
        );

        if (initFile !== request.file || initPalette !== request.palette) {
          initFile = request.file;
          initPalette = request.palette;
          options.onProgress?.({ stage: 'connect', fraction: 0 });
          active.postMessage({ type: 'init', file: request.file, palette: request.palette });
        }

        const packed = packVoxelGrid(request.culled);
        active.postMessage(
          { type: 'build', id, culled: packed, blockIds: [...request.blockIds], resolution: request.resolution },
          transferListOf(packed)
        );
      });
    },

    dispose() {
      discardWorker(abortError());
    },
  };
}

// --- warm-up ----------------------------------------------------------------------------------

// A fresh worker starts cold — it has to load the jar and its code hasn't been optimized yet — which
// measured about 3 s slower on a large structure than the same worker once warm. The user is
// usually still choosing a structure at that point, so a tiny throwaway build hides most of it.
const WARM_UP_BLOCKS = [
  'minecraft:stone',
  'minecraft:oak_planks',
  'minecraft:oak_log[axis=y]',
  'minecraft:oak_stairs[facing=east,half=bottom,shape=straight]',
];

/** Starts a worker and gives it a small build to chew on, ignoring the result and any failure. */
export function warmUp(client: StructureBuildClient, file: File | null, palette: PaletteEntry[] | null): void {
  if (!file || !palette) return;
  const culled = createVoxelGrid(5, 3, 5);
  let i = 0;
  for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 5; z++) setVoxel(culled, x, y, z, WARM_UP_BLOCKS[i++ % WARM_UP_BLOCKS.length]);
  client.build({ file, palette, culled, blockIds: WARM_UP_BLOCKS, resolution: 16 }).catch(() => {});
}

// --- the app-wide client ----------------------------------------------------------------------

let sharedClient: StructureBuildClient | null = null;

function shared(): StructureBuildClient {
  sharedClient ??= createStructureBuildClient(
    () => new Worker(new URL('./structureBuildWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
  );
  return sharedClient;
}

/** Warms the app-wide worker (see `warmUp`); a no-op where workers aren't supported. */
export function warmUpStructureWorker(file: File | null, palette: PaletteEntry[] | null): void {
  if (typeof Worker === 'undefined') return;
  warmUp(shared(), file, palette);
}

/**
 * Builds a structure's final voxel grid in the background worker, falling back to `mainThread` (the
 * original in-page build) when there is no uploaded file to hand the worker, workers aren't
 * supported here, or the worker fails to start. A cancelled build rejects with an AbortError, which
 * callers should treat as "ignore", not as a failure.
 */
export async function buildStructureGrid(
  request: Omit<BuildRequest, 'file'> & { file: File | null },
  options: BuildOptions,
  mainThread: (onProgress?: BuildProgressCallback) => Promise<VoxelGrid>
): Promise<VoxelGrid> {
  if (request.file === null || typeof Worker === 'undefined') return mainThread(options.onProgress);
  try {
    return await shared().build({ ...request, file: request.file }, options);
  } catch (error) {
    if (error instanceof WorkerUnavailableError) return mainThread(options.onProgress);
    throw error;
  }
}
