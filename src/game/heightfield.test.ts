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
  it("cliffHeight is 1.55 cell", () => {
    expect(cliffHeight(30)).toBeCloseTo(46.5);
  });

  it("flat low is 0 and flat high is cliff", () => {
    const map = miniMap(
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      [false, false, false, false, false, false, false, false, false],
    );
    expect(sampleTerrainY(map, 15, 45)).toBeCloseTo(0);
    expect(sampleTerrainY(map, 75, 45)).toBeCloseTo(46.5);
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
    expect(y1).toBeLessThan(46.5);
  });

  it("5-wide N–S ramp band slopes north/south, not west", () => {
    const cols = 7;
    const rows = 7;
    const elev: number[] = [];
    const ramps: boolean[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        elev.push(y === 0 ? 1 : 0);
        ramps.push(y >= 1 && y <= 5);
      }
    }
    const map = miniMap(elev, ramps);
    map.width = cols * 30;
    map.height = rows * 30;
    map.cols = cols;
    map.rows = rows;

    for (const [cx, cy] of [
      [3, 3],
      [1, 2],
      [5, 4],
    ] as const) {
      const dir = rampDirection(map, cx, cy);
      expect(dir.dx).toBe(0);
      expect(dir.dy).toBe(-1);
    }

    const midX = 3 * 30 + 15;
    const northY = 3 * 30 + 1;
    const southY = 4 * 30 - 1;
    const yNorth = sampleTerrainY(map, midX, northY);
    const ySouth = sampleTerrainY(map, midX, southY);
    expect(yNorth).toBeGreaterThan(ySouth);
  });

  it("N–S corridor with side flats still slopes toward the high rim", () => {
    const cols = 7;
    const rows = 7;
    const elev: number[] = [];
    const ramps: boolean[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        elev.push(y === 6 ? 1 : 0);
        ramps.push(x >= 2 && x <= 4 && y >= 1 && y <= 5);
      }
    }
    const map = miniMap(elev, ramps);
    map.width = cols * 30;
    map.height = rows * 30;
    map.cols = cols;
    map.rows = rows;
    const dir = rampDirection(map, 3, 3);
    expect(dir.dx).toBe(0);
    expect(dir.dy).toBe(1);
  });
});
