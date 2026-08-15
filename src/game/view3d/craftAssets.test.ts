import { describe, expect, it } from "vitest";
import { yawFrameIndex } from "./craftAssets";

describe("yawFrameIndex", () => {
  it("maps east / south / west / north onto 8 dirs", () => {
    expect(yawFrameIndex(0)).toBe(0);
    expect(yawFrameIndex(Math.PI / 2)).toBe(2);
    expect(yawFrameIndex(Math.PI)).toBe(4);
    expect(yawFrameIndex(-Math.PI / 2)).toBe(6);
  });
});
