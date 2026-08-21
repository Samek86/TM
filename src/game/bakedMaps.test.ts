import { describe, expect, it } from "vitest";
import { MAPS } from "@/data/maps";
import {
  bakedMapTopUrl,
  bakedMapUrl,
  isometricBakeSize,
  topDownBakeSize,
} from "./bakedMaps";
import { CLIFF_H, OUT_TILE } from "./terrainStyle";

describe("baked map URLs", () => {
  it("points each play map at isometric and top-down JPEGs", () => {
    expect(MAPS.map((m) => m.id)).toEqual([
      "jade_basin",
      "scar_ridge",
      "iron_ring",
    ]);
    for (const map of MAPS) {
      expect(bakedMapUrl(map.id)).toBe(`/assets/maps/${map.id}.jpg`);
      expect(bakedMapTopUrl(map.id)).toBe(`/assets/maps/${map.id}.top.jpg`);
    }
  });
});

describe("baked map sizes", () => {
  it("isometric canvas includes the cliff strip; top-down does not", () => {
    const jade = MAPS.find((m) => m.id === "jade_basin")!;
    expect(isometricBakeSize(jade)).toEqual({
      width: jade.cols * OUT_TILE,
      height: jade.rows * OUT_TILE + CLIFF_H,
    });
    expect(topDownBakeSize(jade)).toEqual({
      width: jade.cols * OUT_TILE,
      height: jade.rows * OUT_TILE,
    });
    expect(OUT_TILE).toBe(28);
    expect(CLIFF_H).toBe(18);
  });
});
