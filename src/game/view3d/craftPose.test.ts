import { describe, expect, it } from "vitest";
import type { MapDef } from "@/data/maps";
import {
  YAW_MAX_TURN_RATE,
  blendAngle,
  smoothYaw,
  targetBankRad,
  targetPitchRad,
  wrapAngle,
} from "./craftPose";

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

describe("wrapAngle", () => {
  it("folds full turns onto (-PI, PI]", () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(Math.PI * 2 + 0.3)).toBeCloseTo(0.3);
    expect(wrapAngle(-Math.PI * 2 - 0.3)).toBeCloseTo(-0.3);
    expect(Math.abs(wrapAngle(Math.PI))).toBeCloseTo(Math.PI);
  });
});

describe("smoothYaw", () => {
  it("turns the short way across the wrap seam", () => {
    const next = smoothYaw(Math.PI - 0.1, -Math.PI + 0.1, 1 / 60);
    expect(next).toBeGreaterThan(Math.PI - 0.1);
  });

  it("closes on the target without overshooting", () => {
    let yaw = 0;
    for (let i = 0; i < 200; i++) yaw = smoothYaw(yaw, 1, 1 / 60);
    expect(yaw).toBeCloseTo(1, 5);
  });

  it("caps a mouse flick to the turn-rate ceiling", () => {
    const dt = 1 / 60;
    const step = Math.abs(wrapAngle(smoothYaw(0, Math.PI * 0.9, dt)));
    expect(step).toBeLessThanOrEqual(YAW_MAX_TURN_RATE * dt + 1e-9);
    expect(step).toBeGreaterThan(0);
  });

  it("is frame-rate independent over the same wall-clock span", () => {
    let slow = 0;
    for (let i = 0; i < 30; i++) slow = smoothYaw(slow, 0.5, 1 / 30);
    let fast = 0;
    for (let i = 0; i < 120; i++) fast = smoothYaw(fast, 0.5, 1 / 120);
    expect(slow).toBeCloseTo(fast, 4);
  });
});
