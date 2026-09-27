import { useAppDispatch, useAppState } from '../state/AppContext';
import type { BlockShape } from '../types/minecraft';
import { SegmentedControl } from './ui/SegmentedControl';

const OPTIONS: { value: BlockShape; label: string }[] = [
  { value: 'full_cube', label: 'Full cube' },
  { value: 'slab', label: 'Slab' },
  { value: 'stair', label: 'Stair' },
  { value: 'door', label: 'Door' },
];

export function ShapeSelector() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (!state.matchedFaces) return null;

  return (
    <SegmentedControl
      label="Shape"
      options={OPTIONS}
      value={state.shape}
      onChange={(shape) => dispatch({ type: 'SHAPE_CHANGED', shape })}
    />
  );
}
