import { describe, expect, it } from "vitest";
import {
  detectQuality,
  detectQualityTier,
  qualityProfile,
  resolvePixelRatio,
} from "./quality";

describe("detectQualityTier", () => {
  it("picks high for a desktop pointer on a wide screen", () => {
    expect(
      detectQualityTier({
        coarsePointer: false,
        innerWidth: 1440,
        hardwareConcurrency: 8,
      }),
    ).toBe("high");
  });

  it("picks low for a phone thumb, a narrow window, or a thin CPU", () => {
    expect(detectQualityTier({ coarsePointer: true, innerWidth: 1440 })).toBe(
      "low",
    );
    expect(detectQualityTier({ coarsePointer: false, innerWidth: 390 })).toBe(
      "low",
    );
    expect(
      detectQualityTier({
        coarsePointer: false,
        innerWidth: 1440,
        hardwareConcurrency: 4,
      }),
    ).toBe("low");
    expect(
      detectQualityTier({
        coarsePointer: false,
        innerWidth: 1440,
        saveData: true,
      }),
    ).toBe("low");
  });
});

describe("qualityProfile", () => {
  it("drops post-fx and the 2048 shadow map on both tiers", () => {
    const high = qualityProfile("high");
    const low = qualityProfile("low");
    expect(high.postFx).toBe(false);
    expect(low.postFx).toBe(false);
    expect(high.shadowMapSize).toBeLessThanOrEqual(1024);
    expect(low.shadows).toBe(false);
    expect(low.maxDpr).toBe(1);
    expect(high.maxDpr).toBeLessThanOrEqual(1);
    expect(high.antialias).toBe(false);
  });

  it("caps the drawing buffer near 1080p so fullscreen 1440/4K does not 4x fill", () => {
    expect(resolvePixelRatio(1920, 1080, 1, 1)).toBeCloseTo(1);
    expect(resolvePixelRatio(1920, 1080, 2, 1)).toBeCloseTo(1);
    expect(resolvePixelRatio(3840, 2160, 1, 1)).toBeCloseTo(0.5);
    expect(resolvePixelRatio(2560, 1440, 1, 1)).toBeCloseTo(
      Math.sqrt((1920 * 1080) / (2560 * 1440)),
    );
  });

  it("keeps playfield cliff shadows on desktop only", () => {
    expect(
      detectQuality({ coarsePointer: false, innerWidth: 1440 })
        .terrainCastsShadow,
    ).toBe(true);
    expect(
      detectQuality({ coarsePointer: true, innerWidth: 390 })
        .terrainCastsShadow,
    ).toBe(false);
  });
});
