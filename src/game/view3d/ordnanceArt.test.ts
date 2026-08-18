import { describe, expect, it } from "vitest";
import { missileKindFromStyle } from "@/game/missileDraw";

describe("missileKindFromStyle", () => {
  it("maps combat styles onto the clean 2D missile silhouettes", () => {
    expect(missileKindFromStyle("dart")).toBe("dart");
    expect(missileKindFromStyle("cruise")).toBe("cruise");
    expect(missileKindFromStyle("scatter")).toBe("scatter");
    expect(missileKindFromStyle("twin_beam")).toBe("standard");
  });
});
