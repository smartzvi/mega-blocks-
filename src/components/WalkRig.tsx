import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { VoxelGrid } from '../types/minecraft';
import { getVoxel } from '../lib/voxel/voxelGrid';
import {
  eyePosition,
  fellOutOfWorld,
  physicsToRender,
  playerDims,
  spawnAboveCenter,
  stepPlayer,
  type PlayerState,
  type SolidFn,
} from '../lib/walk/playerPhysics';

const MOVE_KEYS: Record<string, [strafe: number, forward: number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
// Space would scroll the page, and the arrows too, so those are swallowed while playing.
const CAPTURED_KEYS = new Set([...Object.keys(MOVE_KEYS), 'Space']);

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const LOOK_SENSITIVITY = 0.0022;
const FIELD_OF_VIEW = 75;

/** Joystick input, the same shape SpectatorRig's MoveVector uses for its horizontal part. */
export interface WalkInput {
  x: number; // strafe: -1 left .. 1 right
  z: number; // -1 back .. 1 forward
}

/**
 * First-person "player" camera: replaces OrbitControls/SpectatorRig while walking. The physics itself
 * lives in lib/walk/playerPhysics.ts (pure, tested); this component only turns input into a
 * `PlayerInput`, steps it every frame, and puts the camera at the player's eyes.
 *
 * Input:
 * - Mouse: click the canvas to capture the pointer (Pointer Lock), then mouse movement looks around.
 *   Esc releases it — the browser handles that itself and reports it through `pointerlockchange`,
 *   which is why `onLockChange` exists (a keydown for Esc is not reliably delivered).
 * - Keyboard: WASD or arrows to walk, Space to jump. Only read while the pointer is captured, so
 *   typing elsewhere on the page can never walk the player.
 * - Touch: no Pointer Lock on touch devices, so dragging the canvas looks around, and the on-screen
 *   joystick (`moveRef`) and jump button (`jumpRef`) supply the rest — all combined, like spectator.
 *
 * Gravity always runs, including before the pointer is captured, so the player has already settled
 * onto the build by the time the user clicks in.
 */
export function WalkRig({
  grid,
  unit,
  moveRef,
  jumpRef,
  onLockChange,
}: {
  grid: VoxelGrid;
  /** Voxels per Minecraft block (the resolution) — sizes the player, its speed and its jump. */
  unit: number;
  moveRef: RefObject<WalkInput>;
  jumpRef: RefObject<boolean>;
  onLockChange: (locked: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const dims = useMemo(() => playerDims(unit), [unit]);
  const isSolid = useMemo<SolidFn>(() => (x, y, z) => getVoxel(grid, x, y, z) !== null, [grid]);
  const player = useRef<PlayerState>(spawnAboveCenter(grid.sizeX, grid.sizeY, grid.sizeZ));
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const touchDrag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    player.current = spawnAboveCenter(grid.sizeX, grid.sizeY, grid.sizeZ);
  }, [grid]);

  // The preview camera is framed for orbiting from outside; walking needs a wider view, and a near
  // plane sized to the player (a voxel is 1 unit, the eye is dozens of units up) with a far plane
  // that still reaches the far side of a big build.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.fov = FIELD_OF_VIEW;
    camera.near = unit * 0.05;
    camera.far = Math.max(grid.sizeX, grid.sizeY, grid.sizeZ) * 8 + unit * 10;
    camera.updateProjectionMatrix();
  }, [camera, grid, unit]);

  useEffect(() => {
    const dom = gl.domElement;

    function onKeyDown(e: KeyboardEvent) {
      if (!locked.current || !CAPTURED_KEYS.has(e.code)) return;
      e.preventDefault();
      keys.current.add(e.code);
    }
    function onKeyUp(e: KeyboardEvent) {
      keys.current.delete(e.code);
    }
    function onBlur() {
      keys.current.clear();
    }
    function onLockStateChange() {
      locked.current = document.pointerLockElement === dom;
      if (!locked.current) keys.current.clear();
      onLockChange(locked.current);
    }
    function onMouseMove(e: MouseEvent) {
      if (!locked.current) return;
      look.current.yaw -= e.movementX * LOOK_SENSITIVITY;
      look.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.current.pitch - e.movementY * LOOK_SENSITIVITY));
    }
    function onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse') {
        // A refused request (no user gesture, blocked by policy) just leaves the click as a no-op.
        if (!locked.current) void Promise.resolve(dom.requestPointerLock()).catch(() => {});
        return;
      }
      touchDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      const drag = touchDrag.current;
      if (!drag || drag.id !== e.pointerId) return;
      look.current.yaw -= (e.clientX - drag.x) * LOOK_SENSITIVITY;
      look.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, look.current.pitch - (e.clientY - drag.y) * LOOK_SENSITIVITY));
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
    function onPointerUp(e: PointerEvent) {
      if (touchDrag.current?.id !== e.pointerId) return;
      touchDrag.current = null;
      dom.releasePointerCapture(e.pointerId);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onLockStateChange);
    document.addEventListener('mousemove', onMouseMove);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockStateChange);
      document.removeEventListener('mousemove', onMouseMove);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
      if (document.pointerLockElement === dom) document.exitPointerLock();
      locked.current = false;
      onLockChange(false);
    };
  }, [gl, onLockChange]);

  useFrame((_, delta) => {
    let strafe = moveRef.current.x;
    let forward = moveRef.current.z;
    for (const code of keys.current) {
      const v = MOVE_KEYS[code];
      if (!v) continue;
      strafe += v[0];
      forward += v[1];
    }
    const input = {
      strafe: Math.max(-1, Math.min(1, strafe)),
      forward: Math.max(-1, Math.min(1, forward)),
      yaw: look.current.yaw,
      jump: keys.current.has('Space') || jumpRef.current,
    };

    let next = stepPlayer(player.current, input, delta, isSolid, dims);
    if (fellOutOfWorld(next, dims)) next = spawnAboveCenter(grid.sizeX, grid.sizeY, grid.sizeZ);
    player.current = next;

    const [x, y, z] = physicsToRender(eyePosition(next, dims), grid.sizeX, grid.sizeY, grid.sizeZ);
    camera.position.set(x, y, z);
    camera.quaternion.setFromEuler(new THREE.Euler(look.current.pitch, look.current.yaw, 0, 'YXZ'));
  });

  return null;
}
