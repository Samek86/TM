import { describe, expect, it } from "vitest";
import { bgmFileForMap, oggForMidiPath } from "./bgm";

describe("bgmFileForMap", () => {
  it("maps play arenas to pre-rendered ogg, not live midi", () => {
    expect(bgmFileForMap("jade_basin")).toBe("/sfx/bgm/tactics1.ogg");
    expect(bgmFileForMap("scar_ridge")).toBe("/sfx/bgm/tactics4.ogg");
    expect(bgmFileForMap("iron_ring")).toBe("/sfx/bgm/tactics5.ogg");
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
