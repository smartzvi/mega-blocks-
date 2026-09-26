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
  setFlying,
  spawnAboveCenter,
  stepPlayer,
  type PlayerState,
  type SolidFn,
} from '../lib/walk/playerPhysics';
import { detectDoubleTap } from '../lib/walk/doubleTap';

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
const CAPTURED_KEYS = new Set([...Object.keys(MOVE_KEYS), 'Space', 'ShiftLeft', 'ShiftRight']);
const DESCEND_KEYS = ['ShiftLeft', 'ShiftRight'];

// The player is always a real Minecraft player in world blocks (1.8 tall, eyes at 1.62), and one voxel
// is one block once the build is exported — so this is fixed, whatever resolution the build has.
const DIMS = playerDims(1);

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
 * Double-tapping Space (or the jump button) toggles creative flight / NoClip: no gravity, no collision,
 * Space up and Shift down, so the player can hover and pass through blocks to explore a hollow build.
 * Double-tapping again is the landing — collision returns and gravity drops the player onto whatever
 * is below (see `setFlying`).
 *
 * Gravity always runs while walking, including before the pointer is captured, so the player has
 * already settled onto the build by the time the user clicks in.
 */
export function WalkRig({
  grid,
  moveRef,
  jumpRef,
  descendRef,
  onLockChange,
  onFlyChange,
}: {
  grid: VoxelGrid;
  moveRef: RefObject<WalkInput>;
  jumpRef: RefObject<boolean>;
  descendRef: RefObject<boolean>;
  onLockChange: (locked: boolean) => void;
  onFlyChange: (flying: boolean) => void;
}) {
  const { camera, gl } = useThree();
  const dims = DIMS;
  const isSolid = useMemo<SolidFn>(() => (x, y, z) => getVoxel(grid, x, y, z) !== null, [grid]);
  const player = useRef<PlayerState>(spawnAboveCenter(grid.sizeX, grid.sizeY, grid.sizeZ));
  const look = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  const locked = useRef(false);
  const touchDrag = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastTap = useRef<number | null>(null);
  const wasJumpHeld = useRef(false);

  useEffect(() => {
    player.current = spawnAboveCenter(grid.sizeX, grid.sizeY, grid.sizeZ);
    onFlyChange(false);
  }, [grid, onFlyChange]);

  // The preview camera is framed for orbiting from outside; walking needs a wider view, and a near
  // plane sized to the player (a voxel is 1 unit, the eye is dozens of units up) with a far plane
  // that still reaches the far side of a big build.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    camera.fov = FIELD_OF_VIEW;
    camera.near = 0.05;
    camera.far = Math.max(grid.sizeX, grid.sizeY, grid.sizeZ) * 8 + 10;
    camera.updateProjectionMatrix();
  }, [camera, grid]);

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
      onFlyChange(false);
    };
  }, [gl, onLockChange, onFlyChange]);

  useFrame((_, delta) => {
    let strafe = moveRef.current.x;
    let forward = moveRef.current.z;
    for (const code of keys.current) {
      const v = MOVE_KEYS[code];
      if (!v) continue;
      strafe += v[0];
      forward += v[1];
    }
    const jumpHeld = keys.current.has('Space') || jumpRef.current;

    // A press (the frame Space or the jump button goes down) is a tap; two quick ones toggle flight.
    // Detected here, from the held state, so the keyboard and the touch button share one path and
    // key auto-repeat can't count as taps.
    if (jumpHeld && !wasJumpHeld.current) {
      const tap = detectDoubleTap(lastTap.current, performance.now());
      lastTap.current = tap.next;
      if (tap.isDouble) {
        player.current = setFlying(player.current, !player.current.flying, isSolid, dims);
        onFlyChange(player.current.flying);
      }
    }
    wasJumpHeld.current = jumpHeld;

    const input = {
      strafe: Math.max(-1, Math.min(1, strafe)),
      forward: Math.max(-1, Math.min(1, forward)),
      yaw: look.current.yaw,
      jump: jumpHeld,
      descend: DESCEND_KEYS.some((code) => keys.current.has(code)) || descendRef.current,
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
