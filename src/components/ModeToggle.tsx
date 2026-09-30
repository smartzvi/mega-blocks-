import { useAppDispatch, useAppState, type AppMode } from '../state/AppContext';

const MODE_OPTIONS: { value: AppMode; label: string }[] = [
  { value: 'block', label: 'Blocks' },
  { value: 'item', label: 'Items' },
  { value: 'structure', label: 'Structures' },
  { value: 'mobs', label: 'Mobs' },
  { value: 'trees', label: 'Trees' },
];

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
