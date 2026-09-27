import { useMemo, useState } from 'react';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { useFinalPalette } from '../state/useFinalPalette';
import { computeMaterialSummary, computeMaterialTally, formatMaterialListText } from '../lib/materials/tally';
import { BlockIcon } from './ui/BlockIcon';
import { Panel, QuietButton, SectionHeader } from './ui/Panel';

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-line px-4 py-3 last:border-r-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className="mt-1 font-mono text-lg tabular-nums text-fg">{value}</dd>
    </div>
  );
}

export function MaterialList() {
  const voxelGrid = useFinalVoxelGrid();
  const palette = useFinalPalette();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const entries = useMemo(() => (voxelGrid ? computeMaterialTally(voxelGrid) : []), [voxelGrid]);
  const summary = useMemo(() => computeMaterialSummary(entries), [entries]);
  const texturesById = useMemo(() => new Map((palette ?? []).map((p) => [p.id, p.textures])), [palette]);

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
    <Panel>
      <SectionHeader title="Materials">
        <QuietButton onClick={handleCopy}>
          <CopyIcon />
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
        </QuietButton>
        <QuietButton onClick={handleExport}>
          <DownloadIcon />
          .txt
        </QuietButton>
      </SectionHeader>

      <dl className="grid grid-cols-3 border-b border-line">
        <Stat label="Block types" value={summary.totalDistinctBlocks.toLocaleString()} />
        <Stat label="Blocks total" value={summary.totalBlocks.toLocaleString()} />
        <Stat label="Shulkers (mixed)" value={summary.estimatedShulkersMixed.toLocaleString()} />
      </dl>

      <ul className="max-h-80 overflow-y-auto py-1">
        {entries.map((e) => (
          <li key={e.blockId} className="flex items-center gap-3 px-4 py-1.5 hover:bg-raised">
            <BlockIcon textures={texturesById.get(e.blockId)} />
            <span className="min-w-0 flex-1 truncate text-sm capitalize text-fg">{shortName(e.blockId)}</span>
            <span className="shrink-0 text-right font-mono text-[13px] tabular-nums text-fg">{e.count.toLocaleString()}</span>
            <span className="hidden w-40 shrink-0 text-right font-mono text-xs tabular-nums text-faint sm:inline" title="shulker boxes + stacks of 64 + items">
              {e.shulkers > 0 && `${e.shulkers} SB + `}
              {e.stacks}×64 + {e.items}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
