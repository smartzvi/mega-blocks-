import type { MaterialFamily, TintName } from '../../types/minecraft';
import { detectTint } from './tint';

export interface FullCubeBlockDef {
  id: string; // e.g. 'minecraft:obsidian'
  textureBase: string; // key into extractTextures() output, e.g. 'obsidian'
  tint: TintName | null;
  family: MaterialFamily;
  /** Falls without solid support underneath in real Minecraft (sand, red sand). A megablock's
   *  "top" face always sits over a hollow interior, never anything that could support it, so
   *  matchAllFaces excludes these when matching the top face specifically — safe on the other 5
   *  faces, which (assuming the finished structure rests on the ground, the normal case) are
   *  either resting directly on the ground (bottom) or continuously backed by solid shell all
   *  the way down to it (the 4 walls). */
  gravityAffected?: boolean;
  /** Has a visually distinct end-grain/cross-section texture on its top and bottom faces (log
   *  rings, bamboo's cut cross-section) that reads as an obvious, out-of-place blotch when tiled
   *  across a flat megablock surface — its side (bark) texture is fine and stays fully eligible
   *  everywhere. matchAllFaces excludes these when matching the top *and* bottom faces. */
  endGrainTopBottom?: boolean;
  /** Real glass block (plain/stained/tinted) — per user feedback, glass only belongs in a build
   *  that's itself genuinely glass-related (a colored glass block, a beacon, an end crystal, ...);
   *  it shouldn't quietly become filler in an unrelated white/pale build (that's what was
   *  happening via sea_lantern before glass existed in this palette at all — see the comment on
   *  the light-sources section). `filterPaletteForSource` (glassSource.ts) strips every
   *  `glassOnly` entry out of the palette unless the selected source is itself glass-family. */
  glassOnly?: boolean;
  /** A real light-emitting block (glowstone, sea_lantern — the froglights were removed outright
   *  per explicit user request, see the light-sources section below). Unlike `glassOnly`,
   *  this isn't restricted to a specific source family — it's eligible everywhere by default, but
   *  gets excluded for specific sources it looks bad in via `filterLightSourcesForSource`
   *  (lightSourceExclusion.ts), the same way `shroomlight` was removed outright after clashing in
   *  a resin_block build — this is that same finding, generalized into a flag instead of an
   *  outright removal, since a light source can be a great match for one build and a bad one for
   *  another (diamond, confirmed against the real jar: light-source entries ate ~70% of a
   *  diamond_block build's pixels, drowning out the actual diamond blue). */
  lightSource?: boolean;
}

const DYE_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const;

const OVERWORLD_WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'] as const;

function block(
  name: string,
  family: MaterialFamily,
  flags?: Pick<FullCubeBlockDef, 'gravityAffected' | 'endGrainTopBottom' | 'glassOnly' | 'lightSource'> & {
    textureBase?: string;
  }
): FullCubeBlockDef {
  const { textureBase, ...rest } = flags ?? {};
  return { id: `minecraft:${name}`, textureBase: textureBase ?? name, tint: detectTint(name), family, ...rest };
}

function colorFamily(
  suffix: string,
  family: MaterialFamily,
  flags?: Pick<FullCubeBlockDef, 'gravityAffected' | 'endGrainTopBottom' | 'glassOnly'>
): FullCubeBlockDef[] {
  return DYE_COLORS.map((c) => block(`${c}${suffix}`, family, flags));
}

/**
 * Curated "filler block" palette, restricted to smooth, low-texture-noise, color-gradient-
 * friendly blocks (no ores, functional blocks, or directional-pattern blocks like glazed
 * terracotta). Within that constraint, every block is tagged with a MaterialFamily so the
 * matching engine (matchFace.ts) can apply hue-guard and family-affinity penalties — this is
 * what prevents e.g. a warm wood-toned pixel from being matched to an off-hue green wool just
 * because it happened to be marginally closer in raw Lab distance.
 */
export const FULL_CUBE_BLOCKS: FullCubeBlockDef[] = [
  // Simple polished stones — flat, low-noise grays/off-whites for neutral shading
  block('stone', 'stone_deepslate'), block('smooth_stone', 'stone_deepslate'),
  block('andesite', 'stone_deepslate'), block('polished_andesite', 'stone_deepslate'),
  block('granite', 'stone_deepslate'), block('polished_granite', 'stone_deepslate'),
  block('diorite', 'stone_deepslate'), block('polished_diorite', 'stone_deepslate'),

  // Deepslate — clean variants only. Cracked bricks/tiles and chiseled (a carved decorative
  // pattern, not a flat texture) are deliberately excluded — they read as damaged/odd rather
  // than a clean standard material when used as filler.
  block('deepslate', 'stone_deepslate'), block('cobbled_deepslate', 'stone_deepslate'),
  block('polished_deepslate', 'stone_deepslate'), block('deepslate_bricks', 'stone_deepslate'),
  block('deepslate_tiles', 'stone_deepslate'),

  // Tuff — clean variants only (chiseled excluded, same reasoning as deepslate above).
  block('tuff', 'stone_deepslate'), block('polished_tuff', 'stone_deepslate'),
  block('tuff_bricks', 'stone_deepslate'),

  // Dripstone
  block('dripstone_block', 'stone_deepslate'),

  // Terracotta — smooth, muted, color-gradient friendly
  block('terracotta', 'sand_clay'),
  ...colorFamily('_terracotta', 'sand_clay'),

  // Sand — sand/red_sand are real, gravity-affected blocks (see the `gravityAffected` doc on
  // FullCubeBlockDef); matchAllFaces keeps them off the shell's top face specifically rather
  // than excluding them from the palette outright, so most of a sand-colored build is still real
  // sand and only the unsupportable top cap falls back to sandstone/red_sandstone.
  block('sand', 'sand_clay', { gravityAffected: true }), block('red_sand', 'sand_clay', { gravityAffected: true }),
  block('sandstone', 'sand_clay'), block('red_sandstone', 'sand_clay'),

  // Wool — smooth, saturated, color-gradient friendly
  ...colorFamily('_wool', 'neutrals_concrete'),

  // Concrete — priority #1: flattest, most saturated, cleanest mosaic material
  ...colorFamily('_concrete', 'neutrals_concrete'),

  // Wood: every plank, log, and stripped log variant. Note: the bark-all-sides "_wood"/
  // "_hyphae" blocks (oak_wood, crimson_hyphae, etc.) are deliberately NOT included — modern
  // Minecraft doesn't ship a separate texture file for them at all; their model just reuses
  // the corresponding log/stem's side texture on all 6 faces (confirmed by inspecting the real
  // 1.21.8 client jar). They'd be visually and color-identical to the log/stem entry already
  // in this table, so adding them would be dead weight, not new coverage.
  ...OVERWORLD_WOODS.map((w) => block(`${w}_planks`, 'wood_earth')),
  block('bamboo_planks', 'wood_earth'), block('crimson_planks', 'wood_earth'), block('warped_planks', 'wood_earth'),
  // Logs/stems/bamboo block: bark sides stay fully eligible everywhere, but their top/bottom
  // end-grain (rings, bamboo's cross-section) reads as an obvious blotch on a flat megablock
  // surface — see the `endGrainTopBottom` doc on FullCubeBlockDef. Birch is excluded entirely
  // (not just off top/bottom) — its pale, high-contrast bark still looked out of place as filler
  // even on the side faces where every other wood's bark reads fine; birch_planks stays available.
  ...OVERWORLD_WOODS.filter((w) => w !== 'birch').flatMap((w) => [
    block(`${w}_log`, 'wood_earth', { endGrainTopBottom: true }),
    block(`stripped_${w}_log`, 'wood_earth', { endGrainTopBottom: true }),
  ]),
  block('bamboo_block', 'wood_earth', { endGrainTopBottom: true }),
  block('stripped_bamboo_block', 'wood_earth', { endGrainTopBottom: true }),
  ...['crimson', 'warped'].flatMap((w) => [
    block(`${w}_stem`, 'wood_earth', { endGrainTopBottom: true }),
    block(`stripped_${w}_stem`, 'wood_earth', { endGrainTopBottom: true }),
  ]),

  // Earthy fill
  block('mud', 'wood_earth'), block('packed_mud', 'wood_earth'),

  // Real light sources — so a build with warm/glowing-colored pixels (a lantern, a torch, a
  // glowing item, ...) can come out of blocks that actually emit light in-game too, not just
  // ones that are colored like they should. `lantern`/`soul_lantern` themselves are deliberately
  // NOT here — they're small hanging-fixture models, not full 1x1x1 cubes, so their texture
  // (a small icon sprite for the cage/chain shape) would stretch wrong if tiled across a whole
  // cube face the way every other entry in this table assumes. `magma_block` is left out for the
  // same reason cracked/chiseled variants are elsewhere in this file — its high-contrast cracked
  // pattern reads as damaged rather than a clean fill. `shroomlight` is excluded for the same
  // reason, confirmed against a real build: matching resin_block put 192 mottled/spotty
  // shroomlight pixels into an otherwise-smooth field of orange concrete/wool, and it visibly
  // clashed — sea_lantern's flatter texture doesn't have this problem and stays in.
  // `redstone_lamp` (the "lamp" block) is excluded per user feedback — removed from the palette
  // entirely, not kept for any face.
  //
  // The three froglights (`ochre_froglight`/`verdant_froglight`/`pearlescent_froglight`) were here
  // too, but per explicit user request ("remove all of usage of the froglight blocks of all of the
  // blocks") are removed outright rather than managed via `filterLightSourcesForSource`'s per-source
  // exclusion list — a real-jar sweep across every mob, hand-authored item, and Block-mode source
  // (prompted by the user asking which builds used froglight) found it winning real votes in far
  // more places than the existing exclusion list covered (63 Block-mode sources including
  // `quartz_block`, `snow`, `bone_block`; the `iron golem`/`snow golem`/`chicken` mobs; `pale_oak_sign`)
  // — removing the source entirely is simpler and more complete than exclusion-listing every one.
  // `glowstone`/`sea_lantern` remain — the user's request named froglight specifically, and every
  // exclusion in `lightSourceExclusion.ts` keyed on either of those two still applies (some sources,
  // e.g. `piglin_head`/`barrel`, were confirmed to pull glowstone specifically, not froglight).
  // Both remaining entries tagged 'neutrals_concrete' — vivid, saturated colors, the same
  // "permitted for saturated pixels without a family penalty" bucket wool/concrete already use.
  // Tagged `lightSource` — see its doc on FullCubeBlockDef: eligible everywhere by default, but
  // `filterLightSourcesForSource` (lightSourceExclusion.ts) strips them for specific sources
  // they're confirmed to look bad in.
  block('glowstone', 'neutrals_concrete', { lightSource: true }),
  block('sea_lantern', 'neutrals_concrete', { lightSource: true }),

  // Glass — plain, all 16 stained colors, and tinted. Gated `glassOnly`: real glass reads as
  // "correct" filler only inside a build that's itself glass-related (a stained glass block, a
  // beacon, an end crystal, ...) — for any other build it's exactly the wrong material (the same
  // problem sea_lantern had as a stand-in for pale/white pixels before glass was ever in this
  // palette). `filterPaletteForSource` (glassSource.ts) is what actually enforces the gate; every
  // call site that matches against the palette runs the source name through it first.
  //
  // Plain `glass` and `tinted_glass` are deliberately tagged 'stone_deepslate', not
  // 'neutrals_concrete' — verified against the real jar: clear glass's own texture averages to a
  // mildly chromatic saturation (~0.2, just over the "chromatic" threshold) from its natural
  // blue-tinted shading, which is read as "muted/natural" by the matcher's own
  // NATURAL_SATURATION_CUTOFF (0.5). Tagged 'neutrals_concrete' (the "vividly dyed" bucket), that
  // self-triggers the family-affinity penalty against glass's *own* best match, so beacon builds
  // (whose model literally samples the real glass.png) came out entirely sea_lantern/white_wool —
  // glass never won even against itself. The 16 stained_glass colors don't have this problem
  // (their saturation is high enough that the "pixel prefers natural" guard never engages for
  // them at all) and correctly stay 'neutrals_concrete', the same bucket wool/concrete use.
  block('glass', 'stone_deepslate', { glassOnly: true }),
  ...colorFamily('_stained_glass', 'neutrals_concrete', { glassOnly: true }),
  block('tinted_glass', 'stone_deepslate', { glassOnly: true }),
];
