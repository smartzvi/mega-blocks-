import type { PointerEvent as ReactPointerEvent } from 'react';

/** Press-and-hold jump for touch play in walk mode (there's no Space key on a phone). Reports
 *  `onChange(true)` while held and `false` on release, the same held-until-told-otherwise shape the
 *  joystick and keyboard use. Pointer events are stopped so pressing it never also starts a
 *  look-drag on the canvas underneath. */
export function WalkJumpButton({ onChange }: { onChange: (held: boolean) => void }) {
  const press = (e: ReactPointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange(true);
  };
  const release = (e: ReactPointerEvent) => {
    e.stopPropagation();
    onChange(false);
  };
  return (
    <button
      type="button"
      aria-label="Jump"
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      className="flex h-16 w-16 select-none items-center justify-center rounded-full border border-slate-600 bg-slate-800/70 text-2xl text-slate-200 active:bg-emerald-600/70"
      style={{ touchAction: 'none' }}
    >
      ⤒
    </button>
  );
}
