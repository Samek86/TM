# Baked Map Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lobby map preview and 3D playfield albedo load from pre-baked JPEGs instead of a runtime pixel bake.

**Architecture:** `bakedMaps.ts` holds URL and size helpers. `terrainStyle.ts` still owns the CPU bake (isometric + top-down) and is invoked only by `scripts/bake-map-terrain.mjs` (Playwright + a tiny Vite server) and as an unused-2D-renderer fallback. Lobby uses `<img src={bakedMapUrl}>`. Combat loads `{id}.top.jpg` onto the playfield mesh with 0..1 UVs; scenery keeps the tiled splat material.

**Tech Stack:** Vite, React, Three.js, Playwright, Vitest, JPEG quality 0.90

## Global Constraints

- JPEG only, quality 0.90
- Files: `public/assets/maps/{id}.jpg` (lobby isometric) and `public/assets/maps/{id}.top.jpg` (combat top-down)
- Maps: `jade_basin`, `scar_ridge`, `iron_ring`
- `OUT_TILE = 28`, `CLIFF_H = 18`
- No runtime bake on lobby or CONNECT; missing top JPEG falls back to splat; missing lobby JPEG shows “미리보기 실패”
- Do not change heightfield, ramps, collision, or scenery tiling
- No production `/bake` route
- `npm run bake:maps` regenerates the six files

---

### Task 1: URL and bake-size helpers

**Files:**
- Create: `src/game/bakedMaps.ts`
- Create: `src/game/bakedMaps.test.ts`
- Modify: `src/game/terrainStyle.ts` (export `OUT_TILE`, `CLIFF_H`)

**Interfaces:**
- Produces: `bakedMapUrl(mapId: string): string`, `bakedMapTopUrl(mapId: string): string`, `isometricBakeSize(map: { cols: number; rows: number }): { width: number; height: number }`, `topDownBakeSize(map: { cols: number; rows: number }): { width: number; height: number }`, `OUT_TILE`, `CLIFF_H`

- [ ] Write failing tests in `src/game/bakedMaps.test.ts`
- [ ] Export constants and implement helpers
- [ ] `npx vitest run src/game/bakedMaps.test.ts`

### Task 2: Top-down bake mode

**Files:**
- Modify: `src/game/terrainStyle.ts` (`buildStylizedTerrain` mode, `buildTopDownTerrain`)

**Interfaces:**
- Consumes: `OUT_TILE`, `CLIFF_H`
- Produces: `buildTopDownTerrain(map: MapDef, mapId: string): StylizedTerrain`; `buildStylizedTerrain(..., opts?: { mode?: "isometric" | "topdown" })`

- [ ] Add `mode: "topdown"` (lift 0, canvas height `rows * OUT_TILE`, no cliff faces)
- [ ] `export function buildTopDownTerrain(...)`

### Task 3: Lobby `<img>` preview

**Files:**
- Modify: `src/components/tm/LobbyPreviews.tsx`

- [ ] `MapPreview` uses `bakedMapUrl`, no `buildStylizedTerrain`
- [ ] `onError` → “미리보기 실패”

### Task 4: Playfield UVs + unique-map material

**Files:**
- Modify: `src/game/view3d/terrainMesh.ts`
- Modify: `src/game/view3d/terrainMesh.test.ts`
- Modify: `src/game/view3d/terrainTextures.ts`
- Modify: `src/game/view3d/createPlayView.ts`
- Modify: `src/components/tm/GameCanvas.tsx`

**Interfaces:**
- Produces: `buildTerrainGeometry(map, uvMode?: "tile" | "map")`, `loadBakedPlayfieldMap(mapId: string): Promise<THREE.Texture | null>`, `createPlayfieldMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial`, `createTerrainScenery(map, kit, shadows, playfieldMap?: THREE.Texture | null)`
- `createPlayView(..., playfieldMap?: THREE.Texture | null)`

- [ ] UV test for `"map"` mode
- [ ] Playfield baked albedo; scenery splat; 404 → splat fallback
- [ ] GameCanvas loads kit + top JPEG in parallel

### Task 5: Skip match-start CPU bake

**Files:**
- Modify: `src/game/assets.ts`

- [ ] `loadGameAssetsEssential` does not call `buildStylizedTerrain`

### Task 6: Bake script and artifacts

**Files:**
- Create: `scripts/bake-map-page.html`
- Create: `scripts/bake-map-terrain.mjs`
- Modify: `package.json` (`bake:maps`)
- Create: `public/assets/maps/*.jpg` (six files)

- [ ] Playwright + ephemeral Vite (port 18789, no TanStack)
- [ ] `npm run bake:maps` writes six JPEGs, fails on empty canvas
- [ ] Existing tests still pass
