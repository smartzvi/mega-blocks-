import type { ConnectionMode, VoxelGrid } from '../../types/minecraft';
import { decodeBlockstateKey, encodeBlockstateKey } from './blockstateKey';
import { forEachVoxel, getVoxel, setVoxel } from '../voxel/voxelGrid';

export type ConnectionFamily = 'fence' | 'pane' | 'wall' | 'wire';

type Direction = 'north' | 'east' | 'south' | 'west';
const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

// Same axes the game uses: north is -Z, south is +Z, west is -X, east is +X.
const OFFSET: Record<Direction, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  west: [-1, 0],
  east: [1, 0],
};
const OPPOSITE: Record<Direction, Direction> = { north: 'south', south: 'north', east: 'west', west: 'east' };

function bareName(key: string): string {
  return decodeBlockstateKey(key).name.replace(/^minecraft:/, '');
}

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
 * "side". Used directly by Item mode (no neighbors exist there) and by Structure mode's `all`/
 * `none` overrides.
 */
export function forcedConnectionProperties(family: ConnectionFamily, mode: 'all' | 'none'): Record<string, string> {
  const connected = mode === 'all';
  const value = { fence: connected ? 'true' : 'false', pane: connected ? 'true' : 'false', wall: connected ? 'low' : 'none', wire: connected ? 'side' : 'none' }[family];
  const props: Record<string, string> = { north: value, east: value, south: value, west: value };
  if (family === 'wall') props.up = 'true';
  return props;
}

/** Item mode has no real block instance, so the only connection choices are the two forced ones;
 *  everything else keeps the block's bare default (returned as undefined). */
export function itemConnectionProperties(itemName: string, mode: ConnectionMode): Record<string, string> | undefined {
  const family = connectionFamily(itemName);
  if (!family || (mode !== 'all' && mode !== 'none')) return undefined;
  return forcedConnectionProperties(family, mode);
}

// --- "sturdy" neighbors ---------------------------------------------------------------------
// The game connects a fence/pane/wall to a neighbor whose face toward it is a full square. Real
// collision shapes aren't available offline, so this approximates by name: a deny-list of blocks
// that are thin, partial, or plants, checked against the game's own saved properties across every
// bundled structure (see connections.test.ts). Everything not listed counts as a full block.
const NOT_STURDY_EXACT = new Set([
  'snow', 'grass', 'fern', 'bush', 'vine', 'lever', 'string', 'lily_pad', 'cobweb', 'fire', 'water', 'lava',
  'poppy', 'dandelion', 'allium', 'azure_bluet', 'cornflower', 'lilac', 'peony', 'wheat', 'carrots', 'potatoes',
  'beetroots', 'melon_stem', 'pumpkin_stem', 'attached_melon_stem', 'attached_pumpkin_stem', 'cocoa',
  'sugar_cane', 'bamboo', 'bamboo_sapling', 'cactus', 'dead_bush', 'kelp', 'kelp_plant', 'seagrass',
  'tall_seagrass', 'nether_wart', 'sweet_berry_bush', 'torchflower', 'torchflower_crop', 'pitcher_plant',
  'pitcher_crop', 'lily_of_the_valley', 'wither_rose', 'oxeye_daisy', 'sunflower', 'rose_bush', 'small_dripleaf',
  'big_dripleaf', 'big_dripleaf_stem', 'hanging_roots', 'glow_lichen', 'sculk_vein', 'frogspawn', 'bell',
  'lectern', 'hopper', 'anvil', 'chipped_anvil', 'damaged_anvil', 'brewing_stand', 'enchanting_table',
  'end_rod', 'lightning_rod', 'scaffolding', 'campfire', 'soul_campfire', 'composter', 'grindstone', 'stonecutter',
  'conduit', 'lantern', 'soul_lantern', 'chain', 'iron_chain', 'pointed_dripstone', 'amethyst_cluster',
  'powder_snow', 'nether_portal', 'end_portal', 'end_gateway', 'ladder', 'redstone_wire', 'daylight_detector',
  'cake', 'sea_pickle', 'turtle_egg', 'sniffer_egg', 'dragon_egg', 'decorated_pot', 'flower_pot',
]);
const NOT_STURDY_SUBSTRING = [
  'door', 'fence', 'wall', 'pane', 'bars', 'torch', 'sign', 'banner', 'button', 'pressure_plate', 'carpet',
  'rail', 'sapling', 'tulip', 'orchid', 'mushroom', 'fungus', 'repeater', 'comparator', 'tripwire', 'candle',
  'skull', 'head', '_bed', 'chest', 'cauldron', 'petals', 'roots', 'sprouts', 'azalea', 'leaf_litter', 'propagule',
  'potted_', 'dripleaf', 'sculk_sensor', 'sculk_shrieker', 'fern', 'flowering', 'short_grass', 'tall_grass',
  'lantern', 'stairs', 'slab', 'gate',
];

/** The blocks the game refuses to connect to even though they're full cubes (its
 *  `isExceptionForConnection`). */
const CONNECTION_EXCEPTIONS = ['leaves', 'barrier', 'pumpkin', 'jack_o_lantern', 'melon', 'shulker_box'];

function isFullBlockName(name: string): boolean {
  if (name === 'sea_lantern' || name === 'chain_command_block') return true;
  if (CONNECTION_EXCEPTIONS.some((p) => name.includes(p))) return false;
  if (name.includes('coral') && !name.includes('coral_block')) return false;
  if (name.endsWith('_bud') || name.endsWith('_cluster')) return false;
  if (NOT_STURDY_EXACT.has(name)) return false;
  return !NOT_STURDY_SUBSTRING.some((p) => name.includes(p));
}

/** Whether a fence/pane/wall in direction `d` from the neighbor's point of view connects to
 *  `neighborKey`: full blocks yes, plus the two partial blocks the saved data shows connecting —
 *  a straight stair whose back face (its `facing` side) is toward us, and a double slab. */
function isSturdyToward(neighborKey: string | null, d: Direction): boolean {
  if (!neighborKey) return false;
  const { name, properties } = decodeBlockstateKey(neighborKey);
  const bare = name.replace(/^minecraft:/, '');
  if (bare.endsWith('_stairs')) return properties.shape === 'straight' && properties.facing === OPPOSITE[d];
  if (bare.endsWith('_slab')) return properties.type === 'double';
  return isFullBlockName(bare);
}

/** Whether a block above a wall covers the wall's post/sides from below (its bottom face is
 *  full): full blocks, bottom/double slabs, upright stairs, campfires and carpets. */
function coversFromBelow(key: string | null): boolean {
  if (!key) return false;
  const { name, properties } = decodeBlockstateKey(key);
  const bare = name.replace(/^minecraft:/, '');
  if (bare.endsWith('_slab')) return properties.type !== 'top';
  if (bare.endsWith('_stairs')) return properties.half === 'bottom';
  if (bare === 'campfire' || bare === 'soul_campfire' || bare.endsWith('carpet')) return true;
  return isFullBlockName(bare);
}

function isWoodenFence(name: string): boolean {
  return name !== 'nether_brick_fence';
}

/** A fence gate joins a fence or wall only when the gate's opening axis is perpendicular to the
 *  direction of the connection (vanilla `FenceGateBlock.connectedDirection`). */
function gateConnects(neighborKey: string, direction: Direction): boolean {
  const { name, properties } = decodeBlockstateKey(neighborKey);
  if (!name.endsWith('_fence_gate')) return false;
  const facing = properties.facing;
  if (!facing) return false;
  const facingAxisIsX = facing === 'east' || facing === 'west';
  const directionAxisIsX = direction === 'east' || direction === 'west';
  return facingAxisIsX !== directionAxisIsX;
}

// Connection targets, per the game's own saved properties across every bundled structure:
// fences join same-kind fences, gates and full blocks (never walls); panes/bars join other
// panes/bars and full blocks (never walls or gates); walls join walls, gates and full blocks
// (never fences or panes).
function connects(family: ConnectionFamily, selfName: string, neighborKey: string | null, direction: Direction): boolean {
  if (!neighborKey) return false;
  const neighborName = bareName(neighborKey);
  const neighborFamily = connectionFamily(neighborName);

  if (family === 'fence') {
    if (neighborFamily === 'fence') return isWoodenFence(neighborName) === isWoodenFence(selfName);
    return gateConnects(neighborKey, direction) || isSturdyToward(neighborKey, direction);
  }
  if (family === 'pane') {
    if (neighborFamily === 'pane') return true;
    return isSturdyToward(neighborKey, direction);
  }
  if (neighborFamily === 'wall') return true;
  return gateConnects(neighborKey, direction) || isSturdyToward(neighborKey, direction);
}

function neighborAt(grid: VoxelGrid, x: number, y: number, z: number, direction: Direction): string | null {
  const [dx, dz] = OFFSET[direction];
  return getVoxel(grid, x + dx, y, z + dz);
}

function computeFencePane(grid: VoxelGrid, family: 'fence' | 'pane', selfName: string, x: number, y: number, z: number): Record<string, string> {
  const props: Record<string, string> = {};
  for (const d of DIRECTIONS) props[d] = connects(family, selfName, neighborAt(grid, x, y, z, d), d) ? 'true' : 'false';
  return props;
}

/** Blocks that sit in the middle of the cell above a wall and poke into its post without covering
 *  it — the saved data shows a straight wall raising its post under a torch or a potted plant. */
function isPartialCenterBlock(key: string | null): boolean {
  if (!key) return false;
  const name = bareName(key);
  return name.includes('torch') || name.startsWith('potted_') || name === 'flower_pot' || name.includes('candle') || name.includes('skull') || name.includes('head');
}

/**
 * Wall connections, fitted to the game's saved data across every bundled structure (~92% of wall
 * cells reproduce exactly; the rest are mostly stale states the game never refreshed). A connected
 * side is `tall` when the block above covers it from below (a full block, bottom slab, upright
 * stair, campfire, carpet) or the wall above is itself tall on that side — a low arm above does
 * not raise it — otherwise `low`. The center post (`up`) is raised when nothing connects or the
 * opposite sides differ (ends, corners, T-junctions); a straight run or a full cross has none,
 * unless a raised wall or a torch/pot-style block sits above. A solid block above does NOT force
 * it. An approximation of the game's shape tests, not a copy of them.
 */
function computeWall(grid: VoxelGrid, selfName: string, x: number, y: number, z: number): Record<string, string> {
  const above = getVoxel(grid, x, y + 1, z);
  const aboveIsWall = above !== null && connectionFamily(bareName(above)) === 'wall';
  const aboveCovers = above !== null && !aboveIsWall && coversFromBelow(above);
  const aboveProps = above !== null && aboveIsWall ? decodeBlockstateKey(above).properties : null;

  const sides: Record<string, string> = {};
  const connected: Record<string, boolean> = {};
  for (const d of DIRECTIONS) {
    const isConnected = connects('wall', selfName, neighborAt(grid, x, y, z, d), d);
    connected[d] = isConnected;
    sides[d] = !isConnected ? 'none' : aboveCovers || aboveProps?.[d] === 'tall' ? 'tall' : 'low';
  }

  const allNone = !connected.north && !connected.east && !connected.south && !connected.west;
  const basePost = allNone || connected.north !== connected.south || connected.east !== connected.west;
  const up = basePost || aboveProps?.up === 'true' || isPartialCenterBlock(above);
  return { ...sides, up: up ? 'true' : 'false' };
}

function recompute(grid: VoxelGrid, family: ConnectionFamily, selfName: string, x: number, y: number, z: number): Record<string, string> | null {
  if (family === 'fence' || family === 'pane') return computeFencePane(grid, family, selfName, x, y, z);
  if (family === 'wall') return computeWall(grid, selfName, x, y, z);
  return null; // redstone wire's connection rules are too involved to guess; keep the saved ones
}

/**
 * Rewrites the connection properties of every fence, pane/bars, wall and redstone wire in a parsed
 * structure per `mode`, then registers any new blockstate keys in `blockIds` (buildStructureVoxelGrid
 * voxelizes each unique key once). Runs on the raw source grid, before interior culling, so
 * neighbors are judged against real blocks. `stored` does nothing; `all`/`none` force every side;
 * `auto` recomputes fences, panes/bars and walls from their neighbors and leaves redstone wire
 * as saved.
 */
export function applyConnectionMode(grid: VoxelGrid, blockIds: Set<string>, mode: ConnectionMode): void {
  if (mode === 'stored') return;

  const updates: Array<[number, number, number, string]> = [];
  forEachVoxel(grid, (x, y, z, key) => {
    const { name, properties } = decodeBlockstateKey(key);
    const family = connectionFamily(name);
    if (!family) return;

    const bare = name.replace(/^minecraft:/, '');
    const next = mode === 'auto' ? recompute(grid, family, bare, x, y, z) : forcedConnectionProperties(family, mode);
    if (!next) return;

    const newKey = encodeBlockstateKey(name, { ...properties, ...next });
    if (newKey !== key) updates.push([x, y, z, newKey]);
  });

  for (const [x, y, z, newKey] of updates) {
    setVoxel(grid, x, y, z, newKey);
    blockIds.add(newKey);
  }
}
