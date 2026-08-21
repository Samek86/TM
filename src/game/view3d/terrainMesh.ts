import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { cellSizeOf, cliffHeight, sculptedHeight } from "@/game/heightfield";
import {
  TERRAIN_TILE,
  createTerrainMaterial,
  type TerrainKit,
} from "./terrainTextures";

export type TerrainUvMode = "tile" | "map";

/** Grid samples per map cell. */
const SUB = 6;
/** How far the outer landscape reaches past the playfield, in world units. */
const SCENERY_REACH = 2400;
/** Ring spacing growth outward — dense near the border, coarse in the haze. */
const SCENERY_GROWTH = 1.6;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Value noise in −1..1. Deterministic so geometry is stable across loads. */
function noise2(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const top = a * (1 - u) + b * u;
  const bottom = c * (1 - u) + d * u;
  return (top * (1 - v) + bottom * v) * 2 - 1;
}

/** Two rotated octaves — keeps blend bands off the value-noise lattice. */
function fbm2(x: number, y: number): number {
  const rx = x * 0.8 + y * 0.6;
  const ry = -x * 0.6 + y * 0.8;
  return noise2(x, y) * 0.65 + noise2(rx * 2.11, ry * 2.11) * 0.35;
}

/**
 * Height for anything the camera can see. Inside the playfield this is the
 * gameplay heightfield; outside it sinks into a shallow moat and rises into
 * distant hills so the map never ends on a cut edge.
 */
export function sceneryHeight(map: MapDef, ex: number, ey: number): number {
  const cx = clamp(ex, 0, map.width);
  const cy = clamp(ey, 0, map.height);
  const edge = sculptedHeight(map, cx, cy);
  const out = Math.hypot(ex - cx, ey - cy);
  if (out <= 0) return edge;
  const cell = cellSizeOf(map);
  // The border height carries outward for a wandering distance before settling
  // to the surrounding plain. A fixed falloff draws a straight shelf around the
  // playfield, which is exactly what makes the map edge obvious.
  const reach = cell * (5 + 4 * (noise2(ex * 0.0055, ey * 0.0052) * 0.5 + 0.5));
  const fall = smoothstep(0, reach, out);
  const plain = cliffHeight(cell) * 0.3;
  const hills =
    noise2(ex * 0.0041, ey * 0.0037) *
      cell *
      0.95 *
      smoothstep(cell * 2, cell * 14, out) +
    noise2(ex * 0.0115 + 11, ey * 0.0103 - 5) *
      cell *
      0.4 *
      smoothstep(cell, cell * 6, out);
  return edge * (1 - fall) + plain * fall + hills;
}

const AO_DIRS = 8;
const AO_RADII = [0.55, 1.3, 2.6];
const AO_STRENGTH = 0.45;

/**
 * Horizon-sampled occlusion on a half-cell grid. Baked once per map because
 * the shape never moves; vertices read it back bilinearly.
 */
function buildAoGrid(map: MapDef): {
  values: Float32Array;
  nx: number;
  nz: number;
  step: number;
} {
  const cell = cellSizeOf(map);
  const step = cell / 2;
  const nx = Math.ceil(map.width / step) + 1;
  const nz = Math.ceil(map.height / step) + 1;
  const values = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) {
    const ey = Math.min(map.height, iz * step);
    for (let ix = 0; ix < nx; ix++) {
      const ex = Math.min(map.width, ix * step);
      const h = sceneryHeight(map, ex, ey);
      let occ = 0;
      for (let d = 0; d < AO_DIRS; d++) {
        const a = (d / AO_DIRS) * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        let rise = 0;
        for (const r of AO_RADII) {
          const dist = r * cell;
          const dh = sceneryHeight(map, ex + dx * dist, ey + dy * dist) - h;
          rise = Math.max(rise, dh / dist);
        }
        occ += clamp(rise, 0, 1.2) / 1.2;
      }
      values[iz * nx + ix] = occ / AO_DIRS;
    }
  }
  // Bilinear reads of a raw half-cell grid leave visible creases; one box pass
  // is enough to make the shading read as soft cavity light.
  const blurred = new Float32Array(values.length);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      let sum = 0;
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const sx = ix + dx;
          const sz = iz + dz;
          if (sx < 0 || sz < 0 || sx >= nx || sz >= nz) continue;
          sum += values[sz * nx + sx]!;
          n += 1;
        }
      }
      blurred[iz * nx + ix] = sum / n;
    }
  }
  return { values: blurred, nx, nz, step };
}

type AoGrid = ReturnType<typeof buildAoGrid>;

const aoCache = new WeakMap<MapDef, AoGrid>();

function aoGridOf(map: MapDef): AoGrid {
  let grid = aoCache.get(map);
  if (!grid) {
    grid = buildAoGrid(map);
    aoCache.set(map, grid);
  }
  return grid;
}

function aoAt(grid: AoGrid, ex: number, ey: number): number {
  const fx = clamp(ex / grid.step, 0, grid.nx - 1);
  const fy = clamp(ey / grid.step, 0, grid.nz - 1);
  const x0 = Math.min(grid.nx - 2, Math.floor(fx));
  const y0 = Math.min(grid.nz - 2, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const v = grid.values;
  const top = v[y0 * grid.nx + x0]! * (1 - tx) + v[y0 * grid.nx + x0 + 1]! * tx;
  const bottom =
    v[(y0 + 1) * grid.nx + x0]! * (1 - tx) +
    v[(y0 + 1) * grid.nx + x0 + 1]! * tx;
  const occ = top * (1 - ty) + bottom * ty;
  return 1 - AO_STRENGTH * Math.pow(occ, 0.85);
}

/** Bilinear ramp membership over cell centers — 0 on flats, 1 mid-ramp. */
function rampWeightAt(map: MapDef, ex: number, ey: number): number {
  if (ex < 0 || ey < 0 || ex > map.width || ey > map.height) return 0;
  const cols = map.cols;
  const rows = map.rows;
  const fx = (ex / map.width) * cols - 0.5;
  const fy = (ey / map.height) * rows - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (cx: number, cy: number) => {
    const ix = clamp(cx, 0, cols - 1);
    const iy = clamp(cy, 0, rows - 1);
    return map.ramps[iy * cols + ix] ? 1 : 0;
  };
  const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
  const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * Per-vertex blend of turf / plateau / rock / ramp. Slope drives rock, height
 * drives plateau, and a noise offset keeps the bands from following the grid.
 */
function splatAt(
  map: MapDef,
  ex: number,
  ey: number,
  slope: number,
  h: number,
): [number, number, number, number] {
  const H = cliffHeight(cellSizeOf(map));
  const jitter = fbm2(ex * 0.019, ey * 0.017);
  const ramp = rampWeightAt(map, ex, ey);
  const cliff =
    smoothstep(0.78 + jitter * 0.14, 1.5 + jitter * 0.14, slope) * (1 - ramp);
  const high =
    smoothstep(0.42 + jitter * 0.09, 0.8 + jitter * 0.09, h / H) *
    (1 - cliff) *
    (1 - ramp);
  // Worn dirt tracks the climb itself: strong on the incline, patchy where a
  // wide ramp field flattens out, so routes read without paving the map.
  const worn = clamp(
    0.62 +
      0.34 * smoothstep(0.04, 0.26, slope) +
      fbm2(ex * 0.022, ey * 0.02) * 0.22,
    0,
    1,
  );
  const rampW = ramp * worn * (1 - cliff * 0.5);
  const ground = Math.max(0, 1 - cliff - high - rampW);
  const sum = cliff + high + rampW + ground;
  return [ground / sum, high / sum, cliff / sum, rampW / sum];
}

type Keep = (x0: number, x1: number, z0: number, z1: number) => boolean;

/**
 * Indexed grid over the given sample lines. Vertices are shared, so adjacent
 * quads cannot crack, and normals come from the analytic slope rather than
 * per-triangle faces — no faceting.
 */
function buildGrid(
  map: MapDef,
  xs: readonly number[],
  zs: readonly number[],
  keep: Keep | null,
  uvMode: TerrainUvMode,
): THREE.BufferGeometry {
  const nx = xs.length;
  const nz = zs.length;
  const slot = new Int32Array(nx * nz).fill(-1);
  const quads: number[] = [];
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      if (keep && !keep(xs[ix]!, xs[ix + 1]!, zs[iz]!, zs[iz + 1]!)) continue;
      quads.push(iz * nx + ix);
      for (const corner of [0, 1, nx, nx + 1]) slot[iz * nx + ix + corner] = 0;
    }
  }
  let count = 0;
  for (let i = 0; i < slot.length; i++) {
    if (slot[i] === 0) slot[i] = count++;
  }

  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const splats = new Float32Array(count * 4);
  const shades = new Float32Array(count * 3);
  const ao = aoGridOf(map);
  const eps = Math.max(1, cellSizeOf(map) * 0.1);
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const v = slot[iz * nx + ix]!;
      if (v < 0) continue;
      const ex = xs[ix]!;
      const ey = zs[iz]!;
      const h = sceneryHeight(map, ex, ey);
      const gx =
        (sceneryHeight(map, ex + eps, ey) - sceneryHeight(map, ex - eps, ey)) /
        (2 * eps);
      const gz =
        (sceneryHeight(map, ex, ey + eps) - sceneryHeight(map, ex, ey - eps)) /
        (2 * eps);
      const inv = 1 / Math.hypot(gx, 1, gz);
      positions[v * 3] = ex;
      positions[v * 3 + 1] = h;
      positions[v * 3 + 2] = ey;
      normals[v * 3] = -gx * inv;
      normals[v * 3 + 1] = inv;
      normals[v * 3 + 2] = -gz * inv;
      if (uvMode === "map") {
        uvs[v * 2] = map.width > 0 ? ex / map.width : 0;
        uvs[v * 2 + 1] = map.height > 0 ? ey / map.height : 0;
      } else {
        uvs[v * 2] = ex / TERRAIN_TILE;
        uvs[v * 2 + 1] = ey / TERRAIN_TILE;
      }
      const w = splatAt(map, ex, ey, Math.hypot(gx, gz), h);
      splats.set(w, v * 4);
      const shade = aoAt(ao, ex, ey);
      shades[v * 3] = shade;
      shades[v * 3 + 1] = shade;
      shades[v * 3 + 2] = shade;
    }
  }

  const indices = new Uint32Array(quads.length * 6);
  let o = 0;
  for (const q of quads) {
    const a = slot[q]!;
    const b = slot[q + nx]!;
    const c = slot[q + nx + 1]!;
    const d = slot[q + 1]!;
    indices[o++] = a;
    indices[o++] = b;
    indices[o++] = c;
    indices[o++] = a;
    indices[o++] = c;
    indices[o++] = d;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("aSplat", new THREE.BufferAttribute(splats, 4));
  geometry.setAttribute("color", new THREE.BufferAttribute(shades, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function playLines(span: number, steps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push((i / steps) * span);
  return out;
}

/** Play lines plus rings that stretch outward to the fog. */
function sceneryLines(span: number, steps: number): number[] {
  const inner = playLines(span, steps);
  const base = span / steps;
  const before: number[] = [];
  const after: number[] = [];
  let step = base;
  let out = 0;
  while (out < SCENERY_REACH) {
    out += step;
    before.push(-out);
    after.push(span + out);
    step *= SCENERY_GROWTH;
  }
  return [...before.reverse(), ...inner, ...after];
}

export function buildTerrainGeometry(
  map: MapDef,
  uvMode: TerrainUvMode = "tile",
): THREE.BufferGeometry {
  return buildGrid(
    map,
    playLines(map.width, map.cols * SUB),
    playLines(map.height, map.rows * SUB),
    null,
    uvMode,
  );
}

/** Everything around the playfield: moat, foothills, distant ridges. */
export function buildSceneryGeometry(map: MapDef): THREE.BufferGeometry {
  const outside: Keep = (x0, x1, z0, z1) =>
    x0 < 0 || z0 < 0 || x1 > map.width || z1 > map.height;
  return buildGrid(
    map,
    sceneryLines(map.width, map.cols * SUB),
    sceneryLines(map.height, map.rows * SUB),
    outside,
    "tile",
  );
}

export type TerrainScenery = {
  group: THREE.Group;
  dispose(): void;
};

/**
 * Playfield and surrounding landscape as one group sharing a single material,
 * so the map border is just more ground instead of a visible edge.
 */
export function createTerrainScenery(
  map: MapDef,
  kit: TerrainKit | null = null,
  shadows: { playCast?: boolean; sceneryCast?: boolean } = {},
): TerrainScenery {
  const material = createTerrainMaterial(kit);
  const play = new THREE.Mesh(buildTerrainGeometry(map), material);
  play.receiveShadow = true;
  // Cliffs must cast on desktop: without it the terrain lights uniformly
  // and every bank reads as paint on a flat sheet. The outer ring never
  // casts — it is tens of thousands of tris sitting off-screen.
  play.castShadow = shadows.playCast ?? true;
  play.name = "terrain";
  const around = new THREE.Mesh(buildSceneryGeometry(map), material);
  around.receiveShadow = true;
  around.castShadow = shadows.sceneryCast ?? false;
  around.name = "scenery";
  const group = new THREE.Group();
  group.add(play);
  group.add(around);
  return {
    group,
    dispose() {
      play.geometry.dispose();
      around.geometry.dispose();
      material.dispose();
    },
  };
}
