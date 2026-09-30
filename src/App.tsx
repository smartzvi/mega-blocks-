import { AppProvider, useAppState } from './state/AppContext';
import { AdRail } from './components/AdRail';
import { AdSenseLoader } from './components/AdSenseLoader';
import { JarStatus, UploadPanel } from './components/UploadPanel';
import { ResolutionToggle } from './components/ResolutionToggle';
import { ModeToggle } from './components/ModeToggle';
import { BlockSearch } from './components/BlockSearch';
import { ShapeSelector } from './components/ShapeSelector';
import { ConnectionToggle } from './components/ConnectionToggle';
import { RailShapeToggle } from './components/RailShapeToggle';
import { LeverPoweredToggle } from './components/LeverPoweredToggle';
import { BoatWoodToggle } from './components/BoatWoodToggle';
import { ItemPicker } from './components/ItemPicker';
import { StructurePicker } from './components/StructurePicker';
import { MobPicker } from './components/MobPicker';
import { TreePicker } from './components/TreePicker';
import { PreviewScene } from './components/PreviewScene';
import { MaterialList } from './components/MaterialList';
import { ExportButtons } from './components/ExportButtons';
import { Wordmark } from './components/ui/Logo';

/** The mode tabs, then one card holding the mode's picker and its settings. */
function SetupPanel() {
  const state = useAppState();

  return (
    <section className="w-full rounded-panel border border-line bg-panel">
      <ModeToggle />
      <div className="flex flex-col gap-5 p-4 sm:p-5">
        {state.mode === 'block' && <BlockSearch />}
        {state.mode === 'item' && <ItemPicker />}
        {state.mode === 'structure' && <StructurePicker />}
        {state.mode === 'mobs' && <MobPicker />}
        {state.mode === 'trees' && <TreePicker />}

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <ResolutionToggle />
          {state.mode === 'block' && <ShapeSelector />}
          {state.mode === 'item' && (
            <>
              <ConnectionToggle />
              <RailShapeToggle />
              <LeverPoweredToggle />
            </>
          )}
          {state.mode === 'mobs' && (
            <>
              <BoatWoodToggle />
              <RailShapeToggle />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Workspace() {
  const state = useAppState();
  if (state.status !== 'ready') return <UploadPanel />;
  return (
    <>
      <SetupPanel />
      <PreviewScene />
      <MaterialList />
      <ExportButtons />
    </>
  );
}

function AppShell() {
  const state = useAppState();
  const isIdle = state.status !== 'ready';

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas text-fg">
      <AdSenseLoader />
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <JarStatus />
        </div>
      </header>

      <div className={`mx-auto flex max-w-[1400px] justify-center gap-6 px-4 sm:px-6 ${isIdle ? 'py-12 md:py-20' : 'py-6 md:py-8'}`}>
        <AdRail side="left" />

        <main className="flex w-full min-w-0 max-w-3xl flex-col gap-4">
          <Workspace />

          <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-4 text-xs text-faint">
            <a href="/privacy.html" className="transition-colors hover:text-muted">
              Privacy
            </a>
            <span>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</span>
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
