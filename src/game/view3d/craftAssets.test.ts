import { describe, expect, it } from "vitest";
import {
  CRAFT_YAW_DIRS,
  yawFrameIndex,
  yawFrameResidual,
} from "./craftAssets";

const step = (Math.PI * 2) / CRAFT_YAW_DIRS;
const quarter = CRAFT_YAW_DIRS / 4;

describe("yawFrameIndex", () => {
  it("maps east / south / west / north onto the yaw sheet", () => {
    expect(yawFrameIndex(0)).toBe(0);
    expect(yawFrameIndex(Math.PI / 2)).toBe(quarter);
    expect(yawFrameIndex(Math.PI)).toBe(quarter * 2);
    expect(yawFrameIndex(-Math.PI / 2)).toBe(quarter * 3);
  });

  it("honours a short sheet's own direction count", () => {
    expect(yawFrameIndex(Math.PI / 2, 16)).toBe(4);
    expect(yawFrameIndex(Math.PI / 2, 8)).toBe(2);
  });

  it("advances one frame per sector", () => {
    for (let i = 0; i < CRAFT_YAW_DIRS; i++) {
      expect(yawFrameIndex(i * step)).toBe(i);
    }
  });
});

describe("yawFrameResidual", () => {
  const half = step / 2;

  it("is zero on sector centers", () => {
    expect(yawFrameResidual(0)).toBeCloseTo(0);
    expect(yawFrameResidual(Math.PI / 2)).toBeCloseTo(0);
    expect(yawFrameResidual(Math.PI)).toBeCloseTo(0);
    expect(yawFrameResidual(-Math.PI / 2)).toBeCloseTo(0);
  });

  it("returns the leftover heading inside the chosen sector", () => {
    expect(yawFrameResidual(0.05)).toBeCloseTo(0.05);
    expect(yawFrameResidual(step + 0.05)).toBeCloseTo(0.05);
  });

  it("stays within half a sector, including wrap near east", () => {
    const nearWestOfEast = Math.PI * 2 - 0.04;
    expect(yawFrameIndex(nearWestOfEast)).toBe(0);
    expect(yawFrameResidual(nearWestOfEast)).toBeCloseTo(-0.04);
    expect(Math.abs(yawFrameResidual(half * 0.9))).toBeLessThanOrEqual(half + 1e-9);
  });

  it("reconstructs heading as frame center plus residual", () => {
    for (const deg of [0, 10, 22.5, 80, 179, 350]) {
      const angle = (deg * Math.PI) / 180;
      const tau = Math.PI * 2;
      const u = ((angle % tau) + tau) % tau;
      const idx = yawFrameIndex(angle);
      const recon = (((idx * step + yawFrameResidual(angle)) % tau) + tau) % tau;
      const err = Math.min(
        Math.abs(recon - u),
        tau - Math.abs(recon - u),
      );
      expect(err).toBeLessThan(1e-9);
    }
  });
});
