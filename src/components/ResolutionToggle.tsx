import { useAppDispatch, useAppState, type Resolution } from '../state/AppContext';

const OPTIONS: { value: Resolution; label: string }[] = [
  { value: 16, label: '16³' },
  { value: 32, label: '32³' },
  { value: 48, label: '48³' },
  { value: 64, label: '64³' },
];

export function ResolutionToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready') return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Megablock resolution</span>
      <div
        role="radiogroup"
        aria-label="Megablock resolution"
        className="inline-flex gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {OPTIONS.map((opt) => {
          const active = state.resolution === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && dispatch({ type: 'RESOLUTION_CHANGED', resolution: opt.value })}
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
