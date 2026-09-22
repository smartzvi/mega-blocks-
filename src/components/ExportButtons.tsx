import { useMemo, useState } from 'react';
import { useAppState } from '../state/AppContext';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { exportLitematic } from '../lib/nbt/litematicExport';
import { exportVanillaStructureNbt } from '../lib/nbt/vanillaStructureExport';
import { exportGridToBytes } from '../lib/nbt/exportClient';
import type { ExportProgress } from '../lib/nbt/exportProgress';
import { countVoxels } from '../lib/voxel/voxelGrid';
import { ExportProgressBar } from './ExportProgressBar';

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right after click() can cancel the download of a large file before the browser has
  // finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Lets the browser paint (a "Preparing…" message) before a long synchronous export starts.
 *  requestAnimationFrame never fires in a hidden tab, so a timer backs it up — otherwise the
 *  export would wait forever. */
const nextPaint = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
    setTimeout(resolve, 100);
  });

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12.75a.75.75 0 01-.53-.22l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3a.75.75 0 011.5 0v7.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-.53.22z" />
      <path d="M3 14.25a.75.75 0 01.75.75v1.5c0 .414.336.75.75.75h11a.75.75 0 00.75-.75v-1.5a.75.75 0 011.5 0v1.5A2.25 2.25 0 0115.5 18.5h-11A2.25 2.25 0 012.25 16.5v-1.5a.75.75 0 01.75-.75z" />
    </svg>
  );
}

const SHAPE_LABEL: Record<string, string> = {
  full_cube: 'hollow shell',
  slab: 'slab cutout',
  stair: 'stair cutout',
  door: 'door cutout',
};

export function ExportButtons() {
  const state = useAppState();
  const voxelGrid = useFinalVoxelGrid();
  const [exporting, setExporting] = useState<'litematic' | 'nbt' | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const sourceName =
    state.mode === 'item'
      ? state.selectedItemName
      : state.mode === 'structure'
        ? state.selectedStructureSource?.name
        : state.mode === 'mobs'
          ? state.selectedMobName
          : state.mode === 'trees'
            ? state.selectedTreeName
            : state.selectedBlockName;

  // Re-flattening a multi-million-voxel structure grid on every render would be a real cost at
  // that scale (harmless at block/item mode's ≤64³ ceiling, where this was previously unmemoized).
  const blockCount = useMemo(() => (voxelGrid ? countVoxels(voxelGrid) : 0), [voxelGrid]);

  if (!voxelGrid || !sourceName) return null;

  const shapeSuffix =
    state.mode === 'item'
      ? 'item'
      : state.mode === 'structure'
        ? 'structure'
        : state.mode === 'mobs'
          ? 'mob'
          : state.mode === 'trees'
            ? 'tree'
            : state.shape;
  // Structure names can contain slashes (e.g. "village/plains/houses/plains_small_house_1") from
  // the jar's nested folder layout — not valid in a downloaded filename.
  const safeSourceName = sourceName.replace(/[/\\]/g, '_');
  const baseName = `${safeSourceName}_megablock_${voxelGrid.sizeX}x${voxelGrid.sizeY}x${voxelGrid.sizeZ}_${shapeSuffix}`;
  const shapeLabel =
    state.mode === 'item'
      ? 'item model'
      : state.mode === 'structure'
        ? 'structure'
        : state.mode === 'mobs'
          ? 'mob model'
          : state.mode === 'trees'
            ? 'tree'
            : SHAPE_LABEL[state.shape];

  async function runExport(kind: 'litematic' | 'nbt') {
    if (exporting) return;
    setExportError(null);
    setExporting(kind);
    setProgress(null);
    try {
      // One frame's delay before the real work starts (worker dispatch is cheap either way) so the
      // "Preparing…" state actually paints, same reasoning nextPaint's own doc explains.
      await nextPaint();
      const bytes = await exportGridToBytes(
        voxelGrid!,
        kind,
        baseName,
        (p) => setProgress(p),
        // Only reached with no worker available: no live-updating bar mid-call (a synchronous loop
        // on the main thread can't repaint until it returns — see exportClient.ts's own doc), but
        // still the same instrumented, real export.
        (onProgress) => (kind === 'litematic' ? exportLitematic(voxelGrid!, baseName, onProgress) : exportVanillaStructureNbt(voxelGrid!, onProgress))
      );
      downloadBytes(bytes, `${baseName}.${kind}`);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setExportError(`Couldn't create the .${kind} file — ${detail}. Try a lower resolution or a smaller build.`);
    } finally {
      setExporting(null);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-1.5 text-xs font-medium text-slate-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(16,185,129,0.6)]" />
        {voxelGrid.sizeX}×{voxelGrid.sizeY}×{voxelGrid.sizeZ} {shapeLabel}
        <span className="text-slate-600">·</span>
        <span className="text-emerald-300">{blockCount.toLocaleString()}</span> blocks
      </div>

      <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
        <button
          onClick={() => runExport('litematic')}
          disabled={exporting !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-700/50 active:translate-y-0 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <DownloadIcon />
          {exporting === 'litematic' ? 'Preparing…' : 'Download .litematic'}
        </button>
        <button
          onClick={() => runExport('nbt')}
          disabled={exporting !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-700/50 active:translate-y-0 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
        >
          <DownloadIcon />
          {exporting === 'nbt' ? 'Preparing…' : 'Download .nbt'}
        </button>
      </div>
      {exporting && <ExportProgressBar progress={progress} />}
      {exportError && (
        <p className="max-w-md rounded-lg bg-red-950/50 px-3 py-2 text-center text-xs text-red-300 ring-1 ring-red-900">{exportError}</p>
      )}
    </div>
  );
}
