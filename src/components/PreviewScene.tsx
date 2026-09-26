import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useAppState } from '../state/AppContext';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { useFinalPalette } from '../state/useFinalPalette';
import { VoxelMesh } from './VoxelMesh';
import { SpectatorRig, type MoveVector } from './SpectatorRig';
import { SpectatorJoystick } from './SpectatorJoystick';
import { SpectatorVerticalButtons } from './SpectatorVerticalButtons';
import { useFullscreen } from './useFullscreen';
import { WalkRig, type WalkInput } from './WalkRig';
import { WalkJumpButton } from './WalkJumpButton';

type ViewMode = 'orbit' | 'spectator' | 'walk';

// Touch devices have no Pointer Lock and no Space key, so walk mode gets an on-screen joystick and
// jump button there instead of the click-to-capture prompt.
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function PreviewScene() {
  const state = useAppState();
  const voxelGrid = useFinalVoxelGrid();
  const palette = useFinalPalette();
  const [viewMode, setViewMode] = useState<ViewMode>('orbit');
  const isSpectating = viewMode === 'spectator';
  const isWalking = viewMode === 'walk';
  const [pointerLocked, setPointerLocked] = useState(false);
  const [isFlying, setIsFlying] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(viewportRef);
  // Bumped every time spectator mode is left, so the `key` below forces PerspectiveCamera and
  // OrbitControls to fully remount — flying around moves the real camera object, so returning to
  // orbit mode needs a fresh instance to land back on the original framing, not just a toggle.
  const [resetCount, setResetCount] = useState(0);
  // A ref, not state — SpectatorRig reads this every frame; routing it through React state would
  // re-render the whole scene on every joystick/button pixel of movement for no benefit. One
  // shared object mutated in place by three independent inputs (joystick: x/z, vertical buttons:
  // y, keyboard: read directly inside SpectatorRig) — see MoveVector's own doc for why each input
  // only ever touches its own field(s) rather than replacing the whole object.
  const moveVector = useRef<MoveVector>({ x: 0, y: 0, z: 0 });
  // Walk mode's own joystick/jump inputs — separate refs so leaving one mode never leaves a stuck
  // value behind for the other.
  const walkInput = useRef<WalkInput>({ x: 0, z: 0 });
  const walkJump = useRef(false);
  const walkDescend = useRef(false);
  // Set when the walk button is pressed outside fullscreen: the fullscreen request is asynchronous, so
  // walk mode starts once the browser confirms it (effect below), not immediately.
  const walkPending = useRef(false);

  const exitSpectatorMode = useCallback(() => {
    setViewMode('orbit');
    setResetCount((n) => n + 1);
  }, []);

  const exitWalkMode = useCallback(() => {
    setViewMode('orbit');
    setResetCount((n) => n + 1);
    walkInput.current.x = 0;
    walkInput.current.z = 0;
    walkJump.current = false;
    walkDescend.current = false;
    setIsFlying(false);
  }, []);

  const enterWalkMode = useCallback(() => {
    if (isFullscreen) {
      setViewMode('walk');
      return;
    }
    walkPending.current = true;
    toggleFullscreen();
    // A refused fullscreen request never confirms; don't let a stale request start walking later.
    window.setTimeout(() => (walkPending.current = false), 1500);
  }, [isFullscreen, toggleFullscreen]);

  useEffect(() => {
    if (isFullscreen && walkPending.current && viewMode === 'orbit') {
      walkPending.current = false;
      setViewMode('walk');
    }
  }, [isFullscreen, viewMode]);

  // Walking is a fullscreen mode: leaving fullscreen (Esc, the browser's own controls, or our
  // button) returns to the normal viewer instead of walking around a small embedded canvas.
  useEffect(() => {
    if (isWalking && !isFullscreen) exitWalkMode();
  }, [isWalking, isFullscreen, exitWalkMode]);

  useEffect(() => {
    if (!isSpectating) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Escape') exitSpectatorMode();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSpectating, exitSpectatorMode]);

  if (!voxelGrid || !palette) return null;

  // The base camera position was tuned for a 16-cube; scale it so a 32/64-cube (or any future
  // size) is framed the same way instead of overflowing the viewport or sitting too close. Uses
  // the largest dimension so a non-cubic structure (a 2-block-tall door, a 2-block-long bed)
  // still fits entirely in frame rather than being scaled only for one axis.
  const scale = Math.max(voxelGrid.sizeX, voxelGrid.sizeY, voxelGrid.sizeZ) / 16;
  // Every hand-authored mob is built with its anatomical front (head, eyes) at the low end of its
  // own Z range — real Minecraft-compass "north" — but this +Z camera corner can only ever see
  // the opposite (+Z, "south") side of anything, since a face's own outward normal has to have a
  // positive dot product with the direction to the camera to be visible at all. For a block or
  // item that has no "front" this never mattered; for a mob, it means the default view showed the
  // animal's rear/tail end, with the head barely peeking out the far side — not a geometry bug,
  // a camera-facing mismatch (confirmed:
  // real per-mob voxel data was already correct and unchanged across several rounds of investigating
  // this as if it were one). Flipping to a -Z camera corner for mobs mode looks at the front instead.
  const cameraZ = state.mode === 'mobs' ? -24 * scale : 24 * scale;
  const cameraPosition: [number, number, number] = [24 * scale, 20 * scale, cameraZ];
  // Spectator move speed scales with the build the same way the camera framing does, so walking
  // through a 64-cube doesn't feel like crawling relative to its size.
  const moveSpeed = 6 * scale;

  return (
    <div
      ref={viewportRef}
      className={
        isFullscreen
          ? 'flex h-full w-full flex-col overflow-hidden bg-slate-950'
          : 'w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)]'
      }
    >
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">3D Preview</span>
        {viewMode === 'orbit' && <span className="hidden text-xs text-slate-600 sm:inline">drag to rotate · scroll to zoom</span>}
      </div>
      <div className={`relative w-full bg-gradient-to-b from-slate-900 to-slate-950 ${isFullscreen ? 'min-h-0 flex-1' : 'h-[480px]'}`}>
        <Canvas>
          <PerspectiveCamera key={resetCount} makeDefault position={cameraPosition} fov={45} onUpdate={(c) => c.lookAt(0, 0, 0)} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.2} />
          <directionalLight position={[-10, -10, -10]} intensity={0.3} />
          <VoxelMesh grid={voxelGrid} palette={palette} />
          {isWalking ? (
            <WalkRig
              grid={voxelGrid}
              moveRef={walkInput}
              jumpRef={walkJump}
              descendRef={walkDescend}
              onLockChange={setPointerLocked}
              onFlyChange={setIsFlying}
            />
          ) : isSpectating ? (
            <SpectatorRig moveSpeed={moveSpeed} joystickRef={moveVector} />
          ) : (
            <OrbitControls key={resetCount} enableDamping target={[0, 0, 0]} />
          )}
        </Canvas>
        {/* Spectating shows only the movement controls themselves — no instructional text
            cluttering the render — since the joystick and buttons are self-explanatory and the
            exit control lives in the top-right control cluster. */}
        {isWalking && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70" />
              <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/70" />
            </div>
            {isFlying && (
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-emerald-500/40 bg-slate-900/80 px-3 py-1 text-xs font-medium text-emerald-300">
                Flying · no collision · double-tap {isTouchDevice() ? 'jump' : 'Space'} to land
              </div>
            )}
            {isTouchDevice() ? (
              <div className="absolute inset-0 flex items-end justify-between p-4">
                <div className="pointer-events-auto">
                  <SpectatorJoystick
                    onChange={(v) => {
                      walkInput.current.x = v.x;
                      walkInput.current.z = v.z;
                    }}
                  />
                </div>
                <div className="pointer-events-auto flex flex-col items-center gap-3">
                  <WalkJumpButton onChange={(held) => (walkJump.current = held)} />
                  {isFlying && <WalkJumpButton down onChange={(held) => (walkDescend.current = held)} />}
                </div>
              </div>
            ) : (
              !pointerLocked && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50">
                  <div className="rounded-xl border border-slate-700 bg-slate-900/90 px-6 py-4 text-center">
                    <p className="text-sm font-semibold text-slate-100">Click to play</p>
                    <p className="mt-1 text-xs text-slate-400">WASD to walk · Space to jump · mouse to look · Esc to release</p>
                    <p className="mt-1 text-xs text-slate-500">Double-tap Space to fly through blocks · Shift to go down</p>
                  </div>
                </div>
              )
            )}
          </div>
        )}
        {isSpectating && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-between p-4">
            <div className="pointer-events-auto">
              <SpectatorJoystick
                onChange={(v) => {
                  moveVector.current.x = v.x;
                  moveVector.current.z = v.z;
                }}
              />
            </div>
            <div className="pointer-events-auto">
              <SpectatorVerticalButtons onChange={(y) => (moveVector.current.y = y)} />
            </div>
          </div>
        )}
        {/* Every view control lives here, inside the viewport's top-right corner, so it's reachable in
            fullscreen and in every mode (the header above isn't part of the canvas). */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {viewMode === 'orbit' && (
            <>
              <ViewButton label="Enter walk mode" title="Walk mode — explore in first person (opens fullscreen)" onClick={enterWalkMode}>
                🚶
              </ViewButton>
              <ViewButton label="Enter spectator mode" title="Spectator mode — fly through and inspect the build" onClick={() => setViewMode('spectator')}>
                🎮
              </ViewButton>
            </>
          )}
          <ViewButton
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? '🗗' : '⛶'}
          </ViewButton>
          {(isSpectating || isWalking) && (
            <ViewButton
              label={isWalking ? 'Exit walk mode' : 'Exit spectator mode'}
              title={isWalking ? 'Exit walk mode' : 'Exit spectator mode'}
              onClick={isWalking ? exitWalkMode : exitSpectatorMode}
            >
              ✕
            </ViewButton>
          )}
        </div>
      </div>
    </div>
  );
}

function ViewButton({ label, title, onClick, children }: { label: string; title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={label}
      className="flex h-9 min-w-9 items-center justify-center rounded-full border border-slate-600 bg-slate-900/75 px-2.5 text-base leading-none text-slate-200 shadow-lg shadow-black/40 backdrop-blur-sm transition-colors hover:bg-slate-700 hover:text-white"
    >
      {children}
    </button>
  );
}
