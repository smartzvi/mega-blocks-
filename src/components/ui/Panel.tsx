import type { ReactNode } from 'react';

/** A bordered surface card. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`w-full overflow-hidden rounded-panel border border-line bg-panel ${className}`}>{children}</section>;
}

/** A panel's title bar: mono uppercase label on the left, anything on the right. */
export function SectionHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-2">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{title}</h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** A quiet bordered button for secondary actions. */
export function QuietButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-control border border-line bg-raised px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-line-strong hover:text-fg disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** A pick-one grid of buttons (mobs, trees) — for short, fixed lists that don't need a search. */
export function ChipGrid<T extends string>({ items, selected, onSelect }: { items: readonly T[]; selected: T | null; onSelect: (item: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active = item === selected;
        return (
          <button
            key={item}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(item)}
            className={`rounded-control border px-3 py-1.5 text-[13px] font-medium capitalize transition-colors ${
              active ? 'border-accent/50 bg-accent-dim text-accent' : 'border-line bg-canvas text-muted hover:border-line-strong hover:text-fg'
            }`}
          >
            {item}
          </button>
        );
      })}
    </div>
  );
}
