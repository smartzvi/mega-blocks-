import { meshTransferList, meshVoxels, type MeshInput, type VoxelMeshChunk } from './voxelMesher';

/**
 * Web Worker entry: builds the preview's chunk meshes off the main thread. Meshing a multi-million
 * voxel build takes over a second on a desktop and several on a phone, and on the page that froze
 * the whole UI. Every request is independent; the result's buffers are transferred, not copied.
 * `self` is cast rather than typed with the "webworker" lib, same as exportWorker.ts.
 */
export type MeshWorkerRequest = { id: number } & MeshInput;
export type MeshWorkerResponse = { id: number; chunks: VoxelMeshChunk[] } | { id: number; error: string };

interface WorkerScope {
  onmessage: ((event: MessageEvent<MeshWorkerRequest>) => void) | null;
  postMessage(message: MeshWorkerResponse, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, ...input } = event.data;
  try {
    const chunks = meshVoxels(input);
    scope.postMessage({ id, chunks }, meshTransferList(chunks));
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
