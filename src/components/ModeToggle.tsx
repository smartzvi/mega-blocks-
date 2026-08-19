import { useAppDispatch, useAppState, type AppMode } from '../state/AppContext';

const OPTIONS: { value: AppMode; label: string }[] = [
  { value: 'block', label: 'Blocks' },
  { value: 'item', label: 'Items (beta)' },
  { value: 'structure', label: 'Structures (beta)' },
  { value: 'mobs', label: 'Mobs (beta)' },
];

export function ModeToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready') return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Generator mode"
        className="inline-flex gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {OPTIONS.map((opt) => {
          const active = state.mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && dispatch({ type: 'MODE_CHANGED', mode: opt.value })}
              className={`relative rounded-full px-5 py-1.5 text-sm font-semibold transition-all duration-200 ${
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
