import type { YRotation } from '../models/rotateElement';

export interface BlockStateModelRef {
  model: string; // e.g. "minecraft:block/oak_fence_post"
  x: YRotation;
  y: YRotation;
}

interface RawApply {
  model: string;
  x?: number;
  y?: number;
}

type RawApplyValue = RawApply | RawApply[];

interface RawBlockState {
  variants?: Record<string, RawApplyValue>;
  multipart?: Array<{ when?: unknown; apply: RawApplyValue }>;
}

function normalizeRotation(degrees: unknown): YRotation {
  return degrees === 90 || degrees === 180 || degrees === 270 ? degrees : 0;
}

function firstApply(value: RawApplyValue): RawApply {
  return Array.isArray(value) ? value[0] : value;
}

/** Deterministic default variant pick: prefer the property-less key (e.g. cauldron's ""), then
 *  a key that reads as the canonical "facing=north" orientation, else alphabetically first — so
 *  the same block always voxelizes to the same result. Used when no real per-instance properties
 *  are known (item mode, picking one representative orientation for a bare block name). */
function pickVariantKey(variants: Record<string, RawApplyValue>): string {
  const keys = Object.keys(variants);
  if (keys.includes('')) return '';
  const northKey = keys.find((k) => k.includes('facing=north'));
  if (northKey) return northKey;
  return [...keys].sort()[0];
}

function parseVariantKey(key: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (key === '') return props;
  for (const pair of key.split(',')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    props[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return props;
}

/**
 * Picks the variant key that actually matches a real block instance's known properties — e.g. a
 * structure's stored `facing=east,half=bottom,shape=straight` for a stair, `half=lower,hinge=left`
 * for a door half, `axis=x` for a log. A vanilla variant key only ever lists the properties that
 * affect the model (never e.g. `waterlogged`, which changes nothing visually), so this checks each
 * variant key as a *subset* match — every property the key mentions must equal the corresponding
 * known value — rather than requiring every known property to appear in the key. Real vanilla
 * blockstates partition their variants to be mutually exclusive over the properties they mention,
 * so exactly one match is expected; if more than one somehow matches (a malformed or unusual
 * blockstate), the most specific one (most properties pinned) wins so a partial/wildcard-like key
 * never shadows a fully-specific one. Returns null if nothing matches at all, so the caller can
 * fall back to the property-less default pick instead of guessing wrong.
 */
function pickVariantKeyForProperties(variants: Record<string, RawApplyValue>, properties: Record<string, string>): string | null {
  const keys = Object.keys(variants);
  const matches = keys.filter((key) => {
    const keyProps = parseVariantKey(key);
    return Object.entries(keyProps).every(([k, v]) => properties[k] === v);
  });
  if (matches.length === 0) return null;
  matches.sort((a, b) => Object.keys(parseVariantKey(b)).length - Object.keys(parseVariantKey(a)).length);
  return matches[0];
}

/** Whether a value in a multipart `when` clause matches a real property value. Vanilla writes
 *  alternatives as "a|b" (e.g. a wall's `"north": "low|tall"`), and JSON files occasionally use a
 *  bare boolean/number instead of a string, so both sides are compared as strings. */
function whenValueMatches(expected: unknown, actual: string | undefined): boolean {
  if (actual === undefined) return false;
  return String(expected).split('|').includes(actual);
}

/**
 * Evaluates a real multipart `when` condition (the same grammar Minecraft's own blockstate
 * loader uses) against a block's known properties: a plain object means every listed property
 * must match (AND); `{ "OR": [...] }` / `{ "AND": [...] }` combine nested conditions. A property
 * the block doesn't carry never matches — including a `"false"` condition, since an unknown value
 * isn't evidence it's false — so a block with incomplete stored properties degrades toward "fewer
 * parts" (the pre-existing isolated look), never toward guessing extra ones.
 */
function whenMatches(when: unknown, properties: Record<string, string>): boolean {
  if (typeof when !== 'object' || when === null) return false;
  const clause = when as Record<string, unknown>;
  if (Array.isArray(clause.OR)) return clause.OR.some((sub) => whenMatches(sub, properties));
  if (Array.isArray(clause.AND)) return clause.AND.every((sub) => whenMatches(sub, properties));
  return Object.entries(clause).every(([key, expected]) => whenValueMatches(expected, properties[key]));
}

/**
 * Resolves a blockstate JSON (assets/minecraft/blockstates/<name>.json) into the model
 * reference(s) to voxelize. "variants" blocks (facing/powered/delay/... combinations) pick one
 * deterministic default combination. "multipart" blocks (fences, walls, panes — shape depends on
 * neighbor connections) prefer the unconditional ("when"-less) parts, i.e. whatever always
 * renders regardless of neighbors (a fence's center post, not its connector arms). Some blocks
 * (walls, redstone_wire, vine, mushroom blocks, chorus_plant, ...) gate EVERY part behind a
 * `when`, including what would normally be the "always visible" piece (a wall's own post is
 * itself conditioned on an `up` property) — for those, fall back to applying every part
 * regardless of its condition, i.e. the maximally-connected representation (a wall with its post
 * and all 4 arms, redstone wire's full cross), rather than refusing to render anything.
 *
 * `properties`, when given (structure mode, which knows each block's real stored Properties),
 * picks the variant that actually matches them instead of a generic default — this is what makes
 * a stair rotate to its real facing/shape and a door half render with its real hinge/open state.
 * Falls back to the property-less default pick if nothing matches (property-less item mode calls,
 * or a block whose stored properties don't cover what a variant key expects).
 *
 * For a multipart block, `properties` likewise evaluates every part's real `when` condition, so a
 * fence stored with `north=true,east=true` renders its post plus exactly those two arms (and a
 * wall its real post + low/tall arms) instead of always collapsing to the bare post. If no part at
 * all matches (nothing unconditional, and stored properties that satisfy no condition), the
 * property-less default above applies instead of returning an empty model.
 */
export function resolveBlockStateModelRefs(json: unknown, blockName: string, properties?: Record<string, string>): BlockStateModelRef[] {
  if (typeof json !== 'object' || json === null) {
    throw new Error(`Blockstate for "${blockName}" is not an object.`);
  }
  const raw = json as RawBlockState;

  if (raw.variants && Object.keys(raw.variants).length > 0) {
    const key = (properties && pickVariantKeyForProperties(raw.variants, properties)) ?? pickVariantKey(raw.variants);
    const apply = firstApply(raw.variants[key]);
    return [{ model: apply.model, x: normalizeRotation(apply.x), y: normalizeRotation(apply.y) }];
  }

  if (raw.multipart && raw.multipart.length > 0) {
    let matched = properties ? raw.multipart.filter((part) => part.when === undefined || whenMatches(part.when, properties)) : [];
    // A pane's glass texture is transparent in the middle, so its always-on center post shows
    // through a connected pane as a stray vertical bar — dropped whenever the pane has at least one
    // real arm. An isolated pane (no arms) keeps its post, since it's the only geometry there.
    if (/glass_pane$/.test(blockName) && matched.some((part) => firstApply(part.apply).model.includes('_pane_side'))) {
      matched = matched.filter((part) => !firstApply(part.apply).model.endsWith('_pane_post'));
    }
    const unconditional = raw.multipart.filter((part) => part.when === undefined);
    const parts = matched.length > 0 ? matched : unconditional.length > 0 ? unconditional : raw.multipart;
    return parts.map((part) => {
      const apply = firstApply(part.apply);
      return { model: apply.model, x: normalizeRotation(apply.x), y: normalizeRotation(apply.y) };
    });
  }

  throw new Error(`Blockstate for "${blockName}" has neither "variants" nor "multipart".`);
}

export interface TwoPartBlockRefs {
  lower: BlockStateModelRef;
  upper: BlockStateModelRef;
}

/**
 * Detects a vertically-stacked two-part block — a real door is exactly this: one blockstate
 * whose "variants" keys include a "half=lower"/"half=upper" property, otherwise identical (real
 * oak_door.json literally has "facing=east,half=lower,hinge=left,open=false" alongside
 * "facing=east,half=upper,hinge=left,open=false", etc.). When found, returns the matching
 * lower+upper model refs (same facing/hinge/open on both, only "half" differs) so the caller can
 * combine them into one genuinely 2-block-tall model. Returns null for anything else — "half" is
 * specific to variants-style blockstates; multipart blocks (fences, walls) use "parts" for a
 * completely different concept (neighbor connections, not vertical stacking).
 */
export function findTwoPartVariantKeys(json: unknown): TwoPartBlockRefs | null {
  if (typeof json !== 'object' || json === null) return null;
  const raw = json as RawBlockState;
  if (!raw.variants) return null;

  const keys = Object.keys(raw.variants);
  const lowerKeys = keys.filter((k) => k.includes('half=lower'));
  if (lowerKeys.length === 0) return null;

  const lowerKey = lowerKeys.find((k) => k.includes('facing=north')) ?? [...lowerKeys].sort()[0];
  const upperKey = lowerKey.replace('half=lower', 'half=upper');
  if (!raw.variants[upperKey]) return null;

  const lowerApply = firstApply(raw.variants[lowerKey]);
  const upperApply = firstApply(raw.variants[upperKey]);
  return {
    lower: { model: lowerApply.model, x: normalizeRotation(lowerApply.x), y: normalizeRotation(lowerApply.y) },
    upper: { model: upperApply.model, x: normalizeRotation(upperApply.x), y: normalizeRotation(upperApply.y) },
  };
}
