import { describe, expect, it } from 'vitest';
import type { PaletteEntry } from '../../types/minecraft';
import { packVoxelGrid } from '../voxel/packGrid';
import { countVoxels, createVoxelGrid, getVoxel, setVoxel } from '../voxel/voxelGrid';
import type { BuildProgress } from './buildProgress';
import { buildStructureGrid, createStructureBuildClient, warmUp, WorkerUnavailableError, type BuildRequest, type WorkerLike } from './structureBuildClient';
import type { WorkerRequest, WorkerResponse } from './structureBuildProtocol';

class FakeWorker implements WorkerLike {
  posted: WorkerRequest[] = [];
  terminated = false;
  onmessage: WorkerLike['onmessage'] = null;
  onerror: WorkerLike['onerror'] = null;
  postMessage(message: WorkerRequest): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.terminated = true;
  }
  reply(message: WorkerResponse): void {
    this.onmessage?.({ data: message });
  }
  get builds() {
    return this.posted.filter((m): m is Extract<WorkerRequest, { type: 'build' }> => m.type === 'build');
  }
  get inits() {
    return this.posted.filter((m) => m.type === 'init');
  }
}

const file = new File(['x'], 'mc.jar');
const palette: PaletteEntry[] = [];
function request(overrides: Partial<BuildRequest> = {}): BuildRequest {
  const culled = createVoxelGrid(2, 1, 1);
  setVoxel(culled, 0, 0, 0, 'minecraft:stone');
  return { file, palette, culled, blockIds: ['minecraft:stone'], resolution: 16, ...overrides };
}
function resultGrid() {
  const grid = createVoxelGrid(32, 16, 16);
  setVoxel(grid, 1, 2, 3, 'minecraft:stone');
  setVoxel(grid, 30, 5, 5, 'minecraft:oak_planks');
  return packVoxelGrid(grid);
}
const instantYield = async () => {};

function setup(settings: Parameters<typeof createStructureBuildClient>[1] = {}) {
  const workers: FakeWorker[] = [];
  const client = createStructureBuildClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  }, settings);
  return { client, workers };
}

describe('createStructureBuildClient', () => {
  it('sends init then a build, forwards progress, and rebuilds the returned grid from the packed arrays', async () => {
    const { client, workers } = setup();
    const events: BuildProgress[] = [];
    const pending = client.build(request(), { onProgress: (p) => events.push(p), yieldToBrowser: instantYield });

    const w = workers[0];
    expect(w.posted.map((m) => m.type)).toEqual(['init', 'build']);
    expect(w.builds[0].blockIds).toEqual(['minecraft:stone']);
    expect(w.builds[0].resolution).toBe(16);

    w.reply({ type: 'ready' });
    w.reply({ type: 'progress', id: w.builds[0].id, progress: { stage: 'place', fraction: 0.5 } });
    w.reply({ type: 'done', id: w.builds[0].id, packed: resultGrid() });

    const grid = await pending;
    expect(countVoxels(grid)).toBe(2);
    expect(getVoxel(grid, 1, 2, 3)).toBe('minecraft:stone');
    expect(getVoxel(grid, 30, 5, 5)).toBe('minecraft:oak_planks');
    expect(events[0]).toEqual({ stage: 'connect', fraction: 0 });
    expect(events).toContainEqual({ stage: 'place', fraction: 0.5 });
    expect(events[events.length - 1]).toEqual({ stage: 'prepare', fraction: 1 });
  });

  it('reuses a warm worker: the same jar and palette are not sent again', async () => {
    const { client, workers } = setup();
    const first = client.build(request(), { yieldToBrowser: instantYield });
    workers[0].reply({ type: 'done', id: workers[0].builds[0].id, packed: resultGrid() });
    await first;

    const second = client.build(request(), { yieldToBrowser: instantYield });
    expect(workers).toHaveLength(1);
    expect(workers[0].inits).toHaveLength(1);
    expect(workers[0].builds).toHaveLength(2);
    workers[0].reply({ type: 'done', id: workers[0].builds[1].id, packed: resultGrid() });
    await second;
  });

  it('re-initialises the worker when the jar or palette changes', async () => {
    const { client, workers } = setup();
    const first = client.build(request(), { yieldToBrowser: instantYield });
    workers[0].reply({ type: 'done', id: workers[0].builds[0].id, packed: resultGrid() });
    await first;

    const second = client.build(request({ palette: [] }), { yieldToBrowser: instantYield }); // a new palette array
    expect(workers[0].inits).toHaveLength(2);
    workers[0].reply({ type: 'done', id: workers[0].builds[1].id, packed: resultGrid() });
    await second;
  });

  it("rejects with the worker's message when a build fails, without treating it as the worker being unavailable", async () => {
    const { client, workers } = setup();
    const pending = client.build(request());
    workers[0].reply({ type: 'error', id: workers[0].builds[0].id, message: 'This structure at this resolution would require too many voxels.' });
    await expect(pending).rejects.toThrow('too many voxels');
    await expect(pending).rejects.not.toBeInstanceOf(WorkerUnavailableError);
  });

  it('reports WorkerUnavailableError and discards the worker when the jar fails to load, so the next build starts fresh', async () => {
    const { client, workers } = setup();
    const pending = client.build(request());
    workers[0].reply({ type: 'error', message: 'not a zip file' });
    await expect(pending).rejects.toBeInstanceOf(WorkerUnavailableError);
    expect(workers[0].terminated).toBe(true);

    const retry = client.build(request(), { yieldToBrowser: instantYield });
    expect(workers).toHaveLength(2);
    workers[1].reply({ type: 'done', id: workers[1].builds[0].id, packed: resultGrid() });
    await retry;
  });

  it('reports WorkerUnavailableError when the worker script crashes, or cannot be created at all', async () => {
    const { client, workers } = setup();
    const crashed = client.build(request());
    workers[0].onerror?.({ message: 'script failed to load' });
    await expect(crashed).rejects.toBeInstanceOf(WorkerUnavailableError);

    const unsupported = createStructureBuildClient(() => {
      throw new Error('no workers here');
    });
    await expect(unsupported.build(request())).rejects.toBeInstanceOf(WorkerUnavailableError);
  });

  it('rejects immediately for an already-cancelled build, without touching a worker', async () => {
    const { client, workers } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(client.build(request(), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(0);
  });

  it('cancelling a build that has only just started leaves the worker running and discards its result, so rapid clicking never pays a jar reload', async () => {
    let clock = 0;
    const { client, workers } = setup({ now: () => clock, terminateAfterMs: 1500 });
    const controller = new AbortController();
    const pending = client.build(request(), { signal: controller.signal });
    clock = 200;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminated).toBe(false);

    // The stale result arrives later and must be ignored, not crash.
    expect(() => workers[0].reply({ type: 'done', id: workers[0].builds[0].id, packed: resultGrid() })).not.toThrow();
    // The next build reuses the same warm worker.
    const next = client.build(request(), { yieldToBrowser: instantYield });
    expect(workers).toHaveLength(1);
    workers[0].reply({ type: 'done', id: workers[0].builds[1].id, packed: resultGrid() });
    await next;
  });

  it('cancelling a build that has been running a long time terminates the worker so the next build starts promptly', async () => {
    let clock = 0;
    const { client, workers } = setup({ now: () => clock, terminateAfterMs: 1500 });
    const controller = new AbortController();
    const pending = client.build(request(), { signal: controller.signal });
    clock = 4000;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0].terminated).toBe(true);

    const next = client.build(request(), { yieldToBrowser: instantYield });
    expect(workers).toHaveLength(2);
    expect(workers[1].inits).toHaveLength(1);
    workers[1].reply({ type: 'done', id: workers[1].builds[0].id, packed: resultGrid() });
    await next;
  });
});

describe('warmUp', () => {
  it('starts the worker with a small throwaway build, so the first real build finds it loaded and warm', () => {
    const { client, workers } = setup();
    warmUp(client, file, palette);
    expect(workers).toHaveLength(1);
    expect(workers[0].posted.map((m) => m.type)).toEqual(['init', 'build']);
    expect(workers[0].builds[0].resolution).toBe(16);
    expect(workers[0].builds[0].blockIds.length).toBeGreaterThan(1);
  });

  it('lets a real build reuse the warmed worker without a second init', async () => {
    const { client, workers } = setup();
    warmUp(client, file, palette);
    const real = client.build(request({ palette }), { yieldToBrowser: instantYield });
    expect(workers).toHaveLength(1);
    expect(workers[0].inits).toHaveLength(1);
    expect(workers[0].builds).toHaveLength(2);
    workers[0].reply({ type: 'done', id: workers[0].builds[0].id, packed: resultGrid() }); // the warm-up finishes, ignored
    workers[0].reply({ type: 'done', id: workers[0].builds[1].id, packed: resultGrid() });
    expect(countVoxels(await real)).toBe(2);
  });

  it('swallows a failed warm-up silently, since nothing depends on its result', async () => {
    const { client, workers } = setup();
    warmUp(client, file, palette);
    workers[0].reply({ type: 'error', id: workers[0].builds[0].id, message: 'boom' });
    await Promise.resolve(); // an unhandled rejection here would fail the test run
  });

  it('does nothing without an uploaded file or palette', () => {
    const { client, workers } = setup();
    warmUp(client, null, palette);
    warmUp(client, file, null);
    expect(workers).toHaveLength(0);
  });
});

describe('buildStructureGrid', () => {
  it('runs the main-thread fallback, passing progress through, when there is no uploaded file to give a worker', async () => {
    const culled = createVoxelGrid(1, 1, 1);
    const fallbackGrid = createVoxelGrid(16, 16, 16);
    setVoxel(fallbackGrid, 0, 0, 0, 'minecraft:stone');
    let receivedProgress: unknown = null;
    const onProgress = () => {};

    const grid = await buildStructureGrid({ file: null, palette, culled, blockIds: [], resolution: 16 }, { onProgress }, async (p) => {
      receivedProgress = p;
      return fallbackGrid;
    });

    expect(grid).toBe(fallbackGrid);
    expect(receivedProgress).toBe(onProgress);
  });
});
