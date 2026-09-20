/** The stages of building a structure's final voxel grid, in the order they run. `prepare` is the
 *  page-side rebuild of the grid after a worker hands it back; `connect` is a worker starting up
 *  (loading the jar) before its first build. */
export type BuildStage = 'connect' | 'stamps' | 'place' | 'trim' | 'prepare';

export interface BuildProgress {
  stage: BuildStage;
  /** Progress within this stage, 0..1. */
  fraction: number;
}

export type BuildProgressCallback = (progress: BuildProgress) => void;

/** Wraps a callback so it only fires when a stage's whole-percent value changes — the pipeline's
 *  inner loops run millions of times, and a message per iteration would cost more than the work. */
export function throttledProgress(stage: BuildStage, onProgress: BuildProgressCallback | undefined): (fraction: number) => void {
  if (!onProgress) return () => {};
  let lastPercent = -1;
  return (fraction) => {
    const percent = Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
    if (percent === lastPercent) return;
    lastPercent = percent;
    onProgress({ stage, fraction: percent / 100 });
  };
}

/** How much of the overall bar each stage fills. Proportioned from a measured real build (a
 *  3.47M-voxel structure): composing and trimming are by far the bulk; the small remainder is
 *  block preparation and the page-side rebuild. `connect` only exists on a worker's first build. */
export const STAGE_WEIGHTS: Record<BuildStage, number> = {
  connect: 0.05,
  stamps: 0.1,
  place: 0.3,
  trim: 0.4,
  prepare: 0.15,
};

const STAGE_ORDER: BuildStage[] = ['connect', 'stamps', 'place', 'trim', 'prepare'];

/** Turns a stage + its own fraction into one overall 0..1 value for a single progress bar. */
export function overallFraction(progress: BuildProgress): number {
  let done = 0;
  for (const stage of STAGE_ORDER) {
    if (stage === progress.stage) return Math.min(1, done + STAGE_WEIGHTS[stage] * progress.fraction);
    done += STAGE_WEIGHTS[stage];
  }
  return done;
}

export const STAGE_LABELS: Record<BuildStage, string> = {
  connect: 'Starting up',
  stamps: 'Preparing blocks',
  place: 'Placing blocks',
  trim: 'Trimming hidden blocks',
  prepare: 'Preparing preview',
};
