import { useEffect, useState } from 'react';
import { EXPORT_STAGE_LABELS, overallExportFraction, type ExportProgress } from '../lib/nbt/exportProgress';

/** Exports that finish faster than this never show a bar at all — same threshold and reasoning as
 *  BuildProgressBar.tsx: a bar flashing up for a tenth of a second would be noise, not information. */
const SHOW_AFTER_MS = 300;

/** A progress bar for a `.litematic`/`.nbt` export in flight — one overall fill plus the name of
 *  the stage currently running. Mirrors BuildProgressBar.tsx's look, kept as its own component
 *  since it reads ExportProgress rather than BuildProgress (see exportProgress.ts's own doc for why
 *  that's a separate small module instead of a shared generic one). */
export function ExportProgressBar({ progress }: { progress: ExportProgress | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const percent = progress ? Math.round(overallExportFraction(progress) * 100) : 0;
  const label = progress ? EXPORT_STAGE_LABELS[progress.stage] : EXPORT_STAGE_LABELS.write;

  return (
    <div className="w-full max-w-md">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
        <span>{label}…</span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Export progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${label}, ${percent} percent`}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-800"
      >
        <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-150 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
