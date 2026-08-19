import { useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { buildMobVoxelGrid } from '../lib/models/buildMobVoxelGrid';
import { HAND_AUTHORED_MOB_TEMPLATES } from '../lib/models/handAuthoredMobTemplates';
import { loadAndDecodeEntityTexture } from '../lib/zip/decodeTexture';

// Fixed, short list (5 mobs) sourced entirely from the hand-authored template registry, not from
// any uploaded-jar map — unlike ItemPicker/StructurePicker, mob support doesn't vary per jar, so a
// simple button row is enough; no search dropdown needed for a list this small.
const MOB_NAMES = Object.keys(HAND_AUTHORED_MOB_TEMPLATES).sort();

export function MobPicker() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // Narrower deps than ItemPicker's — mobs are 100% hand-authored + entity-texture-only, so no
  // blockStateFiles/modelFiles/blockTextureFiles are ever needed.
  useEffect(() => {
    if (!state.selectedMobName || !state.entityTextureFiles || !state.palette) return;
    const mobName = state.selectedMobName;
    let cancelled = false;

    setError(null);
    setIsBuilding(true);

    (async () => {
      try {
        const decodeTexture = (key: string) => loadAndDecodeEntityTexture(key, state.entityTextureFiles!);
        const mobVoxelGrid = await buildMobVoxelGrid(mobName, decodeTexture, state.palette!, state.resolution);
        if (!cancelled) dispatch({ type: 'MOB_VOXELIZED', mobVoxelGrid });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setIsBuilding(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedMobName, state.resolution, state.entityTextureFiles, state.palette, dispatch]);

  if (state.status !== 'ready') return null;

  function selectMob(mobName: string) {
    dispatch({ type: 'MOB_VOXELIZING', mobName });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {MOB_NAMES.map((name) => {
          const active = name === state.selectedMobName;
          return (
            <button
              key={name}
              type="button"
              onClick={() => selectMob(name)}
              className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition-colors ${
                active
                  ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40'
                  : 'border border-slate-800 bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-slate-600">
        Mobs mode (beta) — hand-authored geometry (real mob shapes aren't shipped as jar data,
        unlike blocks), voxelized through the same color-matching engine as Item mode. Default
        texture variant only for now.
      </p>

      {state.selectedMobName && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">{isBuilding ? 'Building' : 'Built'}</span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium capitalize text-emerald-300 ring-1 ring-emerald-500/30">
            {state.selectedMobName}
          </span>
        </div>
      )}
      {error && (
        <p className="rounded-lg bg-red-950/50 px-3 py-2 text-center text-xs text-red-300 ring-1 ring-red-900">{error}</p>
      )}
    </div>
  );
}
