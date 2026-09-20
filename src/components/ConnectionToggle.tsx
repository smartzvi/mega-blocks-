import { useAppDispatch, useAppState } from '../state/AppContext';
import type { ConnectionMode } from '../types/minecraft';
import { connectionFamily } from '../lib/models/itemConnections';

const OPTIONS: { value: ConnectionMode; label: string; hint: string }[] = [
  { value: 'stored', label: 'Default', hint: 'The block as it comes, with no connections.' },
  { value: 'all', label: 'All connected', hint: 'Every side connected.' },
  { value: 'none', label: 'Isolated', hint: 'Every side open.' },
];

/**
 * Shown only in Item mode, and only while the picked block is itself a fence, glass pane, bars,
 * wall or redstone wire — the blocks whose shape depends on neighbors an item doesn't have.
 * Structure mode deliberately has no such control: a structure's blocks keep the connections its
 * file saved.
 */
export function ConnectionToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'item') return null;
  if (state.selectedItemName === null || connectionFamily(state.selectedItemName) === null) return null;

  const hint = OPTIONS.find((o) => o.value === state.connectionMode)?.hint;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Connections</span>
      <div
        role="radiogroup"
        aria-label="Connections"
        className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {OPTIONS.map((opt) => {
          const active = state.connectionMode === opt.value;
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
