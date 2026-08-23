import { describe, expect, it } from "vitest";
import { bgmFileForMap, oggForMidiPath } from "./bgm";

describe("bgmFileForMap", () => {
  it("maps lobby arenas to their pre-rendered FluidR3 ogg loops", () => {
    expect(bgmFileForMap("jade_basin")).toBe("/sfx/bgm/tactics1.ogg");
    expect(bgmFileForMap("scar_ridge")).toBe("/sfx/bgm/tactics2.ogg");
    expect(bgmFileForMap("iron_ring")).toBe("/sfx/bgm/tactics5.ogg");
  });

  it("does not map a lobby arena to the tactics4 reserve track", () => {
    expect(
      ["jade_basin", "scar_ridge", "iron_ring"].map(bgmFileForMap),
    ).not.toContain("/sfx/bgm/tactics4.ogg");
  });
});

describe("oggForMidiPath", () => {
  it("rewrites original tactics midi to the ogg loop", () => {
    expect(oggForMidiPath("/archive/audio/tactics1.mid")).toBe(
      "/sfx/bgm/tactics1.ogg",
    );
    expect(oggForMidiPath("/archive/extracted/sound/tactics4.mid")).toBe(
      "/sfx/bgm/tactics4.ogg",
    );
  });

  it("leaves unrelated midi alone", () => {
    expect(oggForMidiPath("/archive/audio/other.mid")).toBeNull();
  });
});
