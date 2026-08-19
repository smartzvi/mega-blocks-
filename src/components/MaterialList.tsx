import { useMemo, useState } from 'react';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { computeMaterialSummary, computeMaterialTally, formatMaterialListText } from '../lib/materials/tally';

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
      <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h8a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06l-3.12-3.122A1.5 1.5 0 009.378 6H4.5z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 12.75a.75.75 0 01-.53-.22l-3.5-3.5a.75.75 0 111.06-1.06l2.22 2.22V3a.75.75 0 011.5 0v7.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-.53.22z" />
      <path d="M3 14.25a.75.75 0 01.75.75v1.5c0 .414.336.75.75.75h11a.75.75 0 00.75-.75v-1.5a.75.75 0 011.5 0v1.5A2.25 2.25 0 0115.5 18.5h-11A2.25 2.25 0 012.25 16.5v-1.5a.75.75 0 01.75-.75z" />
    </svg>
  );
}

function shortName(blockId: string): string {
  return blockId.replace(/^minecraft:/, '').replace(/_/g, ' ');
}

/** Fallback for environments where the async Clipboard API is unavailable or blocked
 *  (missing permission, insecure context, older browsers) — legacy selection-based copy. */
function legacyCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

export function MaterialList() {
  const voxelGrid = useFinalVoxelGrid();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const entries = useMemo(() => (voxelGrid ? computeMaterialTally(voxelGrid) : []), [voxelGrid]);
  const summary = useMemo(() => computeMaterialSummary(entries), [entries]);

  if (!voxelGrid || entries.length === 0) return null;

  const listText = formatMaterialListText(entries, summary);

  async function handleCopy() {
    let ok: boolean;
    try {
      await navigator.clipboard.writeText(listText);
      ok = true;
    } catch {
      ok = legacyCopy(listText);
    }
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 1800);
  }

  function handleExport() {
    const blob = new Blob([listText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'material_list.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-[0_0_50px_-12px_rgba(16,185,129,0.1)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Material List</span>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <CopyIcon />
            {copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <DownloadIcon />
            Export .txt
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-slate-400">
        <span>
          <span className="font-semibold text-slate-200">{summary.totalDistinctBlocks}</span> block types
        </span>
        <span>
          <span className="font-semibold text-slate-200">{summary.totalBlocks.toLocaleString()}</span> blocks total
        </span>
        <span>
          <span className="font-semibold text-emerald-300">{summary.estimatedShulkersMixed}</span> shulkers needed
          (mixed)
        </span>
      </div>

      <ul className="max-h-72 overflow-y-auto px-2 pb-2">
        {entries.map((e) => (
          <li key={e.blockId} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-800/60">
            <span className="truncate text-sm capitalize text-slate-300">{shortName(e.blockId)}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-200">{e.count.toLocaleString()}</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5">
                {e.shulkers > 0 && `${e.shulkers} SB `}
                {e.stacks} stacks + {e.items}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
