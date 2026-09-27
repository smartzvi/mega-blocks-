import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { buildItemVoxelGrid } from '../lib/models/buildItemVoxelGrid';
import { itemConnectionProperties } from '../lib/models/itemConnections';
import { railShapeProperties } from '../lib/models/railTemplates';
import { leverPoweredProperties } from '../lib/models/leverTemplate';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../lib/zip/decodeTexture';
import { BuildStatus, ErrorNote, HelpText, ResultItem, ResultList, SearchField } from './ui/Search';

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
          state.resolution,
          {
            properties:
              itemConnectionProperties(itemName, state.connectionMode) ??
              railShapeProperties(itemName, state.railShape) ??
              leverPoweredProperties(itemName, state.leverPowered),
          }
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
    state.connectionMode,
    state.railShape,
    state.leverPowered,
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
    <div className="flex flex-col gap-3">
      <div ref={containerRef} className="relative w-full">
        <SearchField
          value={query}
          placeholder="Search a block to voxelize (e.g. oak_fence)…"
          onFocus={() => setIsOpen(true)}
          onChange={(value) => {
            setQuery(value);
            setIsOpen(true);
          }}
        />
        {isOpen && filtered.length > 0 && (
          <ResultList>
            {filtered.map((name) => (
              <ResultItem key={name} selected={name === state.selectedItemName} onClick={() => selectItem(name)}>
                {name}
              </ResultItem>
            ))}
          </ResultList>
        )}
      </div>
      <HelpText>
        Voxelized from the block's real 3D model, not its flat texture. Most simple JSON-model blocks work. Pick a
        fence, pane, bars, wall or redstone wire and a control appears to show it connected or isolated; pick a rail
        and a control appears to pick its shape, including sloped ascending rails; pick a lever and a control appears
        to toggle it powered on or off.
      </HelpText>

      {state.selectedItemName && <BuildStatus building={isBuilding} name={state.selectedItemName} />}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
