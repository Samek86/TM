import { describe, expect, it } from "vitest";
import type { MapDef } from "@/data/maps";
import { blendAngle, targetBankRad, targetPitchRad } from "./craftPose";

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

describe("craftPose", () => {
  it("banks when strafing relative to aim", () => {
    // aim +X (angle 0), velocity +Y (south / left of nose in y-down)
    const bank = targetBankRad(0, 100, 0, 18);
    expect(Math.abs(bank)).toBeGreaterThan(0.05);
    expect(Math.abs(bank)).toBeLessThanOrEqual((18 * Math.PI) / 180 + 1e-6);
  });

  it("pitch is zero on flat cells", () => {
    const map = miniMap(
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    expect(targetPitchRad(map, 45, 45, 10, 0)).toBeCloseTo(0);
  });

  it("blendAngle reaches target in blendTime", () => {
    expect(blendAngle(0, 1, 0.1, 0.1)).toBeCloseTo(1);
  });
});
