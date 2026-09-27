import type { ReactNode } from 'react';

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  title?: string;
}

/**
 * A labelled row holding one pick-one control: a mono uppercase label on the left, the squared
 * segments on the right (stacked under the label on narrow screens), an optional hint below.
 * Presentational only — the caller owns the value and the dispatch.
 */
export function SegmentedControl<T extends string | number | boolean>({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="shrink-0 pt-[7px] font-mono text-[11px] uppercase tracking-[0.08em] text-faint sm:w-28">{label}</span>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div role="radiogroup" aria-label={label} className="inline-flex w-fit max-w-full flex-wrap rounded-control border border-line bg-canvas p-0.5">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                role="radio"
                aria-checked={active}
                title={opt.title}
                onClick={() => !active && onChange(opt.value)}
                className={`rounded-[4px] px-3 py-1 text-[13px] font-medium transition-colors ${
                  active ? 'bg-raised text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)]' : 'text-muted hover:text-fg'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
    </div>
  );
}
