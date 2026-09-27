import { useAppDispatch, useAppState } from '../state/AppContext';
import type { ConnectionMode } from '../types/minecraft';
import { connectionFamily } from '../lib/models/itemConnections';
import { SegmentedControl } from './ui/SegmentedControl';

const OPTIONS: { value: ConnectionMode; label: string; hint: string }[] = [
  { value: 'stored', label: 'Default', hint: 'The block as it comes, with no connections.' },
  { value: 'all', label: 'All connected', hint: 'Every side connected.' },
  { value: 'none', label: 'Isolated', hint: 'Every side open.' },
];

/**
 * Shown only in Item mode, and only while the picked block is itself a fence, glass pane, bars,
 * wall or redstone wire — the blocks whose shape depends on neighbors an item doesn't have.
 * Structure mode deliberately has no such control: a structure's blocks keep the connections its
 * file saved.
 */
export function ConnectionToggle() {
  const state = useAppState();
  const dispatch = useAppDispatch();

  if (state.status !== 'ready' || state.mode !== 'item') return null;
  if (state.selectedItemName === null || connectionFamily(state.selectedItemName) === null) return null;

  const hint = OPTIONS.find((o) => o.value === state.connectionMode)?.hint;

  return (
    <SegmentedControl
      label="Connections"
      options={OPTIONS.map((o) => ({ value: o.value, label: o.label, title: o.hint }))}
      value={state.connectionMode}
      onChange={(connectionMode) => dispatch({ type: 'CONNECTION_MODE_CHANGED', connectionMode })}
      hint={hint}
    />
  );
}
