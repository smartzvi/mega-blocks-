import { useMemo, useState } from 'react';
import { useAppState } from '../state/AppContext';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { exportLitematic } from '../lib/nbt/litematicExport';
import { exportVanillaStructureNbt } from '../lib/nbt/vanillaStructureExport';
import { exportGridToBytes } from '../lib/nbt/exportClient';
import type { ExportProgress } from '../lib/nbt/exportProgress';
import { countVoxels } from '../lib/voxel/voxelGrid';
import { ExportProgressBar } from './ExportProgressBar';
import { Panel, SectionHeader } from './ui/Panel';
import { ErrorNote } from './ui/Search';

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
    <Panel>
      <SectionHeader title="Export">
        <span className="font-mono text-xs text-faint">
          {voxelGrid.sizeX}×{voxelGrid.sizeY}×{voxelGrid.sizeZ} {shapeLabel} · {blockCount.toLocaleString()} blocks
        </span>
      </SectionHeader>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={() => runExport('litematic')}
            disabled={exporting !== null}
            className="flex flex-1 items-center justify-center gap-2 rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
          >
            <DownloadIcon />
            {exporting === 'litematic' ? 'Preparing…' : 'Download .litematic'}
          </button>
          <button
            onClick={() => runExport('nbt')}
            disabled={exporting !== null}
            className="flex flex-1 items-center justify-center gap-2 rounded-control border border-line-strong bg-raised px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-hover disabled:cursor-wait disabled:opacity-60"
          >
            <DownloadIcon />
            {exporting === 'nbt' ? 'Preparing…' : 'Download .nbt'}
          </button>
        </div>
        <p className="truncate font-mono text-[11px] text-faint" title={baseName}>
          {baseName}
        </p>
        {exporting && <ExportProgressBar progress={progress} />}
        {exportError && <ErrorNote>{exportError}</ErrorNote>}
      </div>
    </Panel>
  );
}
