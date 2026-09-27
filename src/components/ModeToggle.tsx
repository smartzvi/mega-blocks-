import { useAppDispatch, useAppState, type AppMode } from '../state/AppContext';
import { Tag } from './ui/Panel';

const MODE_OPTIONS: { value: AppMode; label: string; beta: boolean }[] = [
  { value: 'block', label: 'Blocks', beta: false },
  { value: 'item', label: 'Items', beta: true },
  { value: 'structure', label: 'Structures', beta: true },
  { value: 'mobs', label: 'Mobs', beta: true },
  { value: 'trees', label: 'Trees', beta: true },
];

/** One BETA line at the top of the setup panel, in place of a "(beta)" on every tab. */
export function BetaNotice() {
  const state = useAppState();
  const mode = MODE_OPTIONS.find((m) => m.value === state.mode);
  if (!mode?.beta) return null;
  return (
    <div className="-mb-1 flex items-center gap-2">
      <Tag>Beta</Tag>
      <span className="text-xs text-faint">{mode.label} mode is still being refined.</span>
    </div>
  );
}

/** Underline tabs across the top of the setup panel. */
export function ModeToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready') return null;

  return (
    <div role="tablist" aria-label="Generator mode" className="flex overflow-x-auto overflow-y-hidden border-b border-line px-1.5 [scrollbar-width:none] sm:gap-1 sm:px-2">
      {MODE_OPTIONS.map((opt) => {
        const active = state.mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !active && dispatch({ type: 'MODE_CHANGED', mode: opt.value })}
            className={`relative shrink-0 px-2 py-3 text-[13px] font-medium transition-colors sm:px-3 sm:text-sm ${active ? 'text-fg' : 'text-muted hover:text-fg'}`}
          >
            {opt.label}
            <span className={`absolute inset-x-1.5 bottom-0 h-0.5 sm:inset-x-2 ${active ? 'bg-accent' : 'bg-transparent'}`} />
          </button>
        );
      })}
    </div>
  );
}
