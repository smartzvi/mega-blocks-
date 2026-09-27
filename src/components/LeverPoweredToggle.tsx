import { useAppDispatch, useAppState } from '../state/AppContext';
import { isLever } from '../lib/models/leverTemplate';
import { SegmentedControl } from './ui/SegmentedControl';

/**
 * Shown only in Item mode, and only while the picked block is a lever — same "no real neighbors to
 * infer state from" reasoning ConnectionToggle/RailShapeToggle exist for. Structure mode
 * deliberately has no such control: a structure's levers keep the real `powered` value its file
 * saved.
 */
export function LeverPoweredToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'item') return null;
  if (state.selectedItemName === null || !isLever(state.selectedItemName)) return null;

  return (
    <SegmentedControl
      label="Powered"
      options={[
        { value: false, label: 'Off' },
        { value: true, label: 'On' },
      ]}
      value={state.leverPowered}
      onChange={(leverPowered) => dispatch({ type: 'LEVER_POWERED_CHANGED', leverPowered })}
    />
  );
}
