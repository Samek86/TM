import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { cellSizeOf, sculptedHeight } from "@/game/heightfield";
import { threeToEngine } from "./coords";

const _ndc = new THREE.Vector2();
const _raycaster = new THREE.Raycaster();

/** Ortho pick: origin is the unprojected screen point; dir is camera forward. */
export function orthoAimRay(
  camera: THREE.Camera,
  ndcX: number,
  ndcY: number,
): { origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } {
  camera.updateMatrixWorld(true);
  _ndc.set(ndcX, ndcY);
  _raycaster.setFromCamera(_ndc, camera);
  const { origin, direction } = _raycaster.ray;
  // A negative near plane puts visible ground behind the camera plane, so back
  // the ray up that far before marching forward.
  const near = (camera as THREE.OrthographicCamera).near;
  const back = Number.isFinite(near) && near < 0 ? -near : 0;
  return {
    origin: {
      x: origin.x - direction.x * back,
      y: origin.y - direction.y * back,
      z: origin.z - direction.z * back,
    },
    dir: { x: direction.x, y: direction.y, z: direction.z },
  };
}

type Sample = { x: number; y: number; gap: number };

function sampleRay(
  map: MapDef,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  t: number,
): Sample | null {
  const wx = origin.x + dir.x * t;
  const wz = origin.z + dir.z * t;
  const { x, y } = threeToEngine(wx, wz);
  if (x < 0 || x > map.width || y < 0 || y > map.height) return null;
  return { x, y, gap: origin.y + dir.y * t - sculptedHeight(map, x, y) };
}

/** Bisection steps: turns the march step into a sub-0.01 unit hit point. */
const REFINE_STEPS = 12;

export function pickAimOnHeightfield(
  map: MapDef,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
): { x: number; y: number } | null {
  const step = cellSizeOf(map) * 0.25;
  const maxDist = map.width + map.height + 3000;
  let airT: number | null = null;
  for (let t = 0; t <= maxDist; t += step) {
    const s = sampleRay(map, origin, dir, t);
    if (!s) {
      airT = null;
      continue;
    }
    if (s.gap > 0) {
      airT = t;
      continue;
    }
    if (airT === null) return { x: s.x, y: s.y };
    // Marching alone snaps aim to `step` buckets, which reads as a
    // stair-stepped heading; bisect the bracket for a continuous point.
    let lo = airT;
    let hi = t;
    let best = s;
    for (let i = 0; i < REFINE_STEPS; i++) {
      const mid = (lo + hi) * 0.5;
      const m = sampleRay(map, origin, dir, mid);
      if (!m) break;
      if (m.gap > 0) {
        lo = mid;
      } else {
        hi = mid;
        best = m;
      }
    }
    return { x: best.x, y: best.y };
  }
  return null;
}
