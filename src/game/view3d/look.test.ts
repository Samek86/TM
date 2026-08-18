import { describe, expect, it } from "vitest";
import { PLAY_LOOK } from "./look";

describe("play look", () => {
  it("keeps bloom and fill light low enough that highlights do not flash", () => {
    expect(PLAY_LOOK.bloomStrength).toBeLessThanOrEqual(0.06);
    expect(PLAY_LOOK.bloomThreshold).toBeGreaterThanOrEqual(0.92);
    expect(PLAY_LOOK.toneMappingExposure).toBeLessThanOrEqual(0.98);
    expect(PLAY_LOOK.environmentIntensity).toBeLessThanOrEqual(0.45);
    expect(PLAY_LOOK.hemiIntensity + PLAY_LOOK.ambientIntensity).toBeLessThanOrEqual(0.5);
    expect(PLAY_LOOK.glowEmissive).toBeLessThanOrEqual(0.55);
    expect(PLAY_LOOK.skySunDisc).toBeLessThanOrEqual(0.3);
  });
});
