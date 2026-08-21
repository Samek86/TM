import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { cellSizeOf } from "@/game/heightfield";
import { biomeForMapId, type BiomeId } from "@/game/terrainStyle";
import { sceneryHeight } from "./terrainMesh";

/** Wall height in map cells — a short veil, not a skyline. */
export const BOUNDARY_WALL_CELLS = 1.7;
/** How far the ground marking reaches inward, in map cells. */
const BAND_CELLS = 0.55;
/** Spacing between fence posts, in map cells. */
const POST_CELLS = 4;

/**
 * Inset of the fence from the map rect. Mirrors the engine's `inMapBounds`
 * margin so the wall stands exactly where a craft is turned back.
 */
export function boundaryMargin(map: MapDef): number {
  return Math.max(4, (map.cellSize ?? 16) * 0.2);
}

export type RingPoint = { x: number; z: number };

/** Closed walk around the rim, dense enough to follow the terrain profile. */
export function boundaryRing(map: MapDef): RingPoint[] {
  const m = boundaryMargin(map);
  const x0 = m;
  const x1 = map.width - m;
  const z0 = m;
  const z1 = map.height - m;
  const step = cellSizeOf(map) / 2;
  const out: RingPoint[] = [];
  const run = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    withEnd: boolean,
  ) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    const last = withEnd ? n : n - 1;
    for (let i = 0; i <= last; i++) {
      const t = i / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t });
    }
  };
  run(x0, z0, x1, z0, false);
  run(x1, z0, x1, z1, false);
  run(x1, z1, x0, z1, false);
  run(x0, z1, x0, z0, true);
  return out;
}

/** Inward normal of the rim at a sample, used by the ground marking. */
function inwardAt(map: MapDef, p: RingPoint): RingPoint {
  const m = boundaryMargin(map);
  const nx =
    Math.abs(p.x - m) < 1e-6 ? 1 : Math.abs(p.x - (map.width - m)) < 1e-6 ? -1 : 0;
  const nz =
    Math.abs(p.z - m) < 1e-6 ? 1 : Math.abs(p.z - (map.height - m)) < 1e-6 ? -1 : 0;
  // Corners get both; normalising keeps the band the same width all the way.
  const len = Math.hypot(nx, nz) || 1;
  return { x: nx / len, z: nz / len };
}

const ACCENT: Record<BiomeId, number> = {
  jungle: 0x4bf5cf,
  desert: 0xffc14d,
  outpost: 0x74d0ff,
  default: 0x74d0ff,
};

const WALL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4( position, 1.0 );
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WALL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform vec3 uFocus;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    // A thin haze that thickens at the foot. From mid-map it should read as a
    // line, not a neon slab; it only fills in as the craft closes on the rim.
    float foot = pow( 1.0 - vUv.y, 2.6 );
    float bars = smoothstep( 0.47, 0.5, abs( fract( vUv.x ) - 0.5 ) );
    float rungs = smoothstep( 0.48, 0.5, abs( fract( vUv.y * 2.0 ) - 0.5 ) );
    float grid = max( bars, rungs * 0.28 );
    float scan = 0.5 + 0.5 * sin( vUv.y * 5.0 - uTime * 1.0 + vUv.x * 1.2 );
    float near = exp( -length( vWorld.xz - uFocus.xz ) / 220.0 );
    float alpha = ( foot * 0.20 + grid * 0.10 + scan * 0.015 ) * ( 0.14 + 0.62 * near );
    vec3 rgb = uColor * ( 0.28 + 0.28 * grid + 0.20 * foot );
    gl_FragColor = vec4( rgb, clamp( alpha, 0.0, 0.38 ) );
  }
`;

const BAND_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform vec3 uFocus;
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    // Seen straight down, the wall is edge-on — this stripe on the dirt is
    // what actually tells the player where the arena ends.
    float edge = pow( 1.0 - vUv.y, 1.9 );
    float dash = smoothstep( 0.45, 0.5, abs( fract( vUv.x * 0.5 - uTime * 0.035 ) - 0.5 ) );
    float near = exp( -length( vWorld.xz - uFocus.xz ) / 240.0 );
    float alpha = ( edge * 0.20 + dash * edge * 0.12 ) * ( 0.22 + 0.5 * near );
    gl_FragColor = vec4( uColor * ( 0.4 + 0.25 * dash ), clamp( alpha, 0.0, 0.32 ) );
  }
`;

function ribbon(
  map: MapDef,
  ring: readonly RingPoint[],
  lowOf: (p: RingPoint, h: number) => THREE.Vector3,
  highOf: (p: RingPoint, h: number) => THREE.Vector3,
  uScale: number,
): THREE.BufferGeometry {
  const n = ring.length;
  const positions = new Float32Array(n * 2 * 3);
  const uvs = new Float32Array(n * 2 * 2);
  let u = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i]!;
    if (i > 0) {
      const q = ring[i - 1]!;
      u += Math.hypot(p.x - q.x, p.z - q.z) / uScale;
    }
    const h = sceneryHeight(map, p.x, p.z);
    const lo = lowOf(p, h);
    const hi = highOf(p, h);
    positions.set([lo.x, lo.y, lo.z], i * 6);
    positions.set([hi.x, hi.y, hi.z], i * 6 + 3);
    uvs.set([u, 0, u, 1], i * 4);
  }
  const indices = new Uint32Array((n - 1) * 6);
  let o = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices[o++] = a;
    indices[o++] = b;
    indices[o++] = d;
    indices[o++] = a;
    indices[o++] = d;
    indices[o++] = c;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export type MapBoundary = {
  group: THREE.Group;
  update(time: number, focusX: number, focusZ: number): void;
  dispose(): void;
};

/**
 * Containment fence on the map rim: a short veil, a stripe on the ground, and
 * posts that carry the line around corners. All three stay quiet from mid-map
 * and only brighten as the craft approaches, so the limit is never a surprise.
 */
export function createMapBoundary(
  map: MapDef,
  biome: BiomeId = biomeForMapId(map.id).id,
): MapBoundary {
  const cell = cellSizeOf(map);
  const ring = boundaryRing(map);
  const color = new THREE.Color(ACCENT[biome]);
  const shared = {
    uColor: { value: color },
    uTime: { value: 0 },
    uFocus: { value: new THREE.Vector3(map.width / 2, 0, map.height / 2) },
  };

  const wallMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: shared.uColor,
      uTime: shared.uTime,
      uFocus: shared.uFocus,
    },
    vertexShader: WALL_VERT,
    fragmentShader: WALL_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const wall = new THREE.Mesh(
    ribbon(
      map,
      ring,
      (p, h) => new THREE.Vector3(p.x, h - cell * 0.15, p.z),
      (p, h) => new THREE.Vector3(p.x, h + cell * BOUNDARY_WALL_CELLS, p.z),
      cell * 2,
    ),
    wallMat,
  );
  wall.name = "boundary-wall";
  wall.frustumCulled = false;

  const bandMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: shared.uColor,
      uTime: shared.uTime,
      uFocus: shared.uFocus,
    },
    vertexShader: WALL_VERT,
    fragmentShader: BAND_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const lift = Math.max(0.6, cell * 0.05);
  const band = new THREE.Mesh(
    ribbon(
      map,
      ring,
      (p, h) => new THREE.Vector3(p.x, h + lift, p.z),
      (p) => {
        const n = inwardAt(map, p);
        const ix = p.x + n.x * cell * BAND_CELLS;
        const iz = p.z + n.z * cell * BAND_CELLS;
        return new THREE.Vector3(ix, sceneryHeight(map, ix, iz) + lift, iz);
      },
      cell * 2,
    ),
    bandMat,
  );
  band.name = "boundary-band";
  band.frustumCulled = false;

  const spacing = cell * POST_CELLS;
  const sites: RingPoint[] = [];
  let travelled = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    if (i > 0) {
      const q = ring[i - 1]!;
      travelled += Math.hypot(p.x - q.x, p.z - q.z);
    }
    if (i === 0 || travelled >= spacing) {
      sites.push(p);
      travelled = 0;
    }
  }
  const postH = cell * BOUNDARY_WALL_CELLS * 0.5;
  const postGeo = new THREE.CylinderGeometry(cell * 0.05, cell * 0.075, postH, 6);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x2b3138,
    roughness: 0.55,
    metalness: 0.5,
    emissive: color.clone().multiplyScalar(0.1),
  });
  const posts = new THREE.InstancedMesh(postGeo, postMat, sites.length);
  posts.name = "boundary-posts";
  posts.castShadow = true;
  posts.frustumCulled = false;
  const beaconGeo = new THREE.OctahedronGeometry(cell * 0.07, 0);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0x101418,
    emissive: color,
    emissiveIntensity: 0.32,
    roughness: 0.5,
  });
  const beacons = new THREE.InstancedMesh(beaconGeo, beaconMat, sites.length);
  beacons.name = "boundary-beacons";
  beacons.frustumCulled = false;
  const m4 = new THREE.Matrix4();
  sites.forEach((p, i) => {
    const h = sceneryHeight(map, p.x, p.z);
    m4.makeTranslation(p.x, h + postH / 2, p.z);
    posts.setMatrixAt(i, m4);
    m4.makeTranslation(p.x, h + postH + cell * 0.08, p.z);
    beacons.setMatrixAt(i, m4);
  });
  posts.instanceMatrix.needsUpdate = true;
  beacons.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.name = "boundary";
  group.add(wall);
  group.add(band);
  group.add(posts);
  group.add(beacons);

  return {
    group,
    update(time, focusX, focusZ) {
      shared.uTime.value = time;
      shared.uFocus.value.set(focusX, 0, focusZ);
      let nearest = Infinity;
      for (const p of sites) {
        const d = Math.hypot(p.x - focusX, p.z - focusZ);
        if (d < nearest) nearest = d;
      }
      const wake = Math.exp(-nearest / (cell * 8));
      beaconMat.emissiveIntensity = 0.12 + 0.38 * wake;
      postMat.emissive.copy(color).multiplyScalar(0.04 + 0.1 * wake);
    },
    dispose() {
      wall.geometry.dispose();
      wallMat.dispose();
      band.geometry.dispose();
      bandMat.dispose();
      postGeo.dispose();
      postMat.dispose();
      beaconGeo.dispose();
      beaconMat.dispose();
      posts.dispose();
      beacons.dispose();
    },
  };
}
