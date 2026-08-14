import { describe, expect, it } from "vitest";
import { engineToThree, threeToEngine } from "./coords";

describe("coords", () => {
  it("maps engine y onto three z and height onto three y", () => {
    expect(engineToThree(3, 7, 27)).toEqual({ x: 3, y: 27, z: 7 });
    expect(threeToEngine(3, 7)).toEqual({ x: 3, y: 7 });
  });
});
