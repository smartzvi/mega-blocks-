import { useAppDispatch, useAppState } from '../state/AppContext';
import { SegmentedControl } from './ui/SegmentedControl';

/** Trees mode: a full canopy of leaf blocks, or just its outside skin around the trunk. */
export function HollowLeavesToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'trees') return null;

  return (
    <SegmentedControl
      label="Leaves"
      options={[
        { value: false, label: 'Solid', title: 'The whole canopy is made of leaf blocks' },
        { value: true, label: 'Hollow', title: 'Only the outside skin of leaves; nothing inside' },
      ]}
      value={state.hollowLeaves}
      onChange={(hollowLeaves) => dispatch({ type: 'HOLLOW_LEAVES_CHANGED', hollowLeaves })}
    />
  );
}
