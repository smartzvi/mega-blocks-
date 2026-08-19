import { useAppState } from './AppContext';
import type { PaletteEntry } from '../types/minecraft';

/**
 * Every mode's final grid values are real block IDs matched against this same curated palette —
 * block mode via matchFace, item mode via buildItemVoxelGrid, and structure mode via
 * buildStructureVoxelGrid (which voxelizes each structure block through the exact same
 * buildItemVoxelGrid engine item mode uses). Unlike an earlier version of structure mode, which
 * synthesized its own on-the-fly PaletteEntry per raw structure block ID (buildStructurePalette.ts,
 * now removed) to display those exotic IDs directly, structure mode's output never contains
 * anything but real palette-matched IDs, so there's nothing left to branch on here.
 */
export function useFinalPalette(): PaletteEntry[] | null {
  const state = useAppState();
  return state.palette;
}
