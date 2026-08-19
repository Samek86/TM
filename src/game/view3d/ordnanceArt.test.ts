import { describe, expect, it } from "vitest";
import { missileKindFromStyle } from "@/game/missileDraw";
import { shotBaseHeading, shotCardHeading } from "./ordnanceArt";

describe("missileKindFromStyle", () => {
  it("maps combat styles onto the clean 2D missile silhouettes", () => {
    expect(missileKindFromStyle("dart")).toBe("dart");
    expect(missileKindFromStyle("cruise")).toBe("cruise");
    expect(missileKindFromStyle("scatter")).toBe("scatter");
    expect(missileKindFromStyle("twin_beam")).toBe("standard");
  });
});

describe("shotCardHeading", () => {
  it("treats Stinger yaw_00 as east so the card yaws with flight", () => {
    expect(shotBaseHeading(12)).toBeCloseTo(0);
    expect(shotCardHeading(12, 0)).toBeCloseTo(0);
    expect(shotCardHeading(12, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(shotCardHeading(12, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
  });

  it("flips west-facing missile art so the nose matches flight", () => {
    // Multi / Tow / Tomahawk yaw_00 point left (west).
    for (const id of [13, 14, 15]) {
      expect(Math.abs(shotBaseHeading(id))).toBeCloseTo(Math.PI);
      const yaw = shotCardHeading(id, 0);
      const wrapped = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      expect(Math.abs(wrapped)).toBeCloseTo(Math.PI);
    }
  });
});
