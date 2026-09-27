import { useAppDispatch, useAppState } from '../state/AppContext';
import { BOAT_WOODS } from '../lib/models/boatTemplates';
import { SegmentedControl } from './ui/SegmentedControl';

/** Shown only in Mobs mode while the boat is picked — the wood picks which real `entity/boat/<wood>`
 *  texture the hull is made from (and which plank family the voxels are drawn from). */
export function BoatWoodToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'mobs' || state.selectedMobName !== 'boat') return null;

  return (
    <SegmentedControl
      label="Wood"
      options={BOAT_WOODS.map((wood) => ({ value: wood, label: <span className="capitalize">{wood.replace('_', ' ')}</span> }))}
      value={state.boatWood}
      onChange={(boatWood) => dispatch({ type: 'BOAT_WOOD_CHANGED', boatWood })}
    />
  );
}
