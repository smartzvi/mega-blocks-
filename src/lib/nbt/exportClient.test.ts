import { describe, expect, it } from 'vitest';
import { createVoxelGrid, setVoxel } from '../voxel/voxelGrid';
import { createExportClient, ExportWorkerUnavailableError, exportGridToBytes, type ExportWorkerLike } from './exportClient';
import type { ExportProgress } from './exportProgress';
import type { ExportWorkerRequest, ExportWorkerResponse } from './exportProtocol';

class FakeWorker implements ExportWorkerLike {
  posted: ExportWorkerRequest[] = [];
  terminated = false;
  onmessage: ExportWorkerLike['onmessage'] = null;
  onerror: ExportWorkerLike['onerror'] = null;
  postMessage(message: ExportWorkerRequest): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: ExportWorkerResponse): void {
    this.onmessage?.({ data: message });
  }
}

function grid() {
  const g = createVoxelGrid(2, 2, 2);
  setVoxel(g, 0, 0, 0, 'minecraft:stone');
  return g;
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = createExportClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
}

describe('createExportClient', () => {
  it('sends one export request with the packed grid, forwards progress, and resolves with the returned bytes', async () => {
    const { client, workers } = setup();
    const events: ExportProgress[] = [];
    const pending = client.exportGrid(grid(), 'litematic', 'Test', (p) => events.push(p));

    const w = workers[0];
    expect(w.posted).toHaveLength(1);
    expect(w.posted[0]).toMatchObject({ type: 'export', format: 'litematic', name: 'Test' });
    expect(w.posted[0].grid.table).toContain('minecraft:stone');

    w.reply({ type: 'progress', id: w.posted[0].id, progress: { stage: 'write', fraction: 0.5 } });
    const bytes = new Uint8Array([1, 2, 3]);
    w.reply({ type: 'done', id: w.posted[0].id, bytes });

    expect(await pending).toBe(bytes);
    expect(events).toEqual([{ stage: 'write', fraction: 0.5 }]);
  });

  it('reuses the same worker across exports — no re-creation, one message per export', async () => {
    const { client, workers } = setup();
    const first = client.exportGrid(grid(), 'litematic', 'A');
    workers[0].reply({ type: 'done', id: workers[0].posted[0].id, bytes: new Uint8Array() });
    await first;

    const second = client.exportGrid(grid(), 'nbt', 'B');
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(2);
    workers[0].reply({ type: 'done', id: workers[0].posted[1].id, bytes: new Uint8Array() });
    await second;
  });

  it("rejects with the worker's message on an export failure, without treating it as the worker being unavailable", async () => {
    const { client, workers } = setup();
    const pending = client.exportGrid(grid(), 'litematic', 'A');
    workers[0].reply({ type: 'error', id: workers[0].posted[0].id, message: 'Too many distinct blocks.' });
    await expect(pending).rejects.toThrow('Too many distinct blocks.');
    await expect(pending).rejects.not.toBeInstanceOf(ExportWorkerUnavailableError);
  });

  it('reports ExportWorkerUnavailableError and discards the worker when the worker script crashes, or cannot be created at all', async () => {
    const { client, workers } = setup();
    const crashed = client.exportGrid(grid(), 'litematic', 'A');
    workers[0].onerror?.({ message: 'script failed to load' });
    await expect(crashed).rejects.toBeInstanceOf(ExportWorkerUnavailableError);
    expect(workers[0].terminated).toBe(true);

    const unsupported = createExportClient(() => {
      throw new Error('no workers here');
    });
    await expect(unsupported.exportGrid(grid(), 'litematic', 'A')).rejects.toBeInstanceOf(ExportWorkerUnavailableError);
  });

  it('a later export still resolves correctly after an earlier one on the same worker failed', async () => {
    const { client, workers } = setup();
    const failed = client.exportGrid(grid(), 'litematic', 'A');
    workers[0].reply({ type: 'error', id: workers[0].posted[0].id, message: 'boom' });
    await expect(failed).rejects.toThrow('boom');

    const ok = client.exportGrid(grid(), 'nbt', 'B');
    expect(workers).toHaveLength(1); // same worker — a per-job failure doesn't discard it
    const bytes = new Uint8Array([1]);
    workers[0].reply({ type: 'done', id: workers[0].posted[1].id, bytes });
    expect(await ok).toBe(bytes);
  });
});

// exportGridToBytes's worker-dispatch and unavailable-fallback branches are the same logic
// createExportClient's own tests above already exercise directly; the only branch reachable here
// without a real constructible Worker (unavailable under vitest's node environment) is the one that
// never touches a worker at all — same precedent structureBuildClient.test.ts follows for
// buildStructureGrid.
describe('exportGridToBytes', () => {
  it('falls back to mainThread directly, without touching a worker, when Worker is undefined', async () => {
    const fallbackBytes = new Uint8Array([3]);
    const original = globalThis.Worker;
    // @ts-expect-error deliberately removed for this test
    delete globalThis.Worker;
    try {
      const bytes = await exportGridToBytes(grid(), 'nbt', 'A', undefined, () => fallbackBytes);
      expect(bytes).toBe(fallbackBytes);
    } finally {
      globalThis.Worker = original;
    }
  });
});
