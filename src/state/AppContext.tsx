import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { BlockShape, BlockTextureSet, MatchedFaces, PaletteEntry, VoxelGrid } from '../types/minecraft';

export type Resolution = 16 | 32 | 48 | 64;
export type AppMode = 'block' | 'item' | 'structure' | 'mobs';
export type FileLoaderMap = Map<string, () => Promise<Uint8Array>>;

/** A structure to voxelize, whether picked from the jar's built-in list or a custom upload —
 *  both are represented the same way (a name plus a lazy byte loader) so downstream pipeline code
 *  never needs to know which source it came from. */
export interface StructureSource {
  name: string;
  load: () => Promise<Uint8Array>;
}

export interface AppState {
  status: 'idle' | 'loading-archive' | 'building-palette' | 'ready' | 'error';
  errorMessage: string | null;
  extractedTextures: Map<string, BlockTextureSet> | null;
  /** Raw per-file loaders kept around (unlike the discarded JSZip instance) so item mode can
   *  look up an arbitrary model/blockstate/texture on demand, not just the block-grouped ones. */
  blockTextureFiles: FileLoaderMap | null;
  entityTextureFiles: FileLoaderMap | null;
  modelFiles: FileLoaderMap | null;
  blockStateFiles: FileLoaderMap | null;
  structureFiles: FileLoaderMap | null;
  palette: PaletteEntry[] | null;
  selectedBlockName: string | null;
  matchedFaces: MatchedFaces | null;
  resolution: Resolution;
  shape: BlockShape;
  mode: AppMode;
  selectedItemName: string | null;
  itemVoxelGrid: VoxelGrid | null;
  selectedStructureSource: StructureSource | null;
  structureVoxelGrid: VoxelGrid | null;
  selectedMobName: string | null;
  mobVoxelGrid: VoxelGrid | null;
}

const initialState: AppState = {
  status: 'idle',
  errorMessage: null,
  extractedTextures: null,
  blockTextureFiles: null,
  entityTextureFiles: null,
  modelFiles: null,
  blockStateFiles: null,
  structureFiles: null,
  palette: null,
  selectedBlockName: null,
  matchedFaces: null,
  resolution: 16,
  shape: 'full_cube',
  mode: 'block',
  selectedItemName: null,
  itemVoxelGrid: null,
  selectedStructureSource: null,
  structureVoxelGrid: null,
  selectedMobName: null,
  mobVoxelGrid: null,
};

export type AppAction =
  | { type: 'ARCHIVE_LOADING' }
  | {
      type: 'ARCHIVE_LOADED';
      extractedTextures: Map<string, BlockTextureSet>;
      blockTextureFiles: FileLoaderMap;
      entityTextureFiles: FileLoaderMap;
      modelFiles: FileLoaderMap;
      blockStateFiles: FileLoaderMap;
      structureFiles: FileLoaderMap;
    }
  | { type: 'ARCHIVE_ERROR'; message: string }
  | { type: 'PALETTE_BUILT'; palette: PaletteEntry[] }
  | { type: 'BLOCK_SELECTED'; blockName: string }
  | { type: 'FACES_MATCHED'; matchedFaces: MatchedFaces }
  | { type: 'RESOLUTION_CHANGED'; resolution: Resolution }
  | { type: 'SHAPE_CHANGED'; shape: BlockShape }
  | { type: 'MODE_CHANGED'; mode: AppMode }
  | { type: 'ITEM_VOXELIZING'; itemName: string }
  | { type: 'ITEM_VOXELIZED'; itemVoxelGrid: VoxelGrid }
  | { type: 'STRUCTURE_SOURCE_SELECTED'; source: StructureSource }
  | { type: 'STRUCTURE_VOXELIZING' }
  | { type: 'STRUCTURE_VOXELIZED'; voxelGrid: VoxelGrid }
  | { type: 'MOB_VOXELIZING'; mobName: string }
  | { type: 'MOB_VOXELIZED'; mobVoxelGrid: VoxelGrid };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ARCHIVE_LOADING':
      return { ...initialState, status: 'loading-archive', resolution: state.resolution, shape: state.shape, mode: state.mode };
    case 'ARCHIVE_LOADED':
      return {
        ...state,
        status: 'building-palette',
        extractedTextures: action.extractedTextures,
        blockTextureFiles: action.blockTextureFiles,
        entityTextureFiles: action.entityTextureFiles,
        modelFiles: action.modelFiles,
        blockStateFiles: action.blockStateFiles,
        structureFiles: action.structureFiles,
        errorMessage: null,
      };
    case 'ARCHIVE_ERROR':
      return { ...initialState, status: 'error', errorMessage: action.message, resolution: state.resolution, shape: state.shape, mode: state.mode };
    case 'PALETTE_BUILT':
      return { ...state, status: 'ready', palette: action.palette };
    case 'BLOCK_SELECTED':
      return { ...state, selectedBlockName: action.blockName, matchedFaces: null };
    case 'FACES_MATCHED':
      return { ...state, matchedFaces: action.matchedFaces };
    case 'RESOLUTION_CHANGED':
      return { ...state, resolution: action.resolution, matchedFaces: null, itemVoxelGrid: null, structureVoxelGrid: null, mobVoxelGrid: null };
    case 'SHAPE_CHANGED':
      // Shape is a post-processing trim applied after matching, not a re-match trigger — no
      // need to clear matchedFaces here.
      return { ...state, shape: action.shape };
    case 'MODE_CHANGED':
      return { ...state, mode: action.mode };
    case 'ITEM_VOXELIZING':
      return { ...state, selectedItemName: action.itemName, itemVoxelGrid: null };
    case 'ITEM_VOXELIZED':
      return { ...state, itemVoxelGrid: action.itemVoxelGrid };
    case 'STRUCTURE_SOURCE_SELECTED':
      return { ...state, selectedStructureSource: action.source, structureVoxelGrid: null };
    case 'STRUCTURE_VOXELIZING':
      return { ...state, structureVoxelGrid: null };
    case 'STRUCTURE_VOXELIZED':
      return { ...state, structureVoxelGrid: action.voxelGrid };
    case 'MOB_VOXELIZING':
      return { ...state, selectedMobName: action.mobName, mobVoxelGrid: null };
    case 'MOB_VOXELIZED':
      return { ...state, mobVoxelGrid: action.mobVoxelGrid };
    default:
      return state;
  }
}

const StateContext = createContext<AppState | null>(null);
const DispatchContext = createContext<Dispatch<AppAction> | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState(): AppState {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}

export function useAppDispatch(): Dispatch<AppAction> {
  const ctx = useContext(DispatchContext);
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider');
  return ctx;
}
