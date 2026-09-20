import { useAppDispatch, useAppState } from '../state/AppContext';
import type { ConnectionMode } from '../types/minecraft';

type Option = { value: ConnectionMode; label: string; hint: string };

// Item mode has no neighboring blocks, so "auto" would be identical to the default there and is
// left out; Structure mode gets all four.
const ITEM_OPTIONS: Option[] = [
  { value: 'stored', label: 'Default', hint: 'The block as it comes, with no connections.' },
  { value: 'all', label: 'All connected', hint: 'Every side connected.' },
  { value: 'none', label: 'Isolated', hint: 'Every side open.' },
];

const STRUCTURE_OPTIONS: Option[] = [
  { value: 'stored', label: 'As built', hint: "Keep each block's connections exactly as the structure file saved them." },
  { value: 'auto', label: 'Auto-connect', hint: 'Recompute fences, panes, bars and walls from their neighbors. Redstone wire keeps its saved connections.' },
  { value: 'all', label: 'All connected', hint: 'Force every fence, pane, bar, wall and wire side connected.' },
  { value: 'none', label: 'Isolated', hint: 'Force every side open.' },
];

export function ConnectionToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || (state.mode !== 'item' && state.mode !== 'structure')) return null;

  const options = state.mode === 'item' ? ITEM_OPTIONS : STRUCTURE_OPTIONS;
  // "Auto" only exists in Structure mode; switching to Item mode while it's selected behaves as the default.
  const current = state.mode === 'item' && state.connectionMode === 'auto' ? 'stored' : state.connectionMode;
  const hint = options.find((o) => o.value === current)?.hint;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Fence / pane / wall connections</span>
      <div
        role="radiogroup"
        aria-label="Connections"
        className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {options.map((opt) => {
          const active = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.hint}
              onClick={() => !active && dispatch({ type: 'CONNECTION_MODE_CHANGED', connectionMode: opt.value })}
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
      {hint && <p className="max-w-md text-center text-xs text-slate-600">{hint}</p>}
    </div>
  );
}
