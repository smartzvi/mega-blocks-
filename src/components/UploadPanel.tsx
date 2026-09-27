import { useRef, useState, type ReactNode } from 'react';
import { loadArchive } from '../lib/zip/loadArchive';
import { extractTextures } from '../lib/zip/extractTextures';
import { buildPalette } from '../lib/palette/buildPalette';
import { useAppDispatch, useAppState } from '../state/AppContext';

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/**
 * Loading a jar, shared by the landing drop zone and the header's "Change file" button: both render
 * their own hidden <input> from `fileInput` and call the same `handleFile`. ARCHIVE_LOADING resets
 * state but keeps resolution/shape/mode, so changing the file from the header needs nothing extra.
 */
function useJarUpload() {
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
        archiveFile: file,
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

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept=".jar,.zip"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void handleFile(file);
        e.target.value = '';
      }}
      className="sr-only"
    />
  );

  return { fileInput, handleFile, openPicker: () => inputRef.current?.click() };
}

/** The header's right side once a jar is loaded: its name, what it yielded, and a way to change it. */
export function JarStatus() {
  const state = useAppState();
  const { fileInput, openPicker } = useJarUpload();

  if (state.status !== 'ready' || !state.extractedTextures) return null;

  return (
    <div className="flex min-w-0 items-center gap-3">
      {fileInput}
      <span className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-accent" aria-hidden="true" />
        <span className="truncate font-mono text-fg">{state.archiveFile?.name ?? 'Resource pack'}</span>
        <span className="hidden shrink-0 font-mono text-xs text-faint md:inline">
          {state.extractedTextures.size} blocks · {state.palette?.length ?? 0} palette
        </span>
      </span>
      <button
        type="button"
        onClick={openPicker}
        className="shrink-0 rounded-control border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        Change
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 border-t border-line pt-4 sm:flex-1 sm:flex-col sm:gap-2">
      <span className="font-mono text-xs text-accent">0{n}</span>
      <div>
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-faint">{children}</p>
      </div>
    </li>
  );
}

/** The landing: what this is, the drop zone, and how it works. Shown until a jar has loaded. */
export function UploadPanel() {
  const state = useAppState();
  const { fileInput, handleFile, openPicker } = useJarUpload();
  const [dragging, setDragging] = useState(false);

  if (state.status === 'ready') return null;

  const isBusy = state.status === 'loading-archive' || state.status === 'building-palette';

  return (
    <div className="flex w-full flex-col gap-10">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-accent">Minecraft build generator</p>
        <h1 className="max-w-2xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl">
          Turn any block into a giant build made of real blocks.
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-muted">
          Pick a block, item, structure, mob or tree. Megablock rebuilds it at 16 to 64 times the size from vanilla
          materials, shows it in 3D, and exports a schematic you can paste into your world.
        </p>
      </header>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isBusy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !isBusy) void handleFile(file);
        }}
        className="rounded-panel border border-line bg-panel p-2"
      >
        {fileInput}
        <div
          className={`flex flex-col items-center justify-center gap-4 rounded-[6px] border border-dashed px-6 py-12 text-center transition-colors ${
            dragging ? 'border-accent bg-accent-dim' : 'border-line-strong'
          }`}
        >
          {isBusy ? (
            <p className="inline-flex items-center gap-2 text-sm text-muted">
              <Spinner />
              {state.status === 'loading-archive' ? 'Reading jar and extracting textures…' : 'Building vanilla palette…'}
            </p>
          ) : (
            <>
              <svg className="h-8 w-8 text-faint" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M16 3 28 10v12l-12 7-12-7V10Z" strokeLinejoin="round" />
                <path d="M4 10l12 7 12-7M16 17v12" strokeLinejoin="round" />
              </svg>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm text-fg">Drop your Minecraft client .jar here</p>
                <p className="text-xs text-faint">
                  or a resource pack .zip — read in your browser, never uploaded anywhere
                </p>
              </div>
              <button
                type="button"
                onClick={openPicker}
                className="rounded-control bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-hover"
              >
                Choose file
              </button>
            </>
          )}
          {state.status === 'error' && (
            <p className="max-w-md rounded-control border border-danger/30 bg-danger-dim px-3 py-2 text-xs text-danger">
              {state.errorMessage}
            </p>
          )}
        </div>
      </div>

      <ol className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <Step n={1} title="Load your jar">
          Find it in <span className="font-mono">.minecraft/versions/1.21.x/</span>. Every texture and model comes from it.
        </Step>
        <Step n={2} title="Pick what to build">
          A block, an item's 3D model, a village house, a mob or a tree — at 16³ to 64³ per block.
        </Step>
        <Step n={3} title="Export and paste">
          Download a <span className="font-mono">.litematic</span> or <span className="font-mono">.nbt</span> with a full material list.
        </Step>
      </ol>
    </div>
  );
}
