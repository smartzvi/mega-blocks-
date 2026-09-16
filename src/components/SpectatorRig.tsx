import { useEffect, useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/** Forward/strafe/vertical contribution, -1..1 per axis — shared shape for the keyboard map
 *  below, the on-screen joystick (SpectatorJoystick.tsx, x/z only), and the up/down buttons
 *  (SpectatorVerticalButtons.tsx, y only), so SpectatorRig can just add them together every frame
 *  regardless of which input actually produced them. PreviewScene.tsx owns one shared instance and
 *  has each control mutate only its own field(s) — never replace the whole object — so e.g.
 *  pressing "up" doesn't erase whatever the joystick already set for x/z, and vice versa. */
export interface MoveVector {
  x: number; // strafe: -1 left .. 1 right
  y: number; // -1 down .. 1 up
  z: number; // -1 back .. 1 forward
}

const MOVE_KEYS: Record<string, [x: number, y: number, z: number]> = {
  KeyW: [0, 0, 1],
  ArrowUp: [0, 0, 1],
  KeyS: [0, 0, -1],
  ArrowDown: [0, 0, -1],
  KeyA: [-1, 0, 0],
  ArrowLeft: [-1, 0, 0],
  KeyD: [1, 0, 0],
  ArrowRight: [1, 0, 0],
  Space: [0, 1, 0],
  ShiftLeft: [0, -1, 0],
  ShiftRight: [0, -1, 0],
};

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const LOOK_SENSITIVITY = 0.0025;

/**
 * Free-fly "spectator" camera for the 3D preview — replaces OrbitControls (which always orbits
 * a fixed target) when the user wants to move *through* a build rather than just spin it in
 * place. Two input schemes, both active at once so desktop and touch each get a natural one:
 *
 * - Look: drag anywhere on the canvas (mouse or touch — Pointer Events cover both) to rotate the
 *   view, exactly like OrbitControls' own drag gesture, just changing the camera's orientation
 *   instead of orbiting a target. No Pointer Lock API involved (unlike a typical FPS control
 *   scheme) specifically so this keeps working on touch devices, which don't support it.
 * - Move: WASD/arrow keys + Space/Shift (desktop), or the on-screen joystick (horizontal) plus
 *   up/down buttons (vertical) — any device, and all of it added together, so e.g. holding W
 *   while also dragging the joystick just moves faster rather than one overriding the other.
 *   Horizontal movement is relative to where the camera is currently looking (flattened to the
 *   horizontal plane for forward/strafe, matching how Minecraft's own spectator mode moves), not
 *   the world axes; vertical movement is always along the true world Y axis regardless of pitch.
 *
 * Initializes its internal yaw/pitch from the camera's current orientation on mount, so switching
 * from OrbitControls into spectator mode continues from the same view instead of snapping to a
 * different direction.
 */
export function SpectatorRig({ moveSpeed, joystickRef }: { moveSpeed: number; joystickRef: RefObject<MoveVector> }) {
  const { camera, gl } = useThree();
  const pressedKeys = useRef(new Set<string>());
  const yawPitch = useRef({ yaw: 0, pitch: 0 });
  const draggingPointerId = useRef<number | null>(null);
  const lastPointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    yawPitch.current.yaw = euler.y;
    yawPitch.current.pitch = euler.x;
  }, [camera]);

  useEffect(() => {
    const dom = gl.domElement;

    function onKeyDown(e: KeyboardEvent) {
      pressedKeys.current.add(e.code);
    }
    function onKeyUp(e: KeyboardEvent) {
      pressedKeys.current.delete(e.code);
    }
    function onPointerDown(e: PointerEvent) {
      draggingPointerId.current = e.pointerId;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      dom.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e: PointerEvent) {
      if (draggingPointerId.current !== e.pointerId) return;
      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      yawPitch.current.yaw -= dx * LOOK_SENSITIVITY;
      yawPitch.current.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, yawPitch.current.pitch - dy * LOOK_SENSITIVITY));
    }
    function onPointerUp(e: PointerEvent) {
      if (draggingPointerId.current !== e.pointerId) return;
      draggingPointerId.current = null;
      dom.releasePointerCapture(e.pointerId);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', onPointerUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointermove', onPointerMove);
      dom.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('pointercancel', onPointerUp);
    };
  }, [gl]);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const offset = new THREE.Vector3();

  useFrame((_, delta) => {
    camera.quaternion.setFromEuler(new THREE.Euler(yawPitch.current.pitch, yawPitch.current.yaw, 0, 'YXZ'));

    let moveX = 0;
    let moveY = 0;
    let moveZ = 0;
    for (const code of pressedKeys.current) {
      const v = MOVE_KEYS[code];
      if (!v) continue;
      moveX += v[0];
      moveY += v[1];
      moveZ += v[2];
    }
    moveX += joystickRef.current.x;
    moveY += joystickRef.current.y;
    moveZ += joystickRef.current.z;
    if (moveX === 0 && moveY === 0 && moveZ === 0) return;

    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() > 0) forward.normalize();
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    if (right.lengthSq() > 0) right.normalize();

    offset.set(0, 0, 0).addScaledVector(forward, moveZ).addScaledVector(right, moveX);
    offset.y += moveY;
    if (offset.lengthSq() === 0) return;
    offset.normalize().multiplyScalar(moveSpeed * delta);
    camera.position.add(offset);
  });

  return null;
}
