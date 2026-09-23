import { useAppDispatch, useAppState } from '../state/AppContext';
import type { RailShape } from '../types/minecraft';
import { isRailFamily } from '../lib/models/railTemplates';

// One representative shape per visually-distinct case, not all 10 real ones: east_west looks
// identical to north_south here (both a full flat plane — see railTemplates.ts's own doc on why
// the tie-pattern's own rotation is skipped), and the 4 curves are likewise all the same shape
// with the same real corner texture, just facing a different corner — so per explicit feedback,
// north_south/south_east stand in for their whole group, and only the two "ascending, tilted
// toward you" ends (north/south) are offered, not east/west.
const OPTIONS: { value: RailShape; label: string; hint: string }[] = [
  { value: 'north_south', label: 'Straight', hint: 'A straight section.' },
  { value: 'south_east', label: 'Curve', hint: 'A curved section.' },
  { value: 'ascending_north', label: '↑ N', hint: 'Ascending, climbing to the north.' },
  { value: 'ascending_south', label: '↑ S', hint: 'Ascending, climbing to the south.' },
];

/**
 * Shown only in Item mode, and only while the picked block is a rail, powered rail, detector rail
 * or activator rail — same reasoning ConnectionToggle exists for fences/panes/walls/wire: an item
 * has no real neighbors to infer a shape from, so this lets the user pick a shape directly (see
 * lib/models/railTemplates.ts). Structure mode deliberately has no such control: a structure's
 * rails keep the shape its file saved.
 */
export function RailShapeToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'item') return null;
  if (state.selectedItemName === null || !isRailFamily(state.selectedItemName)) return null;

  const hint = OPTIONS.find((o) => o.value === state.railShape)?.hint;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Rail shape</span>
      <div
        role="radiogroup"
        aria-label="Rail shape"
        className="inline-flex flex-wrap justify-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {OPTIONS.map((opt) => {
          const active = state.railShape === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={opt.hint}
              onClick={() => !active && dispatch({ type: 'RAIL_SHAPE_CHANGED', railShape: opt.value })}
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
