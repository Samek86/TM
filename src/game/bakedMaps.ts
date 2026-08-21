import type { MapDef } from "@/data/maps";
import { CLIFF_H, OUT_TILE } from "./terrainStyle";

export function bakedMapUrl(mapId: string): string {
  return `/assets/maps/${mapId}.jpg`;
}

export function bakedMapTopUrl(mapId: string): string {
  return `/assets/maps/${mapId}.top.jpg`;
}

export function isometricBakeSize(
  map: Pick<MapDef, "cols" | "rows">,
): { width: number; height: number } {
  return {
    width: map.cols * OUT_TILE,
    height: map.rows * OUT_TILE + CLIFF_H,
  };
}

export function topDownBakeSize(
  map: Pick<MapDef, "cols" | "rows">,
): { width: number; height: number } {
  return {
    width: map.cols * OUT_TILE,
    height: map.rows * OUT_TILE,
  };
}
