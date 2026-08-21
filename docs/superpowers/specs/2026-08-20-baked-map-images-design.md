# Baked Map Images — Design Spec

**Date:** 2026-08-20  
**Status:** Approach 1 approved in conversation; awaiting file review  
**Goal:** Lobby map preview and in-match playfield color come from pre-baked JPEGs, not a runtime pixel bake of `buildStylizedTerrain`.

---

## 1. Problem

`MapPreview` calls `buildStylizedTerrain` on the main thread. That function writes every pixel of a ~2000×1600 canvas (28px per cell plus an 18px cliff strip). The lobby then CSS-shrinks it to ~192px tall. Map changes repeat the full bake. There is no image file and no cache.

Combat 3D does **not** currently sample that canvas. Playfield + scenery share a splat material that tiles `public/terrain/{biome}/*.jpg`. `GameCanvas` never calls `loadGameAssetsEssential`, so CONNECT is not waiting on this bake today. The user still asked to **use the baked file as combat terrain texture**, so the playfield albedo must switch to the baked map. Scenery around the playfield keeps the existing tiled splat.

---

## 2. Non-goals

- Changing heightfield, ramps, collision, or `MapDef` grid generation
- Replacing scenery (off-map hills) with the baked image
- Original-map MAP viewer / archive tiles
- Runtime generation, IndexedDB, or Web Worker bake
- PNG / WebP (JPEG only)
- Deleting `buildStylizedTerrain` (it remains the bake-script source and file-missing fallback)

---

## 3. Outputs

One bake script writes **two JPEGs per play map** (`jade_basin`, `scar_ridge`, `iron_ring`):

| File | Used by | Content |
|------|---------|---------|
| `public/assets/maps/{id}.jpg` | Lobby `MapPreview` | Current isometric bake (`outTile` 28, `cliffH` 18, painted south cliffs) |
| `public/assets/maps/{id}.top.jpg` | 3D playfield albedo | Same colors, **no Y lift / no painted cliff faces** — top-down so XZ UVs match the heightfield |

Two files are required. Projecting the isometric bake onto the 3D mesh would smear painted cliff strips onto the ground and miss-align plateaus.

JPEG quality **0.90**. Commit the six files. Regenerating is `npm run bake:maps` after `maps.ts` or bake styling changes.

Approximate sizes (Jade 72×56 → ~2016×1586 isometric): a few hundred KB per JPEG, not multi-MB PNG.

---

## 4. Runtime

### Lobby

`MapPreview` renders:

```html
<img src={bakedMapUrl(mapId)} alt={map.name} />
```

URL helper (single source of truth):

```ts
export function bakedMapUrl(mapId: string): string {
  return `/assets/maps/${mapId}.jpg`;
}
export function bakedMapTopUrl(mapId: string): string {
  return `/assets/maps/${mapId}.top.jpg`;
}
```

Label still comes from `getMap` (`name`, `formatMapSize`, features). No canvas, no `buildStylizedTerrain` on the happy path. Broken image → show “미리보기 실패”; do not bake in the lobby.

### Combat

1. Load `{id}.top.jpg` with `THREE.TextureLoader` (RepeatWrapping **off**, ClampToEdge, SRGB).
2. Playfield mesh uses this texture as `map`. UV = `(worldX / map.width, worldY / map.height)` — **not** `TERRAIN_TILE` tiling.
3. Scenery mesh keeps today’s splat material + tiled biome photos.
4. `createTerrainScenery` therefore takes two materials (or builds them internally): playfield unique-map, scenery splat. They already are two meshes (`terrain` / `scenery`).
5. Height, ramps, AO vertex colors, lights, shadows stay as they are. The JPEG only replaces playfield albedo.
6. If the top JPEG 404s, playfield falls back to the current splat material (same as scenery). Do not run `buildStylizedTerrain` on the match-start path.

`loadGameAssetsEssential` must not call `buildStylizedTerrain` when the JPEG exists. If that loader is unused by `GameCanvas`, still stop it from baking so a future caller cannot hitch. `render.ts` `getTerrainStyle` fallback bake stays only for the unused 2D renderer; do not hook it into lobby or 3D.

---

## 5. Bake script

`scripts/bake-map-terrain.mjs` + `npm run bake:maps`.

`buildStylizedTerrain` uses `document.createElement("canvas")`, so the script drives **Playwright Chromium** (already in the repo) against a short-lived Vite server:

1. `createServer` from `vite` on an ephemeral port, root = repo.
2. Open a tiny module page that imports `MAPS` and the bake functions (not a user-facing route).
3. For each map: isometric bake → JPEG 0.90; top-down bake → JPEG 0.90.
4. Write into `public/assets/maps/`.
5. Exit non-zero if any map is missing or a canvas is 0×0.

Top-down bake: same pixel loop as `buildStylizedTerrain` with `lift = 0` and cliff-face passes skipped. Export shared constants (`OUT_TILE = 28`, `CLIFF_H = 18`) from `terrainStyle.ts` so script and runtime stay aligned.

Do not add a production `/bake` URL.

---

## 6. Code units

| Unit | Responsibility |
|------|----------------|
| `src/game/bakedMaps.ts` | URL helpers; optional `loadBakedMapImage(mapId)` for `<img>` decode |
| `src/game/terrainStyle.ts` | Keep bake; export `OUT_TILE` / `CLIFF_H`; add `buildTopDownTerrain` (or a `mode` flag) |
| `src/components/tm/LobbyPreviews.tsx` | `MapPreview` uses `<img>` |
| `src/game/view3d/terrainMesh.ts` | Playfield UVs in 0..1 map space; scenery UVs stay tiled |
| `src/game/view3d/terrainTextures.ts` | Playfield material = unique JPEG; scenery = existing splat |
| `src/game/view3d/createPlayView.ts` | Load `{id}.top.jpg` and pass it into scenery creation |
| `src/game/assets.ts` | Do not pixel-bake when files exist |
| `scripts/bake-map-terrain.mjs` | Generate the six JPEGs |
| `public/assets/maps/*.jpg` | Committed artifacts |

---

## 7. Error handling

- Missing lobby JPEG: broken-image state, no CPU bake.
- Missing combat top JPEG: splat playfield (current look), log a warning.
- Bake script failure: no partial silent success; fail the process.
- Do not block CONNECT on lobby isometric JPEG (combat only needs `.top.jpg`).

---

## 8. Testing

- `bakedMapUrl` / `bakedMapTopUrl` return the paths above for all three ids.
- `buildTopDownTerrain` canvas size is `cols * OUT_TILE` × `rows * OUT_TILE` (no cliff strip). Node test can skip if `document` is missing; then assert size helpers: `isometricBakeSize(map)` / `topDownBakeSize(map)`.
- Existing heightfield / movement tests unchanged.
- Manual: lobby preview appears without “맵 로딩…” stall; switching maps is an `<img>` swap; CONNECT playfield colors match the top-down bake (plateaus/ramps readable); scenery outside the border still tiles.

---

## 9. Success criteria

- First lobby paint does not run the 3-million-pixel loop.
- Map switch does not hitch the main thread on bake.
- Combat playfield uses `{id}.top.jpg` as albedo.
- Regenerating images is one documented npm script, not a hidden Vite plugin.
