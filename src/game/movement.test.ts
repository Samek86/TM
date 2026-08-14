import { describe, expect, it } from "vitest";
import { ACCEL_TIME, DECEL_TIME, approachVelocity, tryStep } from "./movement";

describe("approachVelocity", () => {
  it("reaches cruise from rest in ACCEL_TIME", () => {
    const cruise = 200;
    let vx = 0;
    let vy = 0;
    const steps = 20;
    const dt = ACCEL_TIME / steps;
    for (let i = 0; i < steps; i++) {
      ({ vx, vy } = approachVelocity(vx, vy, cruise, 0, cruise, dt));
    }
    expect(vx).toBeCloseTo(cruise, 5);
    expect(vy).toBeCloseTo(0, 5);
  });

  it("stops from cruise in DECEL_TIME", () => {
    const cruise = 200;
    let vx = cruise;
    let vy = 0;
    const steps = 20;
    const dt = DECEL_TIME / steps;
    for (let i = 0; i < steps; i++) {
      ({ vx, vy } = approachVelocity(vx, vy, 0, 0, cruise, dt));
    }
    expect(vx).toBeCloseTo(0, 5);
    expect(vy).toBeCloseTo(0, 5);
  });

  it("keeps diagonal wish at cruise magnitude", () => {
    const cruise = 100;
    const s = cruise / Math.SQRT2;
    const { vx, vy } = approachVelocity(0, 0, s, s, cruise, ACCEL_TIME);
    expect(Math.hypot(vx, vy)).toBeCloseTo(cruise, 5);
  });
});

describe("tryStep", () => {
  it("moves freely when unblocked", () => {
    const r = tryStep(10, 10, 20, 0, 0.1, () => true);
    expect(r.x).toBeCloseTo(12);
    expect(r.y).toBeCloseTo(10);
    expect(r.vx).toBe(20);
    expect(r.moved).toBe(true);
  });

  it("zeros the blocked axis and slides on the free axis", () => {
    const r = tryStep(0, 0, 10, 10, 1, (x0, y0, x1, y1) => {
      if (x1 !== x0 && y1 !== y0) return false; // block diagonal
      if (x1 !== x0) return false; // block X
      return true; // allow Y
    });
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(10);
    expect(r.vx).toBe(0);
    expect(r.vy).toBe(10);
    expect(r.moved).toBe(true);
  });

  it("stops completely when both axes blocked", () => {
    const r = tryStep(0, 0, 10, 5, 1, () => false);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.vx).toBe(0);
    expect(r.vy).toBe(0);
    expect(r.moved).toBe(false);
  });
});
