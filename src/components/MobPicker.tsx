import { useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { buildMobVoxelGrid } from '../lib/models/buildMobVoxelGrid';
import { HAND_AUTHORED_MOB_TEMPLATES } from '../lib/models/handAuthoredMobTemplates';
import { loadAndDecodeEntityTexture } from '../lib/zip/decodeTexture';
import { ChipGrid } from './ui/Panel';
import { BuildStatus, ErrorNote } from './ui/Search';

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
        const mobVoxelGrid = await buildMobVoxelGrid(mobName, decodeTexture, state.palette!, state.resolution, {
          boatWood: state.boatWood,
          railShape: state.railShape,
        });
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
  }, [state.selectedMobName, state.resolution, state.boatWood, state.railShape, state.entityTextureFiles, state.palette, dispatch]);

  if (state.status !== 'ready') return null;

  function selectMob(mobName: string) {
    dispatch({ type: 'MOB_VOXELIZING', mobName });
  }

  return (
    <div className="flex flex-col gap-3">
      <ChipGrid items={MOB_NAMES} selected={state.selectedMobName} onSelect={selectMob} />
      {state.selectedMobName && <BuildStatus building={isBuilding} name={state.selectedMobName} />}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
