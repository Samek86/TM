import { describe, expect, it } from "vitest";
import type { MapDef } from "@/data/maps";
import { cliffHeight, rampDirection, sampleTerrainY } from "./heightfield";

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

describe("heightfield", () => {
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
});
