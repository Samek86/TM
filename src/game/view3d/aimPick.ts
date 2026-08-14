import type { MapDef } from "@/data/maps";
import { cellSizeOf, sampleTerrainY } from "@/game/heightfield";
import { threeToEngine } from "./coords";

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
