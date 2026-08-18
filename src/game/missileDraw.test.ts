import { describe, expect, it } from "vitest";
import { FIELD_LOADOUT_WEAPON_IDS, WEAPONS } from "@/data/weapons";
import { opaqueBounds, pickupIconKind } from "./missileDraw";

describe("opaqueBounds", () => {
  it("crops to non-transparent pixels so baked missiles fill the card", () => {
    const width = 8;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    // one opaque pixel at (5, 1)
    const o = (1 * width + 5) * 4;
    data[o + 3] = 255;
    expect(opaqueBounds(data, width, height)).toEqual({
      x: 5,
      y: 1,
      w: 1,
      h: 1,
    });
  });
});

describe("pickupIconKind", () => {
  it("gives every field pickup its own silhouette", () => {
    const kinds = FIELD_LOADOUT_WEAPON_IDS.map((id) => {
      const w = WEAPONS.find((x) => x.id === id)!;
      return pickupIconKind(w);
    });
    expect(new Set(kinds).size).toBe(FIELD_LOADOUT_WEAPON_IDS.length);
  });
});
