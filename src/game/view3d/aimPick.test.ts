import { describe, expect, it } from "vitest";
import type { MapDef } from "@/data/maps";
import { pickAimOnHeightfield } from "./aimPick";

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

describe("pickAimOnHeightfield", () => {
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
});
