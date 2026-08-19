import { describe, expect, it } from "vitest";
import { computeOrthoHalfExtents, MAX_SHAKE, shakeOffset } from "./cameraRig";
import {
  MOBILE_VIEW_WORLD_MULTIPLIER,
  playWorldWidth,
  VIEW_WORLD_WIDTH,
} from "@/game/viewScale";

describe("cameraRig", () => {
  it("matches VIEW_WORLD_WIDTH on the wider axis", () => {
    const { halfW, halfH } = computeOrthoHalfExtents(1280, 720, 720);
    expect(halfW * 2).toBeCloseTo(720);
    expect(halfH * 2).toBeCloseTo(720 * (720 / 1280));
  });

  it("uses a tighter frustum only for phone-like play", () => {
    expect(playWorldWidth(1280, false)).toBe(VIEW_WORLD_WIDTH);
    expect(playWorldWidth(390, false)).toBeCloseTo(
      VIEW_WORLD_WIDTH * MOBILE_VIEW_WORLD_MULTIPLIER,
    );
    expect(playWorldWidth(1280, true)).toBeCloseTo(
      VIEW_WORLD_WIDTH * MOBILE_VIEW_WORLD_MULTIPLIER,
    );
  });

  it("shake stays within MAX_SHAKE and is deterministic", () => {
    const a = shakeOffset(8, 1.25);
    const b = shakeOffset(8, 1.25);
    expect(a).toEqual(b);
    expect(Math.hypot(a.x, a.z)).toBeLessThanOrEqual(MAX_SHAKE + 1e-6);
  });
});
