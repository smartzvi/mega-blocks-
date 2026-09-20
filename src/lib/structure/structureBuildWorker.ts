import type { PaletteEntry } from '../../types/minecraft';
import { loadArchive, type LoadedArchive } from '../zip/loadArchive';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../zip/decodeTexture';
import { packVoxelGrid, transferListOf, unpackVoxelGrid } from '../voxel/packGrid';
import { buildStructureVoxelGrid } from './buildStructureVoxelGrid';
import type { WorkerRequest, WorkerResponse } from './structureBuildProtocol';

/**
 * Web Worker entry: runs the heavy half of a structure build — stamping every block and composing
 * and trimming the final grid, which froze the page for seconds on a large structure — off the main
 * thread. It loads the jar itself on `init` (a File crosses the worker boundary fine) and keeps it,
 * plus the palette, for every later build.
 *
 * Only `self` is touched from the DOM world, and it is cast rather than declared with the
 * "webworker" lib, which would conflict with the page's own "DOM" lib in this single TypeScript
 * program. Everything else here is plain, DOM-free code (texture decoding uses OffscreenCanvas —
 * see decodeTexture.ts).
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

let archive: LoadedArchive | null = null;
let palette: PaletteEntry[] | null = null;

async function handle(message: WorkerRequest): Promise<void> {
  if (message.type === 'init') {
    try {
      archive = await loadArchive(message.file);
      palette = message.palette;
      scope.postMessage({ type: 'ready' });
    } catch (error) {
      scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
    }
    return;
  }

  const { id } = message;
  try {
    if (!archive || !palette) throw new Error('The build worker was asked to build before it finished loading the jar.');
    const loaded = archive;

    // The culled source grid is small (source cells, not voxels) — rebuilt in one go.
    const culled = await unpackVoxelGrid(message.culled, { chunkSize: Infinity });
    const decodeTexture = async (key: string) =>
      (await loadAndDecodeTexture(key, loaded.blockTextureFiles)) ?? loadAndDecodeEntityTexture(key, loaded.entityTextureFiles);

    const grid = await buildStructureVoxelGrid(
      culled,
      new Set(message.blockIds),
      palette,
      decodeTexture,
      loaded.blockStateFiles,
      loaded.modelFiles,
      message.resolution,
      (progress) => scope.postMessage({ type: 'progress', id, progress })
    );

    const packed = packVoxelGrid(grid);
    scope.postMessage({ type: 'done', id, packed }, transferListOf(packed));
  } catch (error) {
    scope.postMessage({ type: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
}

// Requests are handled strictly one after another: `init` is async, and a `build` sent right behind
// it must wait for the jar to finish loading.
let queue: Promise<void> = Promise.resolve();
scope.onmessage = (event) => {
  queue = queue.then(() => handle(event.data));
};
