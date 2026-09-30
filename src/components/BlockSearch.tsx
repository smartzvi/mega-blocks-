import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { matchAllFaces } from '../lib/matching/matchFace';
import { applyTint, detectTint } from '../lib/palette/tint';
import { isFullyOpaque } from '../lib/palette/opacity';
import { filterPaletteForSource } from '../lib/palette/glassSource';
import { filterLightSourcesForSource } from '../lib/palette/lightSourceExclusion';
import { filterPaletteForOreSource } from '../lib/palette/oreSource';
import { filterPaletteForRedstoneSource } from '../lib/palette/redstoneSource';
import { filterPaletteForPlanksSource } from '../lib/palette/woodPlanksSource';
import { BuildStatus, ResultItem, ResultList, SearchField } from './ui/Search';
import { BlockIcon } from './ui/BlockIcon';

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

  // Re-runs whenever the selected block, the output resolution, OR the block shape changes —
  // shape has to be a dependency here (not just applied as a post-hoc trim the way slab/stair/
  // door cutouts normally are) because a planks source's side-face palette itself depends on it,
  // see the comment below.
  useEffect(() => {
    if (!state.selectedBlockName || !state.extractedTextures || !state.palette) return;
    const rawTextures = state.extractedTextures.get(state.selectedBlockName);
    if (!rawTextures) return;

    const tint = detectTint(state.selectedBlockName);
    const sourceTextures = tint ? applyTint(rawTextures, tint) : rawTextures;

    let palette = filterPaletteForRedstoneSource(
      filterPaletteForOreSource(
        filterLightSourcesForSource(filterPaletteForSource(state.palette, state.selectedBlockName), state.selectedBlockName),
        state.selectedBlockName
      ),
      state.selectedBlockName
    );
    // filterPaletteForPlanksSource only applies for non-full_cube shapes: a plain full cube shows
    // real log/bark variety evenly across all 6 faces, which reads as pleasant wood-grain detail,
    // not a mismatch — per direct user feedback, removing it there made a plain plank cube look
    // "empty"/flatter than before. The stair/slab/door cutout is what actually creates the
    // visible seam (a tread's top-face-matched data next to a wall's bark-heavy side-face-matched
    // data), since it's the only case that puts both right next to each other in one shape — see
    // woodPlanksSource.ts's own doc.
    if (state.shape !== 'full_cube') {
      palette = filterPaletteForPlanksSource(palette, state.selectedBlockName);
    }
    const matchedFaces = matchAllFaces(sourceTextures, palette, state.resolution);
    dispatch({ type: 'FACES_MATCHED', matchedFaces });
  }, [state.selectedBlockName, state.resolution, state.shape, state.extractedTextures, state.palette, dispatch]);

  function selectBlock(blockName: string) {
    dispatch({ type: 'BLOCK_SELECTED', blockName });
    setQuery('');
    setIsOpen(false);
  }

  if (state.status !== 'ready') return null;

  return (
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative w-full">
        <SearchField
          value={query}
          placeholder="Search a block (e.g. obsidian)…"
          onFocus={() => setIsOpen(true)}
          onChange={(value) => {
            setQuery(value);
            setIsOpen(true);
          }}
        />
        {isOpen && filtered.length > 0 && (
          <ResultList>
            {filtered.map((name) => (
              <ResultItem
                key={name}
                selected={name === state.selectedBlockName}
                onClick={() => selectBlock(name)}
                icon={<BlockIcon textures={state.extractedTextures?.get(name)} size={16} />}
              >
                {name}
              </ResultItem>
            ))}
          </ResultList>
        )}
      </div>
      {state.selectedBlockName && (
        <BuildStatus
          building={!state.matchedFaces}
          name={state.selectedBlockName}
          icon={<BlockIcon textures={state.extractedTextures?.get(state.selectedBlockName)} size={16} />}
        />
      )}
    </div>
  );
}
