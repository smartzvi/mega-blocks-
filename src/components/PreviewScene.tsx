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
import { SectionHeader } from './ui/Panel';

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
  const [meshing, setMeshing] = useState(false);
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

  const touch = isTouchDevice();

  // The base camera position was tuned for a 16-cube; scale it so a 32/64-cube (or any future
  // size) is framed the same way instead of overflowing the viewport or sitting too close. Uses
  // the largest dimension so a non-cubic structure (a 2-block-tall door, a 2-block-long bed)
  // still fits entirely in frame rather than being scaled only for one axis.
  const maxDim = Math.max(voxelGrid.sizeX, voxelGrid.sizeY, voxelGrid.sizeZ);
  const scale = maxDim / 16;
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
          ? 'flex h-full w-full flex-col overflow-hidden bg-canvas'
          : 'w-full overflow-hidden rounded-panel border border-line bg-panel'
      }
    >
      <SectionHeader title="Preview">
        {viewMode === 'orbit' && <span className="hidden text-xs text-faint sm:inline">Drag to rotate · scroll to zoom</span>}
        <span className="font-mono text-xs text-muted">
          {voxelGrid.sizeX}×{voxelGrid.sizeY}×{voxelGrid.sizeZ}
        </span>
      </SectionHeader>
      {/* touch-none: a drag on the model rotates it instead of scrolling the page. */}
      <div className={`viewport-grid relative w-full touch-none ${isFullscreen ? 'min-h-0 flex-1' : 'h-[420px] sm:h-[480px]'}`}>
        <Canvas
          // Orbit view only redraws when the camera moves (OrbitControls invalidates on change);
          // walk/spectator animate every frame, so they keep the continuous loop.
          frameloop={viewMode === 'orbit' ? 'demand' : 'always'}
          // Phones have 3x screens: rendering at 3x with antialiasing is most of their GPU budget.
          dpr={touch ? [1, 1.5] : [1, 2]}
          gl={{ antialias: !touch, powerPreference: 'high-performance' }}        >
          <PerspectiveCamera
            key={`camera-${resetCount}`}
            makeDefault
            position={cameraPosition}
            fov={45}
            // Sized to the build: the default far plane (2000) cut big structures off while rotating.
            near={Math.max(0.05, maxDim / 2000)}
            far={maxDim * 12 + 100}
            onUpdate={(c) => c.lookAt(0, 0, 0)}
          />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.2} />
          <directionalLight position={[-10, -10, -10]} intensity={0.3} />
          <VoxelMesh grid={voxelGrid} palette={palette} onBusyChange={setMeshing} />
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
            <OrbitControls
              key={`orbit-${resetCount}`}
              enableDamping
              dampingFactor={0.12}
              target={[0, 0, 0]}
              // Zoom is multiplicative, so pinching all the way in used to park the camera almost on
              // the orbit point, where zoom barely moves and rotation spins wildly; zooming out had
              // no end either. Keep it between close-up and "the whole build small in view".
              minDistance={maxDim * 0.1}
              maxDistance={maxDim * 6}
              rotateSpeed={touch ? 0.7 : 1}
              zoomSpeed={touch ? 0.8 : 1}
            />
          )}
        </Canvas>
        {meshing && (
          <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-control border border-line-strong bg-panel/90 px-2.5 py-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-[1px] bg-accent" />
            Preparing preview…
          </div>
        )}
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
              <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-control border border-accent/40 bg-panel/90 px-3 py-1 font-mono text-xs text-accent">
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
                <div className="absolute inset-0 flex items-center justify-center bg-canvas/50">
                  <div className="rounded-panel border border-line-strong bg-panel/95 px-6 py-4 text-center">
                    <p className="text-sm font-semibold text-fg">Click to play</p>
                    <p className="mt-1 text-xs text-muted">WASD to walk · Space to jump · mouse to look · Esc to release</p>
                    <p className="mt-1 text-xs text-faint">Double-tap Space to fly through blocks · Shift to go down</p>
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
                <Icon d="M13 4.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9.5 8l-3 1.5V13M9.5 8l2.5 1 1.5 3 2 .5M9.5 8 8.5 13l-2 5M8.5 13l3 1.5 1 3.5" />
              </ViewButton>
              <ViewButton label="Enter spectator mode" title="Spectator mode — fly through and inspect the build" onClick={() => setViewMode('spectator')}>
                <Icon d="M10 2.5v15M2.5 10h15M10 2.5 8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2" />
              </ViewButton>
            </>
          )}
          <ViewButton
            label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? (
              <Icon d="M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17" />
            ) : (
              <Icon d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" />
            )}
          </ViewButton>
          {(isSpectating || isWalking) && (
            <ViewButton
              label={isWalking ? 'Exit walk mode' : 'Exit spectator mode'}
              title={isWalking ? 'Exit walk mode' : 'Exit spectator mode'}
              onClick={isWalking ? exitWalkMode : exitSpectatorMode}
            >
              <Icon d="M5 5l10 10M15 5 5 15" />
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
      className="flex h-9 w-9 items-center justify-center rounded-control border border-line-strong bg-panel/90 text-muted shadow-lg shadow-black/40 transition-colors hover:bg-raised hover:text-fg"
    >
      {children}
    </button>
  );
}

/** A 20×20 line icon for the viewport's buttons. */
function Icon({ d }: { d: string }) {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
