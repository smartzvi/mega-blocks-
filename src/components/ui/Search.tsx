import type { ReactNode } from 'react';

/** The pickers' search box. Presentational only — each picker keeps its own query/filter logic. */
export function SearchField({
  value,
  placeholder,
  onChange,
  onFocus,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  return (
    <div className="relative">
      <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-control border border-line bg-canvas py-2 pl-9 pr-3 text-sm text-fg placeholder-faint outline-none transition-colors hover:border-line-strong focus:border-accent/60 focus:ring-2 focus:ring-accent/15"
      />
    </div>
  );
}

/** The dropdown under a SearchField. */
export function ResultList({ children }: { children: ReactNode }) {
  return (
    <ul className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-panel border border-line-strong bg-raised p-1 shadow-xl shadow-black/60">
      {children}
    </ul>
  );
}

export function ResultItem({ selected, onClick, icon, children }: { selected: boolean; onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-left font-mono text-[13px] transition-colors ${
          selected ? 'bg-accent-dim text-accent' : 'text-muted hover:bg-hover hover:text-fg'
        }`}
      >
        {icon}
        <span className="truncate">{children}</span>
      </button>
    </li>
  );
}

export function ResultNote({ children }: { children: ReactNode }) {
  return <li className="px-2.5 py-2 text-xs text-faint">{children}</li>;
}

/** "Building / Built  <name>" under a picker. */
export function BuildStatus({ building, name, icon }: { building: boolean; name: string; icon?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
        <span className={`h-1.5 w-1.5 rounded-[1px] ${building ? 'animate-pulse bg-muted' : 'bg-accent'}`} />
        {building ? 'Building' : 'Built'}
      </span>
      <span className="flex min-w-0 items-center gap-2 rounded-control border border-line bg-raised px-2 py-1 font-mono text-[13px] text-fg">
        {icon}
        <span className="truncate">{name}</span>
      </span>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-control border border-danger/30 bg-danger-dim px-3 py-2 text-xs text-danger">{children}</p>;
}
