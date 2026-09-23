import { useAppDispatch, useAppState } from '../state/AppContext';
import { isLever } from '../lib/models/leverTemplate';

/**
 * Shown only in Item mode, and only while the picked block is a lever — same "no real neighbors to
 * infer state from" reasoning ConnectionToggle/RailShapeToggle exist for. Structure mode
 * deliberately has no such control: a structure's levers keep the real `powered` value its file
 * saved.
 */
export function LeverPoweredToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'item') return null;
  if (state.selectedItemName === null || !isLever(state.selectedItemName)) return null;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Powered</span>
      <div
        role="radiogroup"
        aria-label="Powered"
        className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {[
          { value: false, label: 'Off' },
          { value: true, label: 'On' },
        ].map((opt) => {
          const active = state.leverPowered === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && dispatch({ type: 'LEVER_POWERED_CHANGED', leverPowered: opt.value })}
              className={`relative rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
                active
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.55)]'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
