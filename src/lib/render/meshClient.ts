import { meshVoxels, type MeshInput, type VoxelMeshChunk } from './voxelMesher';
import type { MeshWorkerRequest, MeshWorkerResponse } from './meshWorker';

let worker: Worker | null = null;
let workerFailed = false;
let nextId = 1;
const pending = new Map<number, { resolve: (chunks: VoxelMeshChunk[]) => void; reject: (error: Error) => void; input: MeshInput }>();

function failAll(): void {
  // The worker couldn't start or crashed: finish every waiting job on the main thread instead.
  workerFailed = true;
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) {
    try {
      job.resolve(meshVoxels(job.input));
    } catch (error) {
      job.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (worker || workerFailed) return worker;
  if (typeof Worker === 'undefined') {
    workerFailed = true;
    return null;
  }
  try {
    worker = new Worker(new URL('./meshWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerFailed = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<MeshWorkerResponse>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if ('error' in event.data) job.reject(new Error(event.data.error));
    else job.resolve(event.data.chunks);
  };
  worker.onerror = () => failAll();
  return worker;
}

/**
 * Meshes a grid in the background worker, or on the main thread when workers aren't available or
 * the worker crashes. The input is copied to the worker, not transferred, so it's still here for
 * that fallback (copying typed arrays is a plain memory copy: tens of milliseconds for 4M voxels).
 */
export function meshVoxelsAsync(input: MeshInput): Promise<VoxelMeshChunk[]> {
  const active = ensureWorker();
  if (!active) return Promise.resolve(meshVoxels(input));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, input });
    const request: MeshWorkerRequest = { id, ...input };
    active.postMessage(request);
  });
}
