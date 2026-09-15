import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MoveVector } from './SpectatorRig';

const RADIUS = 40; // px — half the outer ring's diameter, how far the knob can travel

/**
 * On-screen virtual joystick for moving through spectator mode on any device (a mouse can drag it
 * too, not just touch) — SpectatorRig.tsx's drag-to-look gesture already covers the canvas itself,
 * so movement needs its own, separate input that doesn't fight it for the same drag gesture. Pans
 * `onChange` a `{x, z}` vector each pointer move, matching SpectatorRig's own axis convention
 * (up on the stick = forward = +z, right = +x); returns to `{0, 0}` on release. Reports its own
 * pointer events with `stopPropagation` so dragging the knob can never also register as a
 * look-drag on the canvas underneath it.
 */
export function SpectatorJoystick({ onChange }: { onChange: (vector: MoveVector) => void }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const draggingId = useRef<number | null>(null);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const base = baseRef.current;
      if (!base) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > RADIUS) {
        dx = (dx / dist) * RADIUS;
        dy = (dy / dist) * RADIUS;
      }
      setKnob({ x: dx, y: dy });
      onChange({ x: dx / RADIUS, z: -dy / RADIUS });
    },
    [onChange]
  );

  function handlePointerDown(e: ReactPointerEvent) {
    e.stopPropagation();
    draggingId.current = e.pointerId;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    updateFromPointer(e.clientX, e.clientY);
  }
  function handlePointerMove(e: ReactPointerEvent) {
    if (draggingId.current !== e.pointerId) return;
    e.stopPropagation();
    updateFromPointer(e.clientX, e.clientY);
  }
  function handlePointerUp(e: ReactPointerEvent) {
    if (draggingId.current !== e.pointerId) return;
    e.stopPropagation();
    draggingId.current = null;
    setKnob({ x: 0, y: 0 });
    onChange({ x: 0, z: 0 });
  }

  return (
    <div
      ref={baseRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-24 w-24 touch-none select-none rounded-full border border-emerald-500/30 bg-slate-950/70 backdrop-blur-sm"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 rounded-full bg-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.6)] transition-transform duration-75"
        style={{ transform: `translate(-50%, -50%) translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
