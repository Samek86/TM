import { describe, expect, it } from "vitest";
import { detectQuality, detectQualityTier, qualityProfile } from "./quality";

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
    expect(high.maxDpr).toBeLessThanOrEqual(1.25);
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
