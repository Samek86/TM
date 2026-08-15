import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { buildTerrainGeometry } from "./terrainMesh";

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

describe("terrainMesh", () => {
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
    expect(maxY).toBeCloseTo(46.5);
    expect(pos.count).toBeGreaterThan(8);
  });
});
