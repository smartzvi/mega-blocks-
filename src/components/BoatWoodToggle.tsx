import { useAppDispatch, useAppState } from '../state/AppContext';
import { BOAT_WOODS } from '../lib/models/boatTemplates';

/** Shown only in Mobs mode while the boat is picked — the wood picks which real `entity/boat/<wood>`
 *  texture the hull is made from (and which plank family the voxels are drawn from). */
export function BoatWoodToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'mobs' || state.selectedMobName !== 'boat') return null;

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Wood</span>
      <div
        role="radiogroup"
        aria-label="Boat wood"
        className="inline-flex flex-wrap justify-center gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-1 shadow-inner shadow-black/20"
      >
        {BOAT_WOODS.map((wood) => {
          const active = state.boatWood === wood;
          return (
            <button
              key={wood}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => !active && dispatch({ type: 'BOAT_WOOD_CHANGED', boatWood: wood })}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition-all duration-200 ${
                active
                  ? 'bg-emerald-500 text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.55)]'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {wood.replace('_', ' ')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
