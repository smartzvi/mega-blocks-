import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppDispatch, useAppState } from '../state/AppContext';
import { parseStructureFile } from '../lib/structure/parseStructureFile';
import { GENERATED_STRUCTURE_NAMES, generateStructure } from '../lib/structure/generatedStructures';
import { cullInteriorVoxels } from '../lib/structure/cullInteriorVoxels';
import { buildStructureVoxelGrid } from '../lib/structure/buildStructureVoxelGrid';
import { applyKnownStructureFixes } from '../lib/structure/knownStructureFixes';
import { loadAndDecodeEntityTexture, loadAndDecodeTexture } from '../lib/zip/decodeTexture';
import { buildStructureGrid, warmUpStructureWorker } from '../lib/structure/structureBuildClient';
import type { BuildProgress } from '../lib/structure/buildProgress';
import { isAbortError } from '../lib/structure/isAbortError';
import { BuildProgressBar } from './BuildProgressBar';
import { BuildStatus, ErrorNote, HelpText, ResultItem, ResultList, ResultNote, SearchField } from './ui/Search';

/** Strips a common structure-file extension (and any directory the browser's file picker might
 *  report) so a custom upload's display name matches the style of a built-in structure's name. */
function displayNameFor(fileName: string): string {
  return fileName.replace(/\.(nbt|litematic)$/i, '');
}

const RESULT_LIMIT = 200;

export function StructurePicker() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Every .nbt file the jar bundled under data/minecraft/structure/ — nested folders are kept as
  // one searchable path string (see loadArchive.ts), so typing e.g. "village" or "house" narrows
  // naturally without needing a separate category/tree UI.
  const allNames = useMemo(() => {
    if (!state.structureFiles) return [];
    return [...state.structureFiles.keys(), ...GENERATED_STRUCTURE_NAMES].sort();
  }, [state.structureFiles]);

  // Twenty matches used to be all the list ever showed, so a family with more pieces than that (a
  // woodland mansion has 73) silently hid most of them — e.g. "woodland" never got as far as
  // `1x2_d4`. A search now lists up to RESULT_LIMIT matches, and says so when it is still cutting some.
  const { filtered, totalMatches } = useMemo(() => {
    if (!query.trim()) return { filtered: allNames.slice(0, 20), totalMatches: allNames.length };
    const q = query.toLowerCase();
    const matches = allNames.filter((name) => name.toLowerCase().includes(q));
    return { filtered: matches.slice(0, RESULT_LIMIT), totalMatches: matches.length };
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

  // Start the background build worker as soon as this picker shows, while the user is still
  // choosing — it loads the jar and warms up before the first real build asks for it.
  useEffect(() => {
    warmUpStructureWorker(state.archiveFile, state.palette);
  }, [state.archiveFile, state.palette]);

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
    const controller = new AbortController();

    setError(null);
    setIsBuilding(true);
    setProgress(null);
    dispatch({ type: 'STRUCTURE_VOXELIZING' });

    (async () => {
      try {
        const generated = source.generated ? generateStructure(source.name) : null;
        const { grid: rawGrid, blockIds } = generated ?? (await parseStructureFile(await source.load()));
        applyKnownStructureFixes(source.name, rawGrid, blockIds);
        const culled = cullInteriorVoxels(rawGrid);

        // Most fallback textures live under textures/block/; hand-authored blocks (chest,
        // shulker, bed, sign) reference textures/entity/ instead — try both, same pattern
        // ItemPicker.tsx already uses.
        const decodeTexture = async (key: string) =>
          (await loadAndDecodeTexture(key, state.blockTextureFiles!)) ?? loadAndDecodeEntityTexture(key, state.entityTextureFiles!);

        // The heavy part (stamping, composing and trimming the final grid) runs in a background
        // worker so the page keeps responding, reporting progress as it goes; the in-page build is
        // only the fallback when no worker is available.
        const voxelGrid = await buildStructureGrid(
          { file: state.archiveFile, palette, culled, blockIds, resolution: state.resolution },
          { signal: controller.signal, onProgress: (p) => !cancelled && setProgress(p) },
          (onProgress) =>
            buildStructureVoxelGrid(culled, blockIds, palette, decodeTexture, state.blockStateFiles!, state.modelFiles!, state.resolution, onProgress)
        );

        if (!cancelled) dispatch({ type: 'STRUCTURE_VOXELIZED', voxelGrid });
      } catch (err) {
        if (isAbortError(err)) return; // superseded by a newer selection — not a failure
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) {
          setIsBuilding(false);
          setProgress(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.selectedStructureSource,
    state.resolution,
    state.archiveFile,
    state.palette,
    state.blockTextureFiles,
    state.entityTextureFiles,
    state.blockStateFiles,
    state.modelFiles,
    dispatch,
  ]);

  if (state.status !== 'ready') return null;

  function selectBuiltIn(name: string) {
    if (GENERATED_STRUCTURE_NAMES.includes(name)) {
      dispatch({ type: 'STRUCTURE_SOURCE_SELECTED', source: { name, load: async () => new Uint8Array(), generated: true } });
    } else {
      dispatch({ type: 'STRUCTURE_SOURCE_SELECTED', source: { name, load: state.structureFiles!.get(name)! } });
    }
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div ref={containerRef} className="relative w-full min-w-0 flex-1">
          <SearchField
            value={query}
            placeholder="Search a built-in structure (e.g. village/plains/houses)…"
            onFocus={() => setIsOpen(true)}
            onChange={(value) => {
              setQuery(value);
              setIsOpen(true);
            }}
          />
          {isOpen && filtered.length > 0 && (
            <ResultList>
              {filtered.map((name) => (
                <ResultItem key={name} selected={name === state.selectedStructureSource?.name} onClick={() => selectBuiltIn(name)}>
                  {name}
                </ResultItem>
              ))}
              {totalMatches > filtered.length && (
                <ResultNote>
                  Showing {filtered.length} of {totalMatches} — keep typing to narrow it down
                </ResultNote>
              )}
            </ResultList>
          )}
        </div>
        <label className="flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-line bg-raised px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z" />
            <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
          </svg>
          Upload .nbt / .litematic
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
      <HelpText>
        Voxelizes every real block through the same color-matching engine as Item mode, at{' '}
        <span className="font-mono">
          {state.resolution}×{state.resolution}×{state.resolution}
        </span>{' '}
        voxels per source block, respecting each block's real orientation (stairs, doors, logs, ...). Beds render as a
        single matched color instead of their real shape.
      </HelpText>

      {state.selectedStructureSource && <BuildStatus building={isBuilding} name={state.selectedStructureSource.name} />}
      {isBuilding && <BuildProgressBar progress={progress} />}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}
