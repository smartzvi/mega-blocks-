import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { buildItemVoxelGrid } from '../lib/models/buildItemVoxelGrid';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../lib/zip/decodeTexture';

export function ItemPicker() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Every block with a blockstate file is a candidate — the engine attempts a generic resolve
  // and reports the specific reason inline if that particular block isn't supported yet (e.g. a
  // multipart block with no unconditional part, like a glass pane's neighbor-dependent shape).
  const allNames = useMemo(() => {
    if (!state.blockStateFiles) return [];
    return [...state.blockStateFiles.keys()].sort();
  }, [state.blockStateFiles]);

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

  // Re-runs whenever the selected item OR the output resolution changes, mirroring
  // BlockSearch.tsx's re-match effect so switching resolution rebuilds the item in place.
  useEffect(() => {
    if (
      !state.selectedItemName ||
      !state.blockStateFiles ||
      !state.modelFiles ||
      !state.blockTextureFiles ||
      !state.entityTextureFiles ||
      !state.palette
    ) {
      return;
    }
    const itemName = state.selectedItemName;
    let cancelled = false;

    setError(null);
    setIsBuilding(true);

    (async () => {
      try {
        // Most blocks' textures live under textures/block/ (16x16 tiles); chest/shulker-box-
        // family hand-authored templates reference textures/entity/ instead, which are full-size
        // atlases (e.g. 64x64), not single 16x16 tiles — try both so one decoder works for either
        // source.
        const decodeTexture = async (key: string) =>
          (await loadAndDecodeTexture(key, state.blockTextureFiles!)) ?? loadAndDecodeEntityTexture(key, state.entityTextureFiles!);

        const itemVoxelGrid = await buildItemVoxelGrid(
          itemName,
          state.blockStateFiles!,
          state.modelFiles!,
          decodeTexture,
          state.palette!,
          state.resolution
        );
        if (!cancelled) dispatch({ type: 'ITEM_VOXELIZED', itemVoxelGrid });
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
    state.selectedItemName,
    state.resolution,
    state.blockStateFiles,
    state.modelFiles,
    state.blockTextureFiles,
    state.entityTextureFiles,
    state.palette,
    dispatch,
  ]);

  if (state.status !== 'ready') return null;

  function selectItem(itemName: string) {
    dispatch({ type: 'ITEM_VOXELIZING', itemName });
    setQuery('');
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
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
          placeholder="Search a block to voxelize (e.g. oak_fence)…"
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
        Item mode (beta) — voxelized from the block's real 3D model, not its flat texture. Most simple JSON-model
        blocks work; blocks whose shape depends on neighbors (fences, panes, walls) render just their fixed part.
      </p>

      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-sm">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => selectItem(name)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  name === state.selectedItemName
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

      {state.selectedItemName && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">{isBuilding ? 'Building' : 'Built'}</span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-300 ring-1 ring-emerald-500/30">
            {state.selectedItemName}
          </span>
        </div>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-red-950/50 px-3 py-2 text-center text-xs text-red-300 ring-1 ring-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
