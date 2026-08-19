import { useMemo } from 'react';
import { useAppState } from '../state/AppContext';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { exportLitematic } from '../lib/nbt/litematicExport';
import { exportVanillaStructureNbt } from '../lib/nbt/vanillaStructureExport';

function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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

  const sourceName =
    state.mode === 'item'
      ? state.selectedItemName
      : state.mode === 'structure'
        ? state.selectedStructureSource?.name
        : state.mode === 'mobs'
          ? state.selectedMobName
          : state.selectedBlockName;

  // Re-flattening a multi-million-voxel structure grid on every render would be a real cost at
  // that scale (harmless at block/item mode's ≤64³ ceiling, where this was previously unmemoized).
  const blockCount = useMemo(() => (voxelGrid ? voxelGrid.voxels.flat(2).filter((id) => id !== null).length : 0), [voxelGrid]);

  if (!voxelGrid || !sourceName) return null;

  const shapeSuffix =
    state.mode === 'item' ? 'item' : state.mode === 'structure' ? 'structure' : state.mode === 'mobs' ? 'mob' : state.shape;
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
          : SHAPE_LABEL[state.shape];

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
          onClick={() => downloadBytes(exportLitematic(voxelGrid, baseName), `${baseName}.litematic`)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-700/50 active:translate-y-0"
        >
          <DownloadIcon />
          Download .litematic
        </button>
        <button
          onClick={() => downloadBytes(exportVanillaStructureNbt(voxelGrid), `${baseName}.nbt`)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-700/50 active:translate-y-0"
        >
          <DownloadIcon />
          Download .nbt
        </button>
      </div>
    </div>
  );
}
