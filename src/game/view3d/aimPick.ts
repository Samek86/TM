import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { cellSizeOf, sampleTerrainY } from "@/game/heightfield";
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
  return {
    origin: { x: origin.x, y: origin.y, z: origin.z },
    dir: { x: direction.x, y: direction.y, z: direction.z },
  };
}

export function pickAimOnHeightfield(
  map: MapDef,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
): { x: number; y: number } | null {
  const step = cellSizeOf(map) * 0.25;
  const maxDist = map.width + map.height + 400;
  for (let t = 0; t <= maxDist; t += step) {
    const wx = origin.x + dir.x * t;
    const wz = origin.z + dir.z * t;
    const { x, y } = threeToEngine(wx, wz);
    if (x < 0 || x > map.width || y < 0 || y > map.height) continue;
    if (origin.y + dir.y * t <= sampleTerrainY(map, x, y)) {
      return { x, y };
    }
  }
  return null;
}
