import { useAppDispatch, useAppState, type Resolution } from '../state/AppContext';
import { SegmentedControl } from './ui/SegmentedControl';

const OPTIONS: { value: Resolution; label: string }[] = [
  { value: 16, label: '16³' },
  { value: 32, label: '32³' },
  { value: 48, label: '48³' },
  { value: 64, label: '64³' },
];

export function ResolutionToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready') return null;

  return (
    <SegmentedControl
      label="Resolution"
      options={OPTIONS.map((o) => ({ ...o, label: <span className="font-mono">{o.label}</span> }))}
      value={state.resolution}
      onChange={(resolution) => dispatch({ type: 'RESOLUTION_CHANGED', resolution })}
    />
  );
}
