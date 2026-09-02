import { AppProvider, useAppState } from './state/AppContext';
import { AdRail } from './components/AdRail';
import { AdSenseLoader } from './components/AdSenseLoader';
import { UploadPanel } from './components/UploadPanel';
import { ResolutionToggle } from './components/ResolutionToggle';
import { ModeToggle } from './components/ModeToggle';
import { BlockSearch } from './components/BlockSearch';
import { ShapeSelector } from './components/ShapeSelector';
import { ItemPicker } from './components/ItemPicker';
import { StructurePicker } from './components/StructurePicker';
import { MobPicker } from './components/MobPicker';
import { PreviewScene } from './components/PreviewScene';
import { MaterialList } from './components/MaterialList';
import { ExportButtons } from './components/ExportButtons';

function Workspace() {
  const state = useAppState();
  return (
    <>
      <UploadPanel />
      <ResolutionToggle />
      <ModeToggle />
      {state.mode === 'block' && (
        <>
          <BlockSearch />
          <ShapeSelector />
        </>
      )}
      {state.mode === 'item' && <ItemPicker />}
      {state.mode === 'structure' && <StructurePicker />}
      {state.mode === 'mobs' && <MobPicker />}
      <PreviewScene />
      <MaterialList />
      <ExportButtons />
    </>
  );
}

function AppShell() {
  const state = useAppState();
  // Centered like a hero screen only while there's nothing else to show yet. Once a jar is
  // loading/loaded, keep everything top-aligned instead — otherwise the picker/preview/material
  // list all land pushed down by the same vertical-centering that looked good on an empty page,
  // forcing extra scrolling to reach content that should be immediately visible.
  const isIdle = state.status === 'idle';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-950 text-slate-200">
      <AdSenseLoader />
      {/* Ambient background glow — purely decorative */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-10%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute right-[-10%] top-[30%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/5 blur-[120px]" />
      </div>

      <div
        className={`relative mx-auto flex min-h-screen max-w-[1400px] justify-center gap-6 px-4 py-12 sm:px-6 md:py-16 ${
          isIdle ? 'items-center' : 'items-start'
        }`}
      >
        <AdRail side="left" />

        <main className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-8 text-center">
          <header className="w-full text-center">
            <h1 className="text-balance bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-extrabold leading-tight tracking-tight text-transparent sm:text-5xl md:text-6xl">
              Minecraft Block <span className="text-emerald-400">→</span> 3D Megablock Generator
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base text-slate-400 sm:text-lg">
              Upload your resource pack, pick a block, and build a giant pixel-art megablock out of real vanilla
              materials.
            </p>
          </header>

          <Workspace />

          <footer className="mt-4 text-center text-xs text-slate-500">
            <a href="/privacy.html" className="hover:text-slate-300">
              Privacy Policy
            </a>
          </footer>
        </main>

        <AdRail side="right" />
      </div>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

export default App;
