import { describe, expect, it } from "vitest";
import type { MapDef } from "@/data/maps";
import {
  cliffHeight,
  cornerHeight,
  rampDirection,
  sampleTerrainY,
  sculptedHeight,
} from "./heightfield";

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
    const yNearHigh = sampleTerrainY(map, midX, 1 * 30 + 8);
    const yMid = sampleTerrainY(map, midX, 3 * 30 + 15);
    const yNearLow = sampleTerrainY(map, midX, 5 * 30 + 22);
    expect(yNearHigh).toBeGreaterThan(yMid);
    expect(yMid).toBeGreaterThan(yNearLow);
    expect(yNearHigh).toBeGreaterThan(cliffHeight(30) * 0.45);
    expect(yNearLow).toBeLessThan(cliffHeight(30) * 0.55);
  });

  it("ramp corners meet the plateau and the valley", () => {
    const elev = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    const ramps = [false, true, false, false, true, false, false, true, false];
    const map = miniMap(elev, ramps);
    const H = cliffHeight(30);
    expect(cornerHeight(map, 1, 1)).toBeCloseTo(0);
    expect(cornerHeight(map, 2, 1)).toBeCloseTo(H);
    expect(cornerHeight(map, 1, 2)).toBeCloseTo(0);
    expect(cornerHeight(map, 2, 2)).toBeCloseTo(H);
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

  it("sculpted high interior stays up and valley stays down", () => {
    const map = miniMap(
      [1, 1, 1, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const H = cliffHeight(30);
    expect(sculptedHeight(map, 15, 8)).toBeCloseTo(H);
    expect(sculptedHeight(map, 45, 75)).toBeCloseTo(0);
  });

  it("sculpted cliff is a bank, not a hard step", () => {
    const map = miniMap(
      [1, 1, 1, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const H = cliffHeight(30);
    const rim = sculptedHeight(map, 45, 28);
    expect(rim).toBeGreaterThan(0);
    expect(rim).toBeLessThan(H);
    expect(sculptedHeight(map, 45, 32)).toBeCloseTo(0);
  });

  it("sculpted ramp still climbs toward high", () => {
    const map = miniMap(
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      [false, true, false, false, true, false, false, true, false],
    );
    const y0 = sculptedHeight(map, 32, 45);
    const y1 = sculptedHeight(map, 58, 45);
    expect(y0).toBeLessThan(y1);
  });
});
