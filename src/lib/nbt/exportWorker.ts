import { unpackVoxelGrid } from '../voxel/packGrid';
import { exportLitematic } from './litematicExport';
import { exportVanillaStructureNbt } from './vanillaStructureExport';
import type { ExportWorkerRequest, ExportWorkerResponse } from './exportProtocol';
import type { ExportProgress } from './exportProgress';

/**
 * Web Worker entry: turns a finished voxel grid into downloadable bytes off the main thread, so a
 * multi-million-voxel export no longer freezes the page the way it used to (see litematicExport.ts
 * and vanillaStructureExport.ts's own docs for what made those slow). Unlike the structure-build
 * worker (structureBuildWorker.ts) there's no jar to load first — export only ever transforms a
 * grid the page already finished building — so every request is handled independently, with no
 * `init` step and no state kept between them.
 *
 * The received grid is rebuilt into a plain VoxelGrid in one shot (`chunkSize: Infinity` — no need
 * to yield between slices the way the page does after receiving one back, since blocking this
 * worker's own thread doesn't block the page). Only `self` is touched from the DOM world, and it is
 * cast rather than declared with the "webworker" lib, which would conflict with the page's own
 * "DOM" lib in this single TypeScript program.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null;
  postMessage(message: ExportWorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

async function handle(message: ExportWorkerRequest): Promise<void> {
  const { id } = message;
  try {
    const grid = await unpackVoxelGrid(message.grid, { chunkSize: Infinity });
    const onProgress = (progress: ExportProgress) => scope.postMessage({ type: 'progress', id, progress });
    const bytes = message.format === 'litematic' ? exportLitematic(grid, message.name, onProgress) : exportVanillaStructureNbt(grid, onProgress);
    scope.postMessage({ type: 'done', id, bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (error) {
    scope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
}

scope.onmessage = (event) => {
  handle(event.data);
};
