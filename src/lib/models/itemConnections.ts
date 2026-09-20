import type { ConnectionMode } from '../../types/minecraft';

export type ConnectionFamily = 'fence' | 'pane' | 'wall' | 'wire';

/** Which connecting family a block belongs to: fences, glass panes / iron & copper bars, walls, and
 *  redstone wire — the multipart blocks whose shape depends on their neighbors. Null for
 *  everything else (fence gates and wall signs included). */
export function connectionFamily(name: string): ConnectionFamily | null {
  const bare = name.replace(/^minecraft:/, '').split('[')[0];
  if (bare === 'redstone_wire') return 'wire';
  if (bare.endsWith('_fence')) return 'fence';
  if (bare.endsWith('glass_pane') || bare.endsWith('_bars') || bare === 'iron_bars') return 'pane';
  if (bare.endsWith('_wall')) return 'wall';
  return null;
}

/**
 * The properties a family gets when every side is forced open or closed. Fences and panes/bars use
 * "true"/"false" per side; walls use "none"/"low" per side plus an `up` post; wire uses "none"/
 * "side".
 */
export function forcedConnectionProperties(family: ConnectionFamily, mode: 'all' | 'none'): Record<string, string> {
  const connected = mode === 'all';
  const value = { fence: connected ? 'true' : 'false', pane: connected ? 'true' : 'false', wall: connected ? 'low' : 'none', wire: connected ? 'side' : 'none' }[family];
  const props: Record<string, string> = { north: value, east: value, south: value, west: value };
  if (family === 'wall') props.up = 'true';
  return props;
}

/**
 * Item mode picks a bare block with no neighbors, so the only connection choices are the two forced
 * ones; anything else keeps the block's bare default (returned as undefined). Structure mode has no
 * such control on purpose — a structure's blocks always keep the connections the file saved.
 */
export function itemConnectionProperties(itemName: string, mode: ConnectionMode): Record<string, string> | undefined {
  const family = connectionFamily(itemName);
  if (!family || (mode !== 'all' && mode !== 'none')) return undefined;
  return forcedConnectionProperties(family, mode);
}
