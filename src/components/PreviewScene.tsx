import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useAppState } from '../state/AppContext';
import { useFinalVoxelGrid } from '../state/useFinalVoxelGrid';
import { useFinalPalette } from '../state/useFinalPalette';
import { VoxelMesh } from './VoxelMesh';
import { SpectatorRig, type MoveVector } from './SpectatorRig';
import { SpectatorJoystick } from './SpectatorJoystick';

export function PreviewScene() {
  const state = useAppState();
  const voxelGrid = useFinalVoxelGrid();
  const palette = useFinalPalette();
  const [isSpectating, setIsSpectating] = useState(false);
  // Bumped every time spectator mode is left, so the `key` below forces PerspectiveCamera and
  // OrbitControls to fully remount — flying around moves the real camera object, so returning to
  // orbit mode needs a fresh instance to land back on the original framing, not just a toggle.
  const [resetCount, setResetCount] = useState(0);
  // A ref, not state — SpectatorRig reads this every frame; routing it through React state would
  // re-render the whole scene on every joystick pixel of movement for no benefit.
  const joystickVector = useRef<MoveVector>({ x: 0, z: 0 });

  const exitSpectatorMode = useCallback(() => {
    setIsSpectating(false);
    setResetCount((n) => n + 1);
  }, []);

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
  const moveSpeed = 14 * scale;

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">3D Preview</span>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-600 sm:inline">
            {isSpectating ? 'drag to look · WASD/joystick to move · Esc to exit' : 'drag to rotate · scroll to zoom'}
          </span>
          {isSpectating ? (
            <button
              type="button"
              onClick={exitSpectatorMode}
              className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              Exit spectator mode
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSpectating(true)}
              title="Spectator mode — fly through and inspect the build"
              aria-label="Enter spectator mode"
              className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-sm transition-colors hover:bg-slate-700"
            >
              🎮
            </button>
          )}
        </div>
      </div>
      <div className="relative h-[480px] w-full bg-gradient-to-b from-slate-900 to-slate-950">
        <Canvas>
          <PerspectiveCamera key={resetCount} makeDefault position={cameraPosition} fov={45} onUpdate={(c) => c.lookAt(0, 0, 0)} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 10]} intensity={1.2} />
          <directionalLight position={[-10, -10, -10]} intensity={0.3} />
          <VoxelMesh grid={voxelGrid} palette={palette} />
          {isSpectating ? (
            <SpectatorRig moveSpeed={moveSpeed} joystickRef={joystickVector} />
          ) : (
            <OrbitControls key={resetCount} enableDamping target={[0, 0, 0]} />
          )}
        </Canvas>
        {isSpectating && (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-between p-4">
            <div className="pointer-events-auto">
              <SpectatorJoystick onChange={(v) => (joystickVector.current = v)} />
            </div>
            <span className="pointer-events-none rounded-lg bg-slate-950/70 px-2.5 py-1.5 text-[11px] text-slate-400 sm:hidden">
              Drag to look · joystick to move
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
