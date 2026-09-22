/** The stages of turning a finished voxel grid into a downloadable file, in the order they run.
 *  `write` is building the format's bytes (litematic's region packing, or vanilla's block list —
 *  by far the bulk of the time on a big grid); `compress` is gzip, which has no useful sub-progress
 *  of its own so it just moves from 0 to 1. Mirrors `structure/buildProgress.ts`'s shape, kept as
 *  its own small module rather than made generic over both, matching this codebase's existing
 *  precedent of separate per-domain progress files over one shared abstraction. */
export type ExportStage = 'write' | 'compress';

export interface ExportProgress {
  stage: ExportStage;
  /** Progress within this stage, 0..1. */
  fraction: number;
}

export type ExportProgressCallback = (progress: ExportProgress) => void;

/** How much of the overall bar each stage fills — writing the bytes is the dominant cost on a big
 *  grid (measured: ~3.5s of a ~3.7s litematic export for 3.5M voxels), gzip the small remainder. */
export const EXPORT_STAGE_WEIGHTS: Record<ExportStage, number> = {
  write: 0.9,
  compress: 0.1,
};

const STAGE_ORDER: ExportStage[] = ['write', 'compress'];

/** Turns a stage + its own fraction into one overall 0..1 value for a single progress bar. */
export function overallExportFraction(progress: ExportProgress): number {
  let done = 0;
  for (const stage of STAGE_ORDER) {
    if (stage === progress.stage) return Math.min(1, done + EXPORT_STAGE_WEIGHTS[stage] * progress.fraction);
    done += EXPORT_STAGE_WEIGHTS[stage];
  }
  return done;
}

export const EXPORT_STAGE_LABELS: Record<ExportStage, string> = {
  write: 'Writing blocks',
  compress: 'Compressing',
};
