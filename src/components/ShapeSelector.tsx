import { useAppDispatch, useAppState } from '../state/AppContext';
import type { BlockShape } from '../types/minecraft';

const OPTIONS: { value: BlockShape; label: string }[] = [
  { value: 'full_cube', label: 'Full Cube' },
  { value: 'slab', label: 'Slab' },
  { value: 'stair', label: 'Stair' },
  { value: 'door', label: 'Door' },
];

export function ShapeSelector() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (!state.matchedFaces) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Block shape</span>
      <div
        role="radiogroup"
        aria-label="Block shape"
        className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {OPTIONS.map((opt) => {
          const active = state.shape === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && dispatch({ type: 'SHAPE_CHANGED', shape: opt.value })}
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
