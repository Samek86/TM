# Three.js Play View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Canvas 2D play loop with a Three.js 2.5D arena: accelerating crafts, readable cliff/ramp meshes, and realtime low-poly ships, without changing match rules or non-play tabs.

**Architecture:** `engine.ts` stays render-agnostic and gains planar velocity. Pure height/pose/aim math lives in small modules with Node tests. `src/game/view3d/` owns the WebGL scene. `GameCanvas.tsx` owns input, loading, WebGL failure, and an HTML HUD. `render.ts` is no longer called from play.

**Tech Stack:** React 19, existing RAF loop (no R3F), `three`, Vitest for Node-side math, existing Vite `:8080` preview.

## Global Constraints

- Play view only — lobby, SPR viewer, MAP viewer, archive unchanged.
- No `@react-three/fiber`. No GLTF craft pipeline. No `public/craft/` frames in play.
- No silent 2D play fallback. WebGL or terrain-build failure → error + lobby. Single craft factory failure → colored capsule.
- Engine `x` → Three `position.x`; engine `y` → Three `position.z`; height → Three `position.y`. `+Y` up. Camera on `+Z`, look toward `-Z`, pitch 30° down.
- Accel 0.20s rest→cruise, decel 0.12s cruise→stop. Cruise = existing `craftWorldSpeed`. Diagonal same magnitude.
- Camera world width = `VIEW_WORLD_WIDTH` (720). DPR `min(devicePixelRatio, 1.5)`. Shake max 6 world units, not per-frame `Math.random()`.
- Climb rules unchanged (`canTraverseHeight` / `canProjectilePath`). Hitboxes stay 2D circles. Bank/pitch are visual only.
- Controls unchanged: WASD, LMB/Ctrl fire, 1–4, Esc pause, Q exit.
- Weapon tables, loadouts, bot skill tiers, kill limit unchanged.
- `engine.ts` must not import `three`.
- Existing `node scripts/verify-spr.mjs`, `verify-map.mjs`, `verify-re-formats.mjs` stay green.

## File map

| File | Role |
|------|------|
| `src/game/movement.ts` | Accel/decel + collision step that zeros a blocked axis |
| `src/game/heightfield.ts` | Cliff height, ramp direction, sample Y at a map point |
| `src/game/engine.ts` | Add `vx`/`vy`; player + AI use movement helpers |
| `src/game/view3d/coords.ts` | Engine ↔ Three axis mapping |
| `src/game/view3d/cameraRig.ts` | 30° ortho frustum, follow, deterministic shake |
| `src/game/view3d/terrainMesh.ts` | One `BufferGeometry` + biome materials from `MapDef` |
| `src/game/view3d/craftPose.ts` | Bank/pitch/hover targets |
| `src/game/view3d/crafts.ts` | Born / Killers / Sorcerer groups + capsule fallback |
| `src/game/view3d/aimPick.ts` | Ray vs heightfield → engine `(x,y)` |
| `src/game/view3d/projectiles.ts` | Instanced shots + pickup markers |
| `src/game/view3d/createPlayView.ts` | Renderer, scene, `renderFrame` / `pickAim` / `dispose` |
| `src/game/view3d/index.ts` | Public exports |
| `src/components/tm/PlayHud.tsx` | HP, slots, message, 2D minimap, scores |
| `src/components/tm/GameCanvas.tsx` | WebGL canvas, new loop, no `renderGame` |
| `vitest.config.ts` | Node tests + `@/` alias |
| `src/game/*.test.ts`, `src/game/view3d/*.test.ts` | Task tests |
| `src/game/render.ts` | Leave on disk; play must not import it |
| `package.json` | `three`, `vitest`, `"test": "vitest run"` |

---

### Task 1: Velocity integration (engine)

**Files:**
- Create: `src/game/movement.ts`
- Create: `src/game/movement.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest` devDependency and `"test"` script)
- Modify: `src/game/engine.ts` (`Pilot` + `spawnPilot` + `updatePlayer` + `updateAI`)

**Interfaces:**
- Consumes: existing `canFlyTo` / `applyMove` collision predicate; `pilot.speedStat`
- Produces:
  - `export const ACCEL_TIME = 0.2`
  - `export const DECEL_TIME = 0.12`
  - `export function approachVelocity(vx: number, vy: number, wishX: number, wishY: number, cruise: number, dt: number): { vx: number; vy: number }`
  - `export function tryStep(ox: number, oy: number, vx: number, vy: number, dt: number, canFly: (x0: number, y0: number, x1: number, y1: number) => boolean): { x: number; y: number; vx: number; vy: number; moved: boolean }`
  - `Pilot.vx: number` and `Pilot.vy: number`

- [ ] **Step 1: Add Vitest**

```bash
npm install -D vitest
```

`package.json` scripts add: `"test": "vitest run"`

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 2: Write the failing tests**

`src/game/movement.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ACCEL_TIME, DECEL_TIME, approachVelocity, tryStep } from "./movement";

describe("approachVelocity", () => {
  it("reaches cruise from rest in ACCEL_TIME", () => {
    const cruise = 200;
    let vx = 0;
    let vy = 0;
    const steps = 20;
    const dt = ACCEL_TIME / steps;
    for (let i = 0; i < steps; i++) {
      ({ vx, vy } = approachVelocity(vx, vy, cruise, 0, cruise, dt));
    }
    expect(vx).toBeCloseTo(cruise, 5);
    expect(vy).toBeCloseTo(0, 5);
  });

  it("stops from cruise in DECEL_TIME", () => {
    const cruise = 200;
    let vx = cruise;
    let vy = 0;
    const steps = 20;
    const dt = DECEL_TIME / steps;
    for (let i = 0; i < steps; i++) {
      ({ vx, vy } = approachVelocity(vx, vy, 0, 0, cruise, dt));
    }
    expect(vx).toBeCloseTo(0, 5);
    expect(vy).toBeCloseTo(0, 5);
  });

  it("keeps diagonal wish at cruise magnitude", () => {
    const cruise = 100;
    const s = cruise / Math.SQRT2;
    const { vx, vy } = approachVelocity(0, 0, s, s, cruise, ACCEL_TIME);
    expect(Math.hypot(vx, vy)).toBeCloseTo(cruise, 5);
  });
});

describe("tryStep", () => {
  it("moves freely when unblocked", () => {
    const r = tryStep(10, 10, 20, 0, 0.1, () => true);
    expect(r.x).toBeCloseTo(12);
    expect(r.y).toBeCloseTo(10);
    expect(r.vx).toBe(20);
    expect(r.moved).toBe(true);
  });

  it("zeros the blocked axis and slides on the free axis", () => {
    const r = tryStep(0, 0, 10, 10, 1, (x0, y0, x1, y1) => {
      if (x1 !== x0 && y1 !== y0) return false; // block diagonal
      if (x1 !== x0) return false; // block X
      return true; // allow Y
    });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(10);
    expect(r.vx).toBe(0);
    expect(r.vy).toBe(10);
    expect(r.moved).toBe(true);
  });

  it("stops completely when both axes blocked", () => {
    const r = tryStep(0, 0, 10, 5, 1, () => false);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.vx).toBe(0);
    expect(r.vy).toBe(0);
    expect(r.moved).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/game/movement.test.ts`

Expected: FAIL — `Cannot find module './movement'`

- [ ] **Step 4: Implement movement.ts**

```ts
export const ACCEL_TIME = 0.2;
export const DECEL_TIME = 0.12;

export function approachVelocity(
  vx: number,
  vy: number,
  wishX: number,
  wishY: number,
  cruise: number,
  dt: number,
): { vx: number; vy: number } {
  const wishLen = Math.hypot(wishX, wishY);
  const time = wishLen < 1e-6 ? DECEL_TIME : ACCEL_TIME;
  const maxDelta = (Math.max(cruise, 1e-6) / time) * dt;
  const dx = wishX - vx;
  const dy = wishY - vy;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDelta || dist < 1e-9) return { vx: wishX, vy: wishY };
  const k = maxDelta / dist;
  return { vx: vx + dx * k, vy: vy + dy * k };
}

export function tryStep(
  ox: number,
  oy: number,
  vx: number,
  vy: number,
  dt: number,
  canFly: (x0: number, y0: number, x1: number, y1: number) => boolean,
): { x: number; y: number; vx: number; vy: number; moved: boolean } {
  const nx = ox + vx * dt;
  const ny = oy + vy * dt;
  if (canFly(ox, oy, nx, ny)) {
    return { x: nx, y: ny, vx, vy, moved: true };
  }
  const x1 = ox + vx * dt;
  if (canFly(ox, oy, x1, oy)) {
    return { x: x1, y: oy, vx, vy: 0, moved: true };
  }
  const y1 = oy + vy * dt;
  if (canFly(ox, oy, ox, y1)) {
    return { x: ox, y: y1, vx: 0, vy, moved: true };
  }
  return { x: ox, y: oy, vx: 0, vy: 0, moved: false };
}
```

- [ ] **Step 5: Wire engine.ts**

On `Pilot` add `vx: number; vy: number`. In `spawnPilot` set both to `0`.

Replace the body of `applyMove` usage in `updatePlayer` (the block that builds `mx/my` and calls `applyMove(..., pilot.speedStat, dt)`) with:

```ts
  let mx = 0;
  let my = 0;
  if (k["KeyW"] || k["ArrowUp"]) my -= 1;
  if (k["KeyS"] || k["ArrowDown"]) my += 1;
  if (k["KeyA"] || k["ArrowLeft"]) mx -= 1;
  if (k["KeyD"] || k["ArrowRight"]) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }
  const wishX = mx * pilot.speedStat;
  const wishY = my * pilot.speedStat;
  const nextV = approachVelocity(
    pilot.vx,
    pilot.vy,
    wishX,
    wishY,
    pilot.speedStat,
    dt,
  );
  pilot.vx = nextV.vx;
  pilot.vy = nextV.vy;
  const stepped = tryStep(
    pilot.x,
    pilot.y,
    pilot.vx,
    pilot.vy,
    dt,
    (x0, y0, x1, y1) => canFlyTo(state, x0, y0, x1, y1, padFor(pilot)),
  );
  pilot.x = stepped.x;
  pilot.y = stepped.y;
  pilot.vx = stepped.vx;
  pilot.vy = stepped.vy;
  updateStillness(pilot, stepped.moved, dt);
```

Extract `padFor(pilot)` as `Math.max(2, pilot.radius * 0.45)` (same as current `applyMove` pad). Keep `applyMove` in the file for `tryUnstickMove` only.

In `updateAI`, after `mx/my` are normalized and `moveSpd` is computed, replace the `applyMove` + sideways retries with the same `approachVelocity` + `tryStep` using `moveSpd` as cruise. If `!stepped.moved`, keep the existing `tryUnstickMove(...)` fallback, then copy resulting `x/y` and zero `vx/vy` if still stuck.

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run src/game/movement.test.ts`

Expected: PASS

Run: `npx tsc --noEmit`

Expected: PASS (Pilot.vx/vy set everywhere `spawnPilot` / any object literal Pilot)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/game/movement.ts src/game/movement.test.ts src/game/engine.ts
git commit -m "Add planar acceleration and axis-slide movement."
```

---

### Task 2: Heightfield sampling

**Files:**
- Create: `src/game/heightfield.ts`
- Create: `src/game/heightfield.test.ts`

**Interfaces:**
- Consumes: `MapDef` from `@/data/maps` (`elevation`, `ramps`, `cols`, `rows`, `width`, `height`, `cellSize`)
- Produces:
  - `export function cliffHeight(cellSize: number): number` — `0.9 * cellSize`
  - `export function cellSizeOf(map: MapDef): number` — `map.cellSize ?? 30`
  - `export function rampDirection(map: MapDef, cx: number, cy: number): { dx: number; dy: number }` — unit grid step from low toward high
  - `export function sampleTerrainY(map: MapDef, wx: number, wy: number): number` — world height in the same units as `cliffHeight`

- [ ] **Step 1: Write the failing tests**

Helper inside the test file — a 3×3 map, cellSize 30, world 90×90:

```ts
function miniMap(elev: number[], ramps: boolean[]): MapDef {
  return {
    id: "t",
    name: "t",
    theme: "",
    description: "",
    originalFiles: [],
    width: 90,
    height: 90,
    cols: 3,
    rows: 3,
    elevation: elev,
    ramps,
    ground: "#0",
    high: "#0",
    cliff: "#0",
    ramp: "#0",
    accent: "#0",
    cellSize: 30,
    features: [],
  };
}
```

Index `cy * 3 + cx`. Layout: left column low (0), center column ramp, right column high (1).

```ts
it("cliffHeight is 0.9 cell", () => {
  expect(cliffHeight(30)).toBeCloseTo(27);
});

it("flat low is 0 and flat high is cliff", () => {
  const map = miniMap(
    [0, 0, 1, 0, 0, 1, 0, 0, 1],
    [false, false, false, false, false, false, false, false, false],
  );
  expect(sampleTerrainY(map, 15, 45)).toBeCloseTo(0);
  expect(sampleTerrainY(map, 75, 45)).toBeCloseTo(27);
});

it("ramp slopes from low toward high along +X", () => {
  const ramps = [false, true, false, false, true, false, false, true, false];
  const elev = [0, 0, 1, 0, 0, 1, 0, 0, 1];
  const map = miniMap(elev, ramps);
  const dir = rampDirection(map, 1, 1);
  expect(dir.dx).toBe(1);
  expect(dir.dy).toBe(0);
  const y0 = sampleTerrainY(map, 30 + 1, 45);
  const y1 = sampleTerrainY(map, 60 - 1, 45);
  expect(y0).toBeLessThan(y1);
  expect(y0).toBeGreaterThan(0);
  expect(y1).toBeLessThan(27);
});
```

Use a complete `MapDef` so TypeScript accepts it (copy unused string fields as empty).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/heightfield.test.ts`

Expected: FAIL — module not found

- [ ] **Step 3: Implement heightfield.ts**

`cliffHeight(cellSize) => 0.9 * cellSize`.

`rampDirection`:
1. If cell is not a ramp, return `{ dx: 0, dy: 0 }`.
2. Check 4-neighbors in order E, W, N, S (`+x`, `-x`, `-y`, `+y` in grid; N is decreasing `cy` because engine `+y` is south).
3. Prefer a neighbor that is high (`elevation >= 0.5`) — that is the uphill direction. If several, first in E/W then N/S.
4. If no high neighbor, pick the opposite of a low neighbor (still “toward high”).
5. If none, BFS one ring (chebyshev distance 2) for nearest high cell and use the dominant axis of that vector (horizontal first).
6. Return a unit axis `{ dx, dy }` with values in `-1|0|1` and `dx*dx+dy*dy === 1` when a direction exists.

`sampleTerrainY`:
- Convert world to cell via the same formula as `worldToCellIndex` in `src/data/maps.ts` (copy the arithmetic; do not import private helpers).
- Non-ramp low → 0. Non-ramp high → `cliffHeight`.
- Ramp: `t` is the projection of the point inside the cell along `rampDirection` (0 at the low edge, 1 at the high edge). `return t * cliffHeight`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/game/heightfield.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/heightfield.ts src/game/heightfield.test.ts
git commit -m "Add heightfield sampling for cliffs and ramps."
```

---

### Task 3: Camera rig + coordinates

**Files:**
- Create: `src/game/view3d/coords.ts`
- Create: `src/game/view3d/cameraRig.ts`
- Create: `src/game/view3d/coords.test.ts`
- Create: `src/game/view3d/cameraRig.test.ts`
- Modify: `package.json` — add runtime dependency `three` (`npm install three`)

**Interfaces:**
- Consumes: `VIEW_WORLD_WIDTH` from `@/game/viewScale`
- Produces:
  - `export function engineToThree(x: number, y: number, h: number): { x: number; y: number; z: number }` — `{ x, y: h, z: y }`
  - `export function threeToEngine(x: number, z: number): { x: number; y: number }` — `{ x, y: z }`
  - `export const CAMERA_PITCH_RAD = Math.PI / 6`
  - `export const MAX_SHAKE = 6`
  - `export const MAX_DPR = 1.5`
  - `export function computeOrthoHalfExtents(cssW: number, cssH: number, worldWidth: number): { halfW: number; halfH: number }`
  - `export function shakeOffset(shake: number, time: number): { x: number; z: number }`
  - `export function followTarget(playerX: number, playerY: number, terrainY: number, shake: number, time: number): { x: number; y: number; z: number }`

- [ ] **Step 1: Install three**

```bash
npm install three
```

- [ ] **Step 2: Write failing tests**

`coords.test.ts`:

```ts
it("maps engine y onto three z and height onto three y", () => {
  expect(engineToThree(3, 7, 27)).toEqual({ x: 3, y: 27, z: 7 });
  expect(threeToEngine(3, 7)).toEqual({ x: 3, y: 7 });
});
```

`cameraRig.test.ts`:

```ts
it("matches VIEW_WORLD_WIDTH on the wider axis", () => {
  const { halfW, halfH } = computeOrthoHalfExtents(1280, 720, 720);
  expect(halfW * 2).toBeCloseTo(720);
  expect(halfH * 2).toBeCloseTo(720 * (720 / 1280));
});

it("shake stays within MAX_SHAKE and is deterministic", () => {
  const a = shakeOffset(8, 1.25);
  const b = shakeOffset(8, 1.25);
  expect(a).toEqual(b);
  expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(MAX_SHAKE + 1e-6);
});
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `npx vitest run src/game/view3d/coords.test.ts src/game/view3d/cameraRig.test.ts`

Expected: FAIL — modules missing

- [ ] **Step 4: Implement**

`coords.ts` as specified.

`computeOrthoHalfExtents`: `halfW = worldWidth / 2`, `halfH = halfW * (cssH / cssW)`.

`shakeOffset`: `amp = Math.min(MAX_SHAKE, Math.max(0, shake))`. Use `Math.sin(time * 31.7)` and `Math.cos(time * 27.3)` (no `Math.random`). Return `{ x: sin * amp, z: cos * amp }`.

`followTarget`: `engineToThree(playerX, playerY, terrainY)` plus `shakeOffset` on x/z.

- [ ] **Step 5: Run tests — expect PASS**

Run: `npx vitest run src/game/view3d/coords.test.ts src/game/view3d/cameraRig.test.ts`

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/game/view3d/coords.ts src/game/view3d/coords.test.ts src/game/view3d/cameraRig.ts src/game/view3d/cameraRig.test.ts
git commit -m "Add Three.js coordinate map and ortho camera math."
```

---

### Task 4: Terrain mesh

**Files:**
- Create: `src/game/view3d/terrainMesh.ts`
- Create: `src/game/view3d/terrainMesh.test.ts`

**Interfaces:**
- Consumes: `MapDef`, `cliffHeight`, `rampDirection`, `biomeForMapId` from `@/game/terrainStyle` (for colors). Map `ground` / `high` / `cliff` / `ramp` hex strings are the material colors.
- Produces:
  - `export function buildTerrainGeometry(map: MapDef): THREE.BufferGeometry`
  - `export function createTerrainMesh(map: MapDef): THREE.Mesh`
  - Geometry is Y-up: low top at `y=0`, high top at `y=cliffHeight`, ramp tops interpolate, cliff walls are vertical quads on high cells that neighbor a non-ramp low cell.

- [ ] **Step 1: Write failing tests**

Reuse the 3×3 `miniMap` from Task 2 (duplicate the helper in this file — do not say “same as Task 2” only; paste the helper).

```ts
it("includes vertices at 0 and at cliff height", () => {
  const map = miniMap(
    [0, 0, 1, 0, 0, 1, 0, 0, 1],
    [false, true, false, false, true, false, false, true, false],
  );
  const g = buildTerrainGeometry(map);
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  expect(minY).toBeCloseTo(0);
  expect(maxY).toBeCloseTo(27);
  expect(pos.count).toBeGreaterThan(8);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/game/view3d/terrainMesh.test.ts`

- [ ] **Step 3: Implement buildTerrainGeometry**

For each cell `(cx, cy)`:

- World cell origin: `x0 = (cx / cols) * width`, `z0 = (cy / rows) * height`, `x1/z1` the next cell. (Engine y = Three z.)
- **Low (not ramp):** top quad at y=0.
- **High (not ramp):** top quad at y=`H`. For each of N/S/E/W, if neighbor is missing or (low and not ramp), add a vertical wall quad from y=`H` to y=0 on that edge.
- **Ramp:** four top vertices: the two on the low side at y=0, two on the high side at y=`H`, using `rampDirection`. No extra wall on the high-facing edge (the slope is the path). Add thin side skirts if the ramp’s side neighbors are lower.

Push positions + normals into arrays, then `geometry.setAttribute("position", ...)`, `computeVertexNormals()` if not hand-authored.

`createTerrainMesh`: `MeshLambertMaterial` with `vertexColors: true`. Color vertices: low=`map.ground`, high=`map.high`, wall=`map.cliff`, ramp=`map.ramp`. Parse hex with a 10-line `hexToRgb` local helper.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run src/game/view3d/terrainMesh.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/game/view3d/terrainMesh.ts src/game/view3d/terrainMesh.test.ts
git commit -m "Build a one-shot cliff and ramp terrain mesh."
```

---

### Task 5: Craft pose + procedural ships

**Files:**
- Create: `src/game/view3d/craftPose.ts`
- Create: `src/game/view3d/craftPose.test.ts`
- Create: `src/game/view3d/crafts.ts`
- Create: `src/game/view3d/crafts.test.ts`

**Interfaces:**
- Consumes: `VultureId`, `sampleTerrainY`, `rampDirection`, `isRamp` from `@/data/maps`, `craftWorldRadius` only for scale
- Produces:
  - `export const BANK_CAP_DEG: Record<VultureId, number> = { born_armor: 18, killers_pot: 10, sorcerer: 28 }`
  - `export const PITCH_BLEND = 0.1`
  - `export const VISUAL_LENGTH_MUL = 2.2`
  - `export function targetBankRad(vx: number, vy: number, aimAngle: number, capDeg: number): number` — bank from lateral velocity vs nose. Positive bank = right wing down when moving left relative to nose.
  - `export function targetPitchRad(map: MapDef, x: number, y: number, vx: number, vy: number): number` — 0 off-ramp; on ramp, `atan2(H, cellLength)` signed by uphill vs velocity
  - `export function blendAngle(current: number, target: number, dt: number, blendTime: number): number`
  - `export function createCraftGroup(id: VultureId): THREE.Group` — never throws; inner try/catch falls back to `createCapsuleCraft(color)`
  - `export function applyCraftPose(group: THREE.Group, args: { x: number; y: number; vx: number; vy: number; angle: number; vultureId: VultureId; map: MapDef; stillness: number; hoverPhase: number; time: number; dt: number }): void`

- [ ] **Step 1: Write failing pose tests**

```ts
it("banks when strafing relative to aim", () => {
  // aim +X (angle 0), velocity +Y (south / left of nose in y-down)
  const bank = targetBankRad(0, 100, 0, 18);
  expect(Math.abs(bank)).toBeGreaterThan(0.05);
  expect(Math.abs(bank)).toBeLessThanOrEqual((18 * Math.PI) / 180 + 1e-6);
});

it("pitch is zero on flat cells", () => {
  const map = miniMap(
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [false, false, false, false, false, false, false, false, false],
  );
  expect(targetPitchRad(map, 45, 45, 10, 0)).toBeCloseTo(0);
});

it("blendAngle reaches target in blendTime", () => {
  expect(blendAngle(0, 1, 0.1, 0.1)).toBeCloseTo(1);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/game/view3d/craftPose.test.ts`

- [ ] **Step 3: Implement craftPose.ts**

Lateral speed: nose `(cos(angle), sin(angle))`, right `(-sin, cos)` in engine space. `lat = vx * right.x + vy * right.y`. `bank = clamp(lat / max(cruiseProxy,1), -1, 1) * capRad` where `cruiseProxy = Math.hypot(vx,vy) || 1` is fine; use `lat / 200` clamped if speed is small.

Pitch: if `!isRamp(map,x,y)` return 0. Else `dir = rampDirection(...)`, `uphill = vx*dir.dx + vy*dir.dy`, `slope = Math.atan2(cliffHeight(cellSizeOf(map)), cellSizeOf(map))`, return `sign(uphill) * slope` (0 if almost still).

`blendAngle`: move current toward target by at most `|target-current|` and by `dt/blendTime` of the delta (linear).

- [ ] **Step 4: Implement crafts.ts**

`createCraftGroup(id)`:
- Shared cached geometries per id (module-level `Map`).
- Born: box fuselage 1.0×0.28×0.45, short wing boxes, amber `0xf59e0b` canopy.
- Killers: wider box 0.85×0.38×0.7, stubby wings, cyan `0x22d3ee`.
- Sorcerer: long box 1.25×0.2×0.32, larger wings, violet `0xa78bfa`.
- Wrap in a `Group`. Nose must point **+X** (engine angle 0 = east).
- Scale group so bounding length ≈ `VISUAL_LENGTH_MUL * craftWorldRadius(radiusTiles)` using the vulture’s `radiusTiles` from `getVulture(id)`.
- Add a child `Mesh` named `"shadow"`: dark transparent circle in XZ, `rotation.x = -π/2`, y ≈ 0.02, `renderOrder = -1`.
- On any throw: `createCapsuleCraft(getVulture(id).color)` — `CapsuleGeometry` + Lambert.

`applyCraftPose`:
- Store `userData.bank` / `userData.pitch` on the group; blend each frame.
- `pos = engineToThree(x, y, sampleTerrainY(map,x,y) + 2 + stillness * sin(time*4.2+hoverPhase)*1.2)`
- Yaw: engine `angle` 0 = +X. Three yaw around Y is `-angle` because Z is engine Y (left-handed vs right — verify with a unit test that angle 0 keeps the group’s +X aligned with world +X).
- Apply Euler `('YXZ', pitch, yaw, bank)`.
- Shadow: set world y to `sampleTerrainY + 0.05`, keep x/z with the craft; do not rotate with bank.

`crafts.test.ts`:

```ts
it("returns a Group for every vulture id", () => {
  for (const id of ["born_armor", "killers_pot", "sorcerer"] as const) {
    const g = createCraftGroup(id);
    expect(g.type).toBe("Group");
    expect(g.children.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/game/view3d/craftPose.test.ts src/game/view3d/crafts.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/view3d/craftPose.ts src/game/view3d/craftPose.test.ts src/game/view3d/crafts.ts src/game/view3d/crafts.test.ts
git commit -m "Add procedural craft meshes and bank/pitch pose."
```

---

### Task 6: Aim picker + projectiles

**Files:**
- Create: `src/game/view3d/aimPick.ts`
- Create: `src/game/view3d/aimPick.test.ts`
- Create: `src/game/view3d/projectiles.ts`

**Interfaces:**
- Consumes: `sampleTerrainY`, `engineToThree`, `threeToEngine`, `GameState` bullets/pickups
- Produces:
  - `export function pickAimOnHeightfield(map: MapDef, origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): { x: number; y: number } | null`
  - `export function createProjectileLayer(maxShots: number): { mesh: THREE.Object3D; sync(state: GameState): void; dispose(): void }`
  - `export function createPickupLayer(maxPickups: number): { mesh: THREE.Object3D; sync(state: GameState): void; dispose(): void }`

- [ ] **Step 1: Write failing aim tests**

Using the high-right 3×3 map from Task 2:

```ts
it("hits the high plane when the ray aims at a high cell", () => {
  const map = miniMap(
    [0, 0, 1, 0, 0, 1, 0, 0, 1],
    [false, false, false, false, false, false, false, false, false],
  );
  // Ray from above the high cell, straight down
  const hit = pickAimOnHeightfield(
    map,
    { x: 75, y: 80, z: 45 },
    { x: 0, y: -1, z: 0 },
  );
  expect(hit).not.toBeNull();
  expect(hit!.x).toBeCloseTo(75, 0);
  expect(hit!.y).toBeCloseTo(45, 0);
});

it("returns null when the ray misses the map", () => {
  const map = miniMap(new Array(9).fill(0), new Array(9).fill(false));
  const hit = pickAimOnHeightfield(
    map,
    { x: -100, y: 80, z: -100 },
    { x: 0, y: -1, z: 0 },
  );
  expect(hit).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/game/view3d/aimPick.test.ts`

- [ ] **Step 3: Implement pickAimOnHeightfield**

March the ray in small steps (`cellSize * 0.25`) from t=0 to a max distance of `map.width + map.height + 400`. At each point `(ox+dx*t, oz+dz*t)` convert to engine `(x,y)` via `threeToEngine`. If outside `[0,width]×[0,height]`, continue (do not return). When `origin.y + dir.y * t <= sampleTerrainY(map, x, y)`, return `{ x, y }`. If never, null.

- [ ] **Step 4: Implement projectile + pickup layers**

`createProjectileLayer`:
- `InstancedMesh` of a `SphereGeometry(1, 8, 8)`, capacity `maxShots` (200).
- `sync`: for each live bullet, set instance matrix at `engineToThree(b.x, b.y, sampleTerrainY + 3)`, scale by `b.radius * (b.drawScale || 1)`, color from `b.color`. `count = live`.
- Dead slots hidden by scaling to 0.

`createPickupLayer`:
- One `Mesh` (octahedron or sphere) per slot up to `maxPickups` (12), or a second instanced mesh.
- `sync`: live pickups at terrain Y + `4 + sin(bob)*1.5`. Eligible vs not is not required in 3D (HUD/engine already gate).

These two modules do not need a unit test beyond typecheck — they only mutate Three objects.

- [ ] **Step 5: Run aim tests + tsc**

Run: `npx vitest run src/game/view3d/aimPick.test.ts`  
Run: `npx tsc --noEmit`

Expected: both PASS

- [ ] **Step 6: Commit**

```bash
git add src/game/view3d/aimPick.ts src/game/view3d/aimPick.test.ts src/game/view3d/projectiles.ts
git commit -m "Add heightfield aim picking and instanced shot markers."
```

---

### Task 7: Play view + GameCanvas + HUD

**Files:**
- Create: `src/game/view3d/createPlayView.ts`
- Create: `src/game/view3d/index.ts`
- Create: `src/components/tm/PlayHud.tsx`
- Modify: `src/components/tm/GameCanvas.tsx`

**Interfaces:**
- Consumes: all `view3d` helpers, `GameState`, `getPlayer`, `setPointerWorld`
- Produces:
  - `export type PlayView = { resize(cssW: number, cssH: number, dpr: number): void; renderFrame(state: GameState, dt: number): void; pickAim(cssX: number, cssY: number, cssW: number, cssH: number): { x: number; y: number } | null; dispose(): void }`
  - `export function createPlayView(canvas: HTMLCanvasElement, map: MapDef): PlayView` — **throws** if `WebGLRenderer` cannot be constructed or `createTerrainMesh` throws
  - `export function PlayHud(props: { state: GameState | null; tick: number }): JSX.Element`

- [ ] **Step 1: Implement createPlayView.ts**

```ts
export function createPlayView(canvas: HTMLCanvasElement, map: MapDef): PlayView {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    throw new Error("WebGL을 시작할 수 없습니다");
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  const terrain = createTerrainMesh(map);
  scene.add(terrain);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
  sun.position.set(200, 320, 280);
  scene.add(sun);

  const crafts = new Map<string, THREE.Group>();
  const shots = createProjectileLayer(200);
  const picks = createPickupLayer(12);
  scene.add(shots.mesh);
  scene.add(picks.mesh);

  function ensureCraft(id: string, vultureId: VultureId): THREE.Group {
    let g = crafts.get(id);
    if (!g) {
      g = createCraftGroup(vultureId);
      crafts.set(id, g);
      scene.add(g);
    }
    return g;
  }

  return {
    resize(cssW, cssH, dpr) {
      const ratio = Math.min(dpr, MAX_DPR);
      renderer.setPixelRatio(ratio);
      renderer.setSize(cssW, cssH, false);
      const worldW = Math.min(map.width, VIEW_WORLD_WIDTH);
      const { halfW, halfH } = computeOrthoHalfExtents(cssW, cssH, worldW);
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    },
    renderFrame(state, dt) {
      const player = getPlayer(state);
      const px = player?.x ?? state.map.width / 2;
      const py = player?.y ?? state.map.height / 2;
      const pY = sampleTerrainY(state.map, px, py);
      const target = followTarget(px, py, pY, state.shake, state.time);
      const dist = 420;
      camera.position.set(
        target.x,
        target.y + dist * Math.sin(CAMERA_PITCH_RAD),
        target.z + dist * Math.cos(CAMERA_PITCH_RAD),
      );
      camera.lookAt(target.x, target.y, target.z);
      const live = new Set<string>();
      for (const p of state.pilots) {
        live.add(p.id);
        const g = ensureCraft(p.id, p.vultureId);
        g.visible = true;
        applyCraftPose(g, {
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          angle: p.angle,
          vultureId: p.vultureId,
          map: state.map,
          stillness: p.stillness,
          hoverPhase: p.hoverPhase,
          time: state.time,
          dt,
        });
        g.visible = p.respawn <= 0 || true;
        if (p.respawn > 0) g.visible = false;
      }
      for (const [id, g] of crafts) {
        if (!live.has(id)) g.visible = false;
      }
      shots.sync(state);
      picks.sync(state);
      renderer.render(scene, camera);
    },
    pickAim(cssX, cssY, cssW, cssH) {
      const ndcX = (cssX / cssW) * 2 - 1;
      const ndcY = -(cssY / cssH) * 2 + 1;
      const origin = new THREE.Vector3();
      const dir = new THREE.Vector3();
      origin.setFromMatrixPosition(camera.matrixWorld);
      dir.set(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
      return pickAimOnHeightfield(
        map,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
      );
    },
    dispose() {
      shots.dispose();
      picks.dispose();
      terrain.geometry.dispose();
      renderer.dispose();
    },
  };
}
```

Both layers already return `{ mesh, sync, dispose }` from Task 6. Do not rename them here.

`index.ts`:

```ts
export { createPlayView, type PlayView } from "./createPlayView";
```

- [ ] **Step 2: Implement PlayHud.tsx**

HTML overlay, `pointer-events-none` except nothing clickable (pause buttons stay in GameCanvas header).

Show when `state` is non-null:

- Top-left: `state.map.name` and scoreboard (`pilots` name + score), matching the old left list.
- Bottom-left: HP bar (`player.hp / maxHp`), `HIGH`/`LOW` from `sampleLevel`, SPEED = `Math.round(Math.hypot(player.vx, player.vy))`.
- Bottom weapon boxes 1–4: same rules as `render.ts` `drawHud` (default ∞, field `×ammo`, dim if empty).
- Center message if `messageT > 0`.
- Top-right 120×90 `<canvas>` minimap: draw `elevation` low/high/ramp with `map.ground/high/ramp`, player as a yellow dot. Rebuild the bitmap when `state.map` identity changes; each `tick` only updates the player pixel.

Use existing Tailwind tokens already in GameCanvas (`text-white`, `bg-black/70`, amber).

- [ ] **Step 3: Rewire GameCanvas.tsx**

Remove imports of `renderGame` and `loadGameAssets` / `warmGpuTextures`.

Keep one `<canvas>` but create it for WebGL:

```ts
const viewRef = useRef<PlayView | null>(null);
const [hudTick, setHudTick] = useState(0);
const [fatal, setFatal] = useState<string | null>(null);
```

Load sequence:

1. Fullscreen + resize (keep).
2. Audio preload (keep).
3. `const map = getMap(mapId)`.
4. `createGame` / `startMatch` with that map (`state.map = map`). Do **not** load SPR/TIL/craft frames.
5. Try `createPlayView(canvas, map)` inside try/catch. On throw: `setFatal(err.message)`, `setLoading(false)`, **do not** call `startMatch` again, **do not** start RAF. User uses existing “취소 · 메뉴로”.
6. `view.resize(cssW, cssH, dpr)` with `dpr = min(devicePixelRatio, 1.5)`.
7. Short settle: 8 frames of `update` + `view.renderFrame` (drop the 2.5s 2D texture settle and `warmGpuTextures`).
8. `acceptInput = true`, `setLoading(false)`.

RAF loop:

```ts
const dt = Math.min(0.033, (now - last) / 1000);
last = now;
if (dt > 0) update(state, dt);
view.renderFrame(state, dt);
if ((now / 100) | 0 !== ((now - dt * 1000) / 100) | 0) setHudTick((t) => t + 1);
```

Pointer: replace `screenToWorld` with `view.pickAim(...)`. If null, keep last pointer.

Resize: `view.resize` instead of 2D backing-store alloc. Still cache `rectLeft/rectTop` only on resize/scroll — not on mousemove.

Cleanup: `view.dispose()`.

JSX: render `<PlayHud state={stateRef.current} tick={hudTick} />` when `!loading && !fatal`. If `fatal`, show the error string in the existing load-error slot and the menu button (already there).

Do not import `@/game/render`.

- [ ] **Step 4: Typecheck and unit tests**

Run: `npx tsc --noEmit`  
Run: `npx vitest run`

Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/view3d/createPlayView.ts src/game/view3d/index.ts src/game/view3d/projectiles.ts src/components/tm/PlayHud.tsx src/components/tm/GameCanvas.tsx
git commit -m "Switch the play loop to a Three.js 2.5D view."
```

---

### Task 8: Failure, shake, and play verification

**Files:**
- Modify: `src/game/engine.ts` — `state.shake` decay already exists; ensure nothing in play sets shake via per-frame random. `damagePilot` may still add to `state.shake`; `followTarget` consumes it.
- Modify: `src/components/tm/GameCanvas.tsx` — fatal copy: `"WebGL을 시작할 수 없습니다"` / `"지형을 만들 수 없습니다"` (catch `createTerrainMesh` inside `createPlayView` and rethrow the second string).
- Modify: `src/routes/index.tsx` only if lobby copy still says “원본 MAP/TIL 지형” in a way that implies play uses TIL — update that one subtitle to mention 3D arena (do not rewrite the whole lobby).

**Interfaces:**
- Consumes: Task 7 `createPlayView` throw contract
- Produces: verified play path on 3 crafts × 3 maps; no `renderGame` in the play module graph

- [ ] **Step 1: Grep the play path**

Run: search `renderGame` and `loadGameAssets` under `src/components/tm/GameCanvas.tsx` and `src/game/view3d/`.

Expected: zero matches.

- [ ] **Step 2: Format-layer regression**

Run:

```bash
node scripts/verify-spr.mjs
node scripts/verify-map.mjs
node scripts/verify-re-formats.mjs
npx tsc --noEmit
npx vitest run
```

Expected: all FAIL 0 / PASS.

- [ ] **Step 3: Manual play checklist**

`npm run dev` → http://localhost:8080 → CONNECT.

For each craft (Born, Killers, Sorcerer) on Jade Basin:

- WASD: ~0.2s to cruise, ~0.12s to stop (not instant).
- Strafe while aiming: visible bank; Sorcerer more than Killers.
- Climb only on ramps; ramps look like slopes; cliffs show side faces.
- Mouse aim on high and low matches the shot direction.
- Keys 1–4, pickup, Esc, Q.

Then Scar Ridge + Iron Ring once each (terrain read). Finish one bot match to `killLimit`.

If WebGL cannot be forced, at least confirm the catch path exists (throw in `createPlayView` temporarily, then revert — do not commit the temporary throw).

- [ ] **Step 4: Commit only if Step 1–2 caused code fixes**

```bash
git add src/components/tm/GameCanvas.tsx src/game/view3d/createPlayView.ts src/routes/index.tsx
git commit -m "Harden WebGL failure handling and play-copy after the 3D switch."
```

If nothing changed, skip the commit.

---

## Self-review

**Spec coverage**

| Spec section | Task |
|--------------|------|
| Engine accel 0.20 / decel 0.12, diagonal, axis slide, bots same curve | 1 |
| Height mesh inputs, `CLIFF_H`, ramp direction | 2, 4 |
| Coords, 30° ortho, `VIEW_WORLD_WIDTH`, DPR 1.5, deterministic shake | 3, 7 |
| Terrain one-shot mesh, cliff faces, ramp slopes, biome colors | 4 |
| Procedural crafts, bank caps, pitch blend, shadow, capsule fallback | 5 |
| Aim ray → high/low, instanced shots, pickup tokens | 6 |
| `createPlayView`, HUD overlay, remove `render.ts` from play | 7 |
| WebGL/terrain fail → lobby, SFX fail continues, verification | 8 |
| No R3F, no GLTF, no `public/craft` in play, no dual renderer | 7–8 |
| Climb rules / loadouts / weapons unchanged | 1 (does not touch them) |

**Not in this plan (spec non-goals):** multiplayer, original-map play, SPR palette, weapon-body SPR in 3D.
