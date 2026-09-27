import { useEffect, useState } from 'react';
import { STAGE_LABELS, overallFraction, type BuildProgress } from '../lib/structure/buildProgress';

/** Builds that finish faster than this never show a bar at all — a bar flashing up for a tenth of
 *  a second on a small structure would be noise, not information. */
const SHOW_AFTER_MS = 300;

/**
 * A progress bar for a big structure or tree build: one overall fill, plus the name of the stage
 * currently running. Rendered by the pickers only while a build is in flight.
 */
export function BuildProgressBar({ progress }: { progress: BuildProgress | null }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const percent = progress ? Math.round(overallFraction(progress) * 100) : 0;
  const label = progress ? STAGE_LABELS[progress.stage] : STAGE_LABELS.connect;

  return (
    <div className="w-full">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span>{label}…</span>
        <span className="font-mono tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Build progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${label}, ${percent} percent`}
        className="h-1 w-full overflow-hidden rounded-[1px] bg-line"
      >
        <div className="h-full bg-accent transition-[width] duration-150 ease-out" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
