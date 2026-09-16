import { useRef, type PointerEvent as ReactPointerEvent } from 'react';

/**
 * Up/down movement for spectator mode — the joystick (SpectatorJoystick.tsx) only ever drives
 * horizontal movement, matching a real analog stick's two axes, so vertical needs its own control
 * rather than being crammed into the same widget. Two stacked press-and-hold buttons; each reports
 * `onChange(1 | -1)` while held and `onChange(0)` on release (including the pointer sliding off
 * the button or being interrupted — `pointerleave`/`pointercancel` cover that the same as a real
 * `pointerup` would), the same "held until told otherwise" shape the joystick and keyboard already
 * use, so SpectatorRig can treat all three inputs identically.
 */
export function SpectatorVerticalButtons({ onChange }: { onChange: (y: number) => void }) {
  const activeButton = useRef<'up' | 'down' | null>(null);

  function press(which: 'up' | 'down', value: number) {
    return (e: ReactPointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      activeButton.current = which;
      onChange(value);
    };
  }
  function release(which: 'up' | 'down') {
    return (e: ReactPointerEvent) => {
      if (activeButton.current !== which) return;
      e.stopPropagation();
      activeButton.current = null;
      onChange(0);
    };
  }

  const buttonClass =
    'flex h-11 w-11 touch-none select-none items-center justify-center rounded-full border border-emerald-500/30 bg-slate-950/70 text-lg text-emerald-300 backdrop-blur-sm active:bg-emerald-500/20';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label="Move up"
        title="Move up"
        onPointerDown={press('up', 1)}
        onPointerUp={release('up')}
        onPointerLeave={release('up')}
        onPointerCancel={release('up')}
        className={buttonClass}
      >
        ▲
      </button>
      <button
        type="button"
        aria-label="Move down"
        title="Move down"
        onPointerDown={press('down', -1)}
        onPointerUp={release('down')}
        onPointerLeave={release('down')}
        onPointerCancel={release('down')}
        className={buttonClass}
      >
        ▼
      </button>
    </div>
  );
}
