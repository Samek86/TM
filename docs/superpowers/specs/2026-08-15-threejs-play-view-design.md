# Three.js Play View — Design Spec

**Date:** 2026-08-15  
**Status:** Approved in conversation; awaiting file review  
**Goal:** Play arena is a 2.5D Three.js view: readable cliffs/ramps, realtime 3D crafts, acceleration, and less hitching. Simulation and non-play tabs stay as they are.

---

## 1. Problem

The play loop is Canvas 2D, fully top-down. Height is a color plus a Y offset. Ramps are recolored cells. Crafts are yaw-only baked sprites (`public/craft/` 72 frames). WASD snaps to cruise speed. Screen shake uses per-frame random offsets, which reads as stutter.

Players want:

1. Crafts that look and move like small vehicles (highest priority)
2. Hills and climb paths that read as 3D
3. Acceleration instead of instant cruise
4. Less hitching during combat

---

## 2. Non-goals

- Full free-camera 3D or zoom/orbit controls
- Replacing lobby, SPR viewer, MAP viewer, or archive
- Original-map play (still viewer-only)
- GLTF/Blender craft pipeline
- Silent fallback to the current 2D play renderer
- Changing weapon tables, loadouts, bot skill tiers, or match rules
- Multiplayer
- Using `public/craft/` frames as the in-match craft (kept on disk; unused in play)

---

## 3. Architecture

Three layers. Render does not own gameplay rules.

| Layer | Responsibility |
|-------|----------------|
| `src/game/engine.ts` | Position, velocity, climb, fire, AI, pickups. No Three.js imports. |
| `src/game/view3d/` | Scene, ortho camera, terrain mesh, craft meshes, projectiles, lights. |
| `src/components/tm/GameCanvas.tsx` | Input, pause, loading, fullscreen, HTML HUD overlay. Owns the WebGL canvas. |

`src/game/render.ts` stays in the repo but is **not** called from the play loop after this change. Do not keep a dual renderer switch.

Coordinate mapping (engine stays 2D):

- Engine `x` → Three.js `position.x`
- Engine `y` → Three.js `position.z`
- Terrain height → Three.js `position.y`
- Three.js `+Y` is up. Map north (engine −y) is Three.js −Z. Camera sits on the +Z side and looks toward −Z, pitched 30° down.

New dependency: `three` (current stable). No `@react-three/fiber` — the play loop is an existing `requestAnimationFrame` + engine tick, not React Three state.

Suggested files:

```
src/game/view3d/
  createPlayView.ts     // renderer, scene, resize, renderFrame(state)
  cameraRig.ts          // 30° ortho, follow player, world width
  terrainMesh.ts        // MapDef → BufferGeometry (once per map)
  crafts.ts             // Born / Killers / Sorcerer Group factories
  projectiles.ts        // instanced shots + simple FX
  aimPick.ts            // screen → terrain world hit
```

---

## 4. Camera

- Orthographic. Pitch **30°** down from horizontal (looking north-ish). No yaw orbit. No player-controlled zoom.
- Horizontal world span equals current `VIEW_WORLD_WIDTH` (720u), capped by map bounds — same on-screen craft size as today.
- Follows the local player each frame. No lerp that lags more than ~80ms (optional light follow damp is allowed if it reduces hitch feel).
- Hit shake: damped offset, max ~6 world units, **not** `Math.random()` per frame. A short decaying wave or noise sampled at low frequency is fine.
- Resize: update ortho frustum + renderer size. Pixel ratio `min(devicePixelRatio, 1.5)`.

---

## 5. Terrain

Use the three play maps as authored: Jade Basin, Scar Ridge, Iron Ring. Same `elevation[]` (0 low / 1 high) and `ramps[]`.

Build **one** `BufferGeometry` per match start:

| Cell | Mesh |
|------|------|
| Low | Flat slab at height 0 |
| High | Flat slab at height `CLIFF_H` + vertical cliff faces where a neighbor is low and not a ramp |
| Ramp | A slope quad from height 0 to `CLIFF_H` along the climb direction |

Ramp direction: from the adjacent low cell toward the adjacent high cell. If several neighbors qualify, pick the dominant axis (horizontal first, then vertical). A ramp with no high neighbor is still a slope toward the nearest high cell on the map grid (flood one step). Do not leave ramps as flat recolored tiles.

`CLIFF_H` is a fixed world height (about `0.9 * cellSize`, ~27u) so a 30° camera shows a clear wall, not a thin line.

Materials (MeshLambert or MeshToon, one material per biome role):

- Low fill, high fill, cliff face (darker), ramp (lighter + edge lines or a stripe so it reads as a path)
- Biome palettes stay map-themed (jungle / desert / outpost) from `terrainStyle` colors

No per-frame terrain rebuild. No original TIL blit in the play view.

Climb rules unchanged: low→high only through a ramp cell; high→low always allowed; projectiles use the same `canTraverseHeight` / `canProjectilePath`.

---

## 6. Crafts

Procedural `THREE.Group` per vulture id. Shared geometries/materials across pilots of the same id.

| Craft | Read from above + 30° |
|-------|------------------------|
| Born Armor | Medium angular fuselage, short wings, amber cockpit/trim |
| Killers Pot | Wide thick hull, stubby wings, cyan trim |
| Sorcerer | Long thin nose, larger wings, violet trim |

Scale so the visual length is about `2.2 ×` current `craftWorldRadius` — readable, not covering a quarter of the screen.

Motion (visual only; hitbox stays a 2D circle on the map plane):

- Yaw: craft nose follows aim angle (`pilot.angle`), same as today
- Bank: proportional to lateral velocity relative to nose. Caps: Sorcerer 28°, Born 18°, Killers 10°. Ease in/out so it does not pop
- Pitch: on a ramp cell, pitch to the slope (nose up when moving uphill, down downhill). On flat low/high, pitch 0. Blend over ~0.1s
- Hover bob: keep a small idle bob when stillness is high; fade while moving
- Shadow: a dark decal/circle on the terrain under the craft, not a sprite floating in world XY

World Y of the craft = terrain height at `(x, y)` + a small hover offset. The engine still stores map-plane `x, y` only. The view samples the same elevation/ramp grid the mesh used.

If a craft factory throws, that pilot is a colored capsule of the same radius. Match continues.

`public/craft/` baked frames are not loaded in play.

---

## 7. Movement (engine)

Add planar velocity. Do not snap to cruise.

- Input: WASD / arrows as now, independent of aim
- Accelerate toward desired velocity: **0.20s** to cruise from rest
- Decelerate when no input: **0.12s** to stop from cruise
- Cruise speed unchanged: `craftWorldSpeed(tilesPerSec)`
- Diagonal: same cruise magnitude (normalize input)
- Collision: keep `applyMove` / slide / climb tests, but apply them to the **attempted step from velocity**, not to a full-speed WASD vector. If a step is blocked, zero the blocked axis (slide) rather than killing all speed
- Bots use the same accel curve so they do not look snappier than the player

No slope physics (no sliding down cliffs). Height change is still discrete cell permission plus visual pitch.

---

## 8. Aim, shots, pickups, HUD

- Mouse / touch: ray from camera through screen pixel, intersect terrain mesh (or an equivalent heightfield picker). Write that `(x, y)` into `state.pointer`. High ground hits high plane.
- Shots and pickups render as simple 3D (instanced spheres/elongated meshes for shots; floating marker for pickups). Weapon body SPR in 3D is optional later — first pass may use colored 3D tokens plus existing SFX.
- HUD remains HTML/CSS (or a 2D overlay canvas) on top of the WebGL canvas: HP, weapon slots 1–4, message, minimap, pause. Minimap stays 2D top-down of elevation + player dot.
- Controls unchanged: WASD, LMB / Ctrl fire, 1–4 weapons, Esc pause, Q exit.

---

## 9. Performance

- One terrain mesh per match
- Shared craft materials; N craft groups (player + bots, typically < 12)
- Instanced projectiles
- No `getBoundingClientRect` / layout reads in the RAF hot path (keep current GameCanvas caching)
- Audio (Tone/MIDI) stays off the render thread of concern: no new work in `renderFrame`
- Target: sustained ~60 fps during a full bot match on a desktop GPU. Load hitch before `acceptInput` is allowed. Repeated mid-fight hitches are a fail.

---

## 10. Failure

| Case | Behavior |
|------|----------|
| `WebGLRenderer` cannot start | Show an error on the play shell, return to lobby. Do not start a 2D match. |
| Terrain build fails | Same as WebGL fail — cannot play without a mesh. |
| Single craft factory fails | Capsule fallback for that id only. |
| SFX / MIDI fail | Log and continue (current behavior). |

---

## 11. Verification

Manual play (desktop + one smaller viewport):

1. All three crafts: 0.2s accel, 0.12s stop, bank on strafe, pitch on ramps
2. All three maps: cliff faces visible, ramps look like paths, climb only on ramps, descend off cliffs
3. Aim on low and high ground matches the cursor
4. Slots 1–4, pickup ammo, pause, Q to lobby
5. Bot deathmatch reaches kill limit / game over
6. No dual 2D/3D play path; WebGL failure returns to lobby

No new unit-test framework required. Existing `verify-spr` / `verify-map` / `verify-re-formats` stay green (untouched formats).

---

## 12. Implementation order

1. Engine velocity + accel (behavior exists even before the 3D view lands; play is not shipped until the 3D loop is wired)
2. `view3d` bootstrap + 30° camera + follow
3. Terrain mesh from MapDef
4. Three craft factories + bank/pitch + shadow
5. Aim picker, shots, pickups
6. HUD overlay + remove play-loop call to `render.ts`
7. Failure path + play verification on three maps × three crafts
