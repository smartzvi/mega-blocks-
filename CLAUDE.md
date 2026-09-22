# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fully client-side React + Vite + TypeScript app (Tailwind v4, react-three-fiber). The user uploads a Minecraft client jar (`1.21.x.jar`, not in the repo) and the app turns a block, item, structure, mob, or tree into a giant "megablock" made of real vanilla blocks, previews it in 3D, and exports `.litematic` / vanilla `.nbt`. There is no backend. Pushing to `main` auto-deploys to Vercel (see `DEPLOYMENT.md` for the inert-until-configured AdSense setup).

## Commands

```bash
npm run dev                          # vite dev server (port 5173; .claude/launch.json name: minecraft-megablock)
npm run build                        # tsc -b && vite build
npm run lint                         # oxlint
npx tsc -b                           # type check — NEVER `tsc --noEmit`
npx vitest run                       # all tests
npx vitest run src/lib/blockstate    # one directory / file
npx vitest run -t "fence"            # by test name
```

`tsc --noEmit` checks zero files here (root tsconfig is solution-style with `"files": []`) and silently reports success. Always use `tsc -b`.

## Architecture

**Everything derives from the uploaded jar.** `lib/zip/loadArchive.ts` builds lazy per-file loader maps (block/entity textures, models, blockstates, structures); `AppContext` keeps them so any mode can fetch arbitrary files on demand. `lib/palette/buildPalette.ts` reduces the jar to a curated ~123 full-cube block **palette** — every mode's output is voxels whose colour was matched (Lab/HSV, `lib/matching/matchFace.ts`) to the nearest palette block.

**Five modes (`AppMode`), one output hook.** `state/useFinalVoxelGrid.ts` is the single source of truth that preview, material list and export all read. Block mode assembles matched faces into a shell (`assembleShell` → `applyShapeCutout`); the other four modes produce a finished `VoxelGrid` in their picker component. `VoxelGrid` is **sparse** (`voxels: Map<number, blockId>`, one packed integer key per cell — a `"x,y,z"` string key was ~15× slower to iterate and dominated big builds) — always go through `lib/voxel/voxelGrid.ts` accessors, never the map directly, and never build keys by hand.

**Item/mob voxelizer (the core engine).** `resolveItemModel` follows the same chain the game does: blockstate JSON → (variant or multipart, chosen by real block properties, `blockstate/parseBlockState.ts`) → model JSON parent chain (`resolveModelFile`) → element rotation → `rasterizeItemModel`, which fills each element's box, then colours each exposed voxel face from that element's UV region. Rules that matter: later elements win where they overlap; a genuinely transparent texel is a real hole; visibility depends on the *union shape*, not element order (a box nested inside another is never visible).

**Blocks with no model JSON are hand-authored** in `lib/models/handAuthoredTemplates.ts` (chest, ender/trapped chest, bed, shulker, sign, skulls, beacon) and mobs in `handAuthoredMobTemplates.ts` (geometry transcribed from Mojang's Bedrock `*.geo.json`, since the jar has no entity models). Chest templates are functions of block properties (`resolveHandAuthoredTemplate(name, properties)`) so `type=left/right` + `facing` build seamless double chests. Use `elementPaletteRestrictions` to pin an element to specific palette blocks — but if none of the listed ids exist in the palette it silently falls back to the *whole* palette, so check ids against `buildPalette` output.

**Structure and tree modes share a pipeline:** `parseStructureFile` (vanilla `.nbt` or `.litematic`; trees use `generateTreeGrid` instead) → `knownStructureFixes` (hand-verified per-structure corrections) → `cullInteriorVoxels` → `buildStructureVoxelGrid` → `cullComposedInterior`. Blocks are identified by full blockstate keys (`minecraft:oak_stairs[facing=east,...]`, see `structure/blockstateKey.ts`). `buildStructureBlockStamp` voxelizes each *unique* key once through the item engine and stamps it at every position; anything that can't be voxelized falls back to a flat matched-colour cube. Same-block neighbours suppress end-cap faces so logs/pillars read continuous (stairs are deliberately excluded). `structure/common.ts` strips air and beds at parse time. `structure/safetyLimits.ts` caps source volume and final voxel count.

**The heavy `buildStructureVoxelGrid` step runs in a Web Worker** (`structure/structureBuildClient.ts` → `structureBuildWorker.ts`), so a multi-million-voxel build no longer freezes the page. Parse/fixes/cull stay on the page (cheap); the worker loads its own copy of the jar (`AppState.archiveFile`), is warmed up when a picker mounts, and reports staged progress (`buildProgress.ts`) to `BuildProgressBar`. Results cross the boundary as transferred typed arrays (`voxel/packGrid.ts`) and are rebuilt in small slices — **never post a big `Map` back**: receiving a 3.5M-entry Map blocked the page 3.2 s. If workers are unavailable, `buildStructureGrid` falls back to the original in-page build (same output, verified identical). Anything the worker imports must not touch `document`/`window` (texture decoding uses `OffscreenCanvas` there).

**Export (`.litematic`/`.nbt`) runs in its own Web Worker too** (`nbt/exportClient.ts` → `nbt/exportWorker.ts`), same reasoning as the build worker but simpler — export never touches the jar, so there's no `init`/warm-up step; every request just packs the finished grid (`voxel/packGrid.ts`), transfers it, and gets bytes back. `litematicExport.ts`/`vanillaStructureExport.ts`'s write loops report `nbt/exportProgress.ts` progress (checked every 4096 voxels, not every one) to `ExportProgressBar`; `exportGridToBytes` falls back to the original synchronous export when workers are unavailable, still with real progress from the instrumented loop but no live-updating bar (a synchronous main-thread call can't repaint mid-loop).

## Gotchas learned the hard way

- **Blast radius of `rasterizeModel.ts` changes is huge.** Vanilla models routinely rely on the engine's current fill behaviour (cactus, cauldron water, nether portal, glass panes). Before changing shared engine behaviour, diff every blockstate in the real jar (item mode at 16³ plus property-carrying keys from a sample of structures) before/after; prefer narrow, name-scoped fixes (see `dropBarsCapBoxes` in `resolveItemModel.ts`).
- Small fixed UV rects in hand-authored templates must be verified fully opaque in the real texture; a transparent texel silently becomes air.
- Multipart blockstates only render connections when real properties are passed in (structure mode, which always keeps the connections the file saved — there is deliberately no connection setting there). Item mode has no neighbours, so a fence/pane/bars/wall/wire there is its bare default unless the user picks All connected / Isolated in `ConnectionToggle` (`lib/models/itemConnections.ts`); that control only appears for those blocks. A neighbour-inferring "auto-connect" for structures once existed (commit `b7d6005`, `structure/connections.ts`, 94–100% agreement with the game's saved data) and was removed as unwanted.
- `handAuthoredTemplates` entries are a union of plain objects and property functions — always read them via `resolveHandAuthoredTemplate`, never index `HAND_AUTHORED_TEMPLATES` directly.

## Verifying rendering changes

Passing tests and `tsc -b` don't prove a shape looks right. Verify against the real jar: copy it to `public/test-fixtures/mc.jar`, `import()` app modules from the running dev server (`/src/lib/...?t=<timestamp>` to bypass cache), build real grids, and print ASCII slices / voxel counts. **Delete `public/test-fixtures` afterwards — it is not gitignored and the jar is ~30 MB.** The browser pane's screenshot tool is unreliable in this environment; use numeric/ASCII checks instead.
