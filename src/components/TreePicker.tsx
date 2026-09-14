import { useEffect, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { generateTreeGrid, TREE_SPECIES_NAMES, type TreeSpecies } from '../lib/trees/generateTreeGrid';
import { cullInteriorVoxels } from '../lib/structure/cullInteriorVoxels';
import { buildStructureVoxelGrid } from '../lib/structure/buildStructureVoxelGrid';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../lib/zip/decodeTexture';

// Fixed, short list sourced entirely from generateTreeGrid.ts's own registry, not from any
// uploaded-jar map — like MobPicker, tree support doesn't vary per jar, so a simple button row is
// enough; no search dropdown needed for a list this small.
export function TreePicker() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // Mirrors StructurePicker.tsx's voxelization effect exactly, except the source grid comes from
  // the synchronous local `generateTreeGrid` instead of `parseStructureFile(bytes)` — everything
  // downstream (cull -> buildStructureVoxelGrid) is the unmodified structure-mode pipeline.
  useEffect(() => {
    if (
      !state.selectedTreeName ||
      !state.blockTextureFiles ||
      !state.entityTextureFiles ||
      !state.blockStateFiles ||
      !state.modelFiles ||
      !state.palette
    ) {
      return;
    }
    const treeName = state.selectedTreeName as TreeSpecies;
    const palette = state.palette;
    let cancelled = false;

    setError(null);
    setIsBuilding(true);

    (async () => {
      try {
        const { grid: rawGrid, blockIds } = generateTreeGrid(treeName);
        const culled = cullInteriorVoxels(rawGrid);

        const decodeTexture = async (key: string) =>
          (await loadAndDecodeTexture(key, state.blockTextureFiles!)) ?? loadAndDecodeEntityTexture(key, state.entityTextureFiles!);

        const voxelGrid = await buildStructureVoxelGrid(
          culled,
          blockIds,
          palette,
          decodeTexture,
          state.blockStateFiles!,
          state.modelFiles!,
          state.resolution
        );

        if (!cancelled) dispatch({ type: 'TREE_VOXELIZED', treeVoxelGrid: voxelGrid });
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
  }, [
    state.selectedTreeName,
    state.resolution,
    state.palette,
    state.blockTextureFiles,
    state.entityTextureFiles,
    state.blockStateFiles,
    state.modelFiles,
    dispatch,
  ]);

  if (state.status !== 'ready') return null;

  function selectTree(treeName: string) {
    dispatch({ type: 'TREE_VOXELIZING', treeName });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex flex-wrap justify-center gap-2">
        {TREE_SPECIES_NAMES.map((name) => {
          const active = name === state.selectedTreeName;
          return (
            <button
              key={name}
              type="button"
              onClick={() => selectTree(name)}
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
        Trees mode (beta) — real vanilla logs and leaves, shaped from Minecraft's own tree
        generation recipes (not a pre-built structure — trees are grown, not blueprinted), so you
        can build one full-size instead of stacking megablocks by hand. More species coming; the
        branching ones (acacia, dark oak, jungle, mangrove, cherry) need their own shape work first.
      </p>

      {state.selectedTreeName && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">{isBuilding ? 'Building' : 'Built'}</span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium capitalize text-emerald-300 ring-1 ring-emerald-500/30">
            {state.selectedTreeName}
          </span>
        </div>
      )}
      {error && (
        <p className="rounded-lg bg-red-950/50 px-3 py-2 text-center text-xs text-red-300 ring-1 ring-red-900">{error}</p>
      )}
    </div>
  );
}
