import { useMemo } from 'react';
import { useAppState } from './AppContext';
import { assembleShell } from '../lib/voxel/assembleShell';
import { applyShapeCutout } from '../lib/voxel/applyShapeCutout';
import type { VoxelGrid } from '../types/minecraft';

/**
 * The single source of truth for "the grid the user is actually looking at / about to export".
 * In block mode: the matched faces assembled into a hollow shell, then trimmed to the selected
 * shape. In item mode: the already-complete grid produced by the model rasterizer (ItemPicker),
 * which bypasses assembleShell/applyShapeCutout entirely since it isn't a cube. In structure mode:
 * the already-complete grid produced by the parse -> cull -> upscale pipeline (StructurePicker).
 * In mobs mode: the already-complete grid produced by buildMobVoxelGrid (MobPicker), same shape as
 * item mode's output since it goes through the identical rasterizeItemModel engine. In trees mode:
 * the already-complete grid produced by generateTreeGrid -> cull -> upscale (TreePicker), the exact
 * same structure-mode pipeline structure mode itself uses, just fed a synthetic grid instead of one
 * parsed from a real .nbt file. Either way this is the one hook PreviewScene, MaterialList, and
 * ExportButtons read, so they can never drift out of sync with each other or with which mode is
 * active.
 */
export function useFinalVoxelGrid(): VoxelGrid | null {
  const state = useAppState();

  return useMemo(() => {
    if (state.mode === 'item') return state.itemVoxelGrid;
    if (state.mode === 'structure') return state.structureVoxelGrid;
    if (state.mode === 'mobs') return state.mobVoxelGrid;
    if (state.mode === 'trees') return state.treeVoxelGrid;
    if (!state.matchedFaces) return null;
    const rawShell = assembleShell(state.matchedFaces);
    return applyShapeCutout(rawShell, state.matchedFaces, state.shape);
  }, [
    state.mode,
    state.itemVoxelGrid,
    state.structureVoxelGrid,
    state.mobVoxelGrid,
    state.treeVoxelGrid,
    state.matchedFaces,
    state.shape,
  ]);
}
