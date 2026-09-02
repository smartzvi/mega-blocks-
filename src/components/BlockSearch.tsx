import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { matchAllFaces } from '../lib/matching/matchFace';
import { applyTint, detectTint } from '../lib/palette/tint';
import { isFullyOpaque } from '../lib/palette/opacity';
import { filterPaletteForSource } from '../lib/palette/glassSource';
import { filterLightSourcesForSource } from '../lib/palette/lightSourceExclusion';
import { filterPaletteForOreSource } from '../lib/palette/oreSource';

export function BlockSearch() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only blocks with a fully opaque texture are offered: a block with any transparency (torch,
  // rail, lever, flowers, doors, ladders, vines, ...) has a sprite/overlay texture, not a real
  // cube face, and recreating it as a solid cube/slab/stair/door would never look like a
  // recognizable version of that block — see opacity.ts for the full reasoning.
  const allNames = useMemo(() => {
    if (!state.extractedTextures) return [];
    const names: string[] = [];
    for (const [name, textures] of state.extractedTextures) {
      if (isFullyOpaque(textures)) names.push(name);
    }
    return names.sort();
  }, [state.extractedTextures]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allNames.slice(0, 20);
    const q = query.toLowerCase();
    return allNames.filter((name) => name.toLowerCase().includes(q)).slice(0, 20);
  }, [allNames, query]);

  // Close the dropdown on outside clicks rather than on input blur, so clicking a result
  // (which blurs the input first) still registers the selection.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  // Re-runs whenever the selected block OR the output resolution changes, so switching the
  // resolution toggle re-matches the currently-selected block without needing to re-select it.
  useEffect(() => {
    if (!state.selectedBlockName || !state.extractedTextures || !state.palette) return;
    const rawTextures = state.extractedTextures.get(state.selectedBlockName);
    if (!rawTextures) return;

    const tint = detectTint(state.selectedBlockName);
    const sourceTextures = tint ? applyTint(rawTextures, tint) : rawTextures;

    const palette = filterPaletteForOreSource(
      filterLightSourcesForSource(filterPaletteForSource(state.palette, state.selectedBlockName), state.selectedBlockName),
      state.selectedBlockName
    );
    const matchedFaces = matchAllFaces(sourceTextures, palette, state.resolution);
    dispatch({ type: 'FACES_MATCHED', matchedFaces });
  }, [state.selectedBlockName, state.resolution, state.extractedTextures, state.palette, dispatch]);

  function selectBlock(blockName: string) {
    dispatch({ type: 'BLOCK_SELECTED', blockName });
    setQuery('');
    setIsOpen(false);
  }

  if (state.status !== 'ready') return null;

  return (
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
          placeholder="Search a block (e.g. obsidian)…"
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
        Only full-cube blocks — torches, rails, flowers, doors, etc. don't have a solid texture to scale up.
      </p>

      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-sm">
          {filtered.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => selectBlock(name)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  name === state.selectedBlockName
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

      {state.selectedBlockName && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">Building</span>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-300 ring-1 ring-emerald-500/30">
            {state.selectedBlockName}
          </span>
        </div>
      )}
    </div>
  );
}
