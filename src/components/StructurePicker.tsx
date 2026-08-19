import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { parseStructureFile } from '../lib/structure/parseStructureFile';
import { cullInteriorVoxels } from '../lib/structure/cullInteriorVoxels';
import { buildStructureVoxelGrid } from '../lib/structure/buildStructureVoxelGrid';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../lib/zip/decodeTexture';

/** Strips a common structure-file extension (and any directory the browser's file picker might
 *  report) so a custom upload's display name matches the style of a built-in structure's name. */
function displayNameFor(fileName: string): string {
  return fileName.replace(/\.(nbt|litematic)$/i, '');
}

export function StructurePicker() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Every .nbt file the jar bundled under data/minecraft/structure/ — nested folders are kept as
  // one searchable path string (see loadArchive.ts), so typing e.g. "village" or "house" narrows
  // naturally without needing a separate category/tree UI.
  const allNames = useMemo(() => {
    if (!state.structureFiles) return [];
    return [...state.structureFiles.keys()].sort();
  }, [state.structureFiles]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allNames.slice(0, 20);
    const q = query.toLowerCase();
    return allNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 20);
  }, [allNames, query]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Re-runs whenever the selected structure OR the output resolution changes, mirroring
  // ItemPicker.tsx's re-build effect — `resolution` means exactly what it means in item mode too
  // (voxels per source block: 16/32/48/64), not a multiplier applied on top of an already-built
  // grid, so switching it rebuilds every block's stamp at the new size.
  useEffect(() => {
    if (
      !state.selectedStructureSource ||
      !state.blockTextureFiles ||
      !state.entityTextureFiles ||
      !state.blockStateFiles ||
      !state.modelFiles ||
      !state.palette
    ) {
      return;
    }
    const source = state.selectedStructureSource;
    const palette = state.palette;
    let cancelled = false;

    setError(null);
    setIsBuilding(true);
    dispatch({ type: 'STRUCTURE_VOXELIZING' });

    (async () => {
      try {
        const bytes = await source.load();
        const { grid: rawGrid, blockIds } = await parseStructureFile(bytes);
        const culled = cullInteriorVoxels(rawGrid);

        // Most fallback textures live under textures/block/; hand-authored blocks (chest,
        // shulker, bed, sign) reference textures/entity/ instead — try both, same pattern
        // ItemPicker.tsx already uses.
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

        if (!cancelled) dispatch({ type: 'STRUCTURE_VOXELIZED', voxelGrid });
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
    state.selectedStructureSource,
    state.resolution,
    state.palette,
    state.blockTextureFiles,
    state.entityTextureFiles,
    state.blockStateFiles,
    state.modelFiles,
    dispatch,
  ]);

  if (state.status !== 'ready') return null;

  function selectBuiltIn(name: string) {
    const load = state.structureFiles!.get(name)!;
    dispatch({ type: 'STRUCTURE_SOURCE_SELECTED', source: { name, load } });
    setQuery('');
    setIsOpen(false);
  }

  function handleCustomUpload(file: File) {
    dispatch({
      type: 'STRUCTURE_SOURCE_SELECTED',
      source: { name: displayNameFor(file.name), load: async () => new Uint8Array(await file.arrayBuffer()) },
    });
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={containerRef} className="relative mx-auto w-full max-w-md">
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            placeholder="Search a built-in structure (e.g. village/plains/houses)…"
            value={query}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            className="w-full rounded-xl border border-slate-800 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder-slate-500 shadow-inner shadow-black/20 outline-none transition-colors focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <p className="mt-1.5 text-center text-xs text-slate-600">
          Structure mode (beta) — voxelizes every real block through the same color-matching
          engine as Item mode, at {state.resolution}×{state.resolution}×{state.resolution} voxels
          per source block, respecting each block's real orientation (stairs, doors, logs, ...).
          Beds render as a single matched color instead of their real shape.
        </p>

        {isOpen && filtered.length > 0 && (
          <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-sm">
            {filtered.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => selectBuiltIn(name)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    name === state.selectedStructureSource?.name
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>or</span>
        <label className="cursor-pointer rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 font-medium text-slate-300 transition-colors hover:border-emerald-500/40 hover:text-white">
          Upload a .nbt / .litematic file
          <input
            type="file"
            accept=".nbt,.litematic"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCustomUpload(file);
            }}
          />
        </label>
      </div>

      {state.selectedStructureSource && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">{isBuilding ? 'Building' : 'Built'}</span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-300 ring-1 ring-emerald-500/30">
            {state.selectedStructureSource.name}
          </span>
        </div>
      )}
      {error && (
        <p className="rounded-lg bg-red-950/50 px-3 py-2 text-center text-xs text-red-300 ring-1 ring-red-900">{error}</p>
      )}
    </div>
  );
}
