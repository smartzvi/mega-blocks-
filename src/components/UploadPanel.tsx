import { useRef } from 'react';
import { loadArchive } from '../lib/zip/loadArchive';
import { extractTextures } from '../lib/zip/extractTextures';
import { buildPalette } from '../lib/palette/buildPalette';
import { useAppDispatch, useAppState } from '../state/AppContext';

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export function UploadPanel() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    dispatch({ type: 'ARCHIVE_LOADING' });
    try {
      const archive = await loadArchive(file);
      const extractedTextures = await extractTextures(archive);
      if (extractedTextures.size === 0) {
        throw new Error('Parsed the archive but found no usable block textures (all 6 faces unresolved).');
      }
      dispatch({
        type: 'ARCHIVE_LOADED',
        extractedTextures,
        blockTextureFiles: archive.blockTextureFiles,
        entityTextureFiles: archive.entityTextureFiles,
        modelFiles: archive.modelFiles,
        blockStateFiles: archive.blockStateFiles,
        structureFiles: archive.structureFiles,
      });

      const palette = buildPalette(extractedTextures);
      if (palette.length === 0) {
        throw new Error(
          'Built the texture map but none of the curated full-cube blocks were found in it — is this a vanilla jar?'
        );
      }
      dispatch({ type: 'PALETTE_BUILT', palette });
    } catch (err) {
      dispatch({ type: 'ARCHIVE_ERROR', message: err instanceof Error ? err.message : String(err) });
    }
  }

  const isBusy = state.status === 'loading-archive' || state.status === 'building-palette';

  return (
    <div
      className={`rounded-2xl border border-dashed bg-slate-900/40 p-6 text-center transition-colors sm:p-8 ${
        isBusy ? 'animate-pulse border-emerald-500/50' : 'border-slate-700 hover:border-emerald-500/40'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jar,.zip"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        className="mx-auto block w-full max-w-xs cursor-pointer text-sm text-slate-400 file:mr-4 file:cursor-pointer file:rounded-lg file:border-0 file:bg-emerald-600 file:px-5 file:py-2.5 file:text-sm file:font-semibold file:text-white file:shadow-lg file:shadow-emerald-900/40 file:transition-colors hover:file:bg-emerald-500"
      />
      <p className="mt-3 text-xs text-slate-500">Minecraft .jar or resource pack .zip</p>

      <div className="mt-4 min-h-6">
        {state.status === 'loading-archive' && (
          <p className="inline-flex items-center gap-2 text-sm text-slate-300">
            <Spinner /> Reading jar and extracting textures…
          </p>
        )}
        {state.status === 'building-palette' && (
          <p className="inline-flex items-center gap-2 text-sm text-slate-300">
            <Spinner /> Building vanilla palette…
          </p>
        )}
        {state.status === 'error' && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300 ring-1 ring-red-900">
            {state.errorMessage}
          </p>
        )}
        {state.status === 'ready' && state.extractedTextures && (
          <p className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-slate-300">
              {state.extractedTextures.size} blocks loaded ·{' '}
              <span className="font-medium text-emerald-400">{state.palette?.length ?? 0}</span> in the filler
              palette
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
