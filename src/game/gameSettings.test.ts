import { describe, expect, it } from "vitest";
import {
  BGM_VOLUME_KEY,
  DEFAULT_BGM_VOLUME,
  DEFAULT_DESKTOP_VIEW_SCALE,
  DEFAULT_PHONE_VIEW_SCALE,
  DEFAULT_SFX_VOLUME,
  SFX_VOLUME_KEY,
  VIEW_SCALE_KEY,
  parseBgmVolume,
  parseSfxVolume,
  parseViewScale,
  readBgmVolume,
  readSfxVolume,
  readViewScale,
  writeBgmVolume,
  writeSfxVolume,
  writeViewScale,
} from "./gameSettings";

describe("game settings parsers", () => {
  it("uses defaults for invalid audio levels and accepts the slider range", () => {
    expect(parseBgmVolume(null)).toBe(DEFAULT_BGM_VOLUME);
    expect(parseSfxVolume("bad")).toBe(DEFAULT_SFX_VOLUME);
    expect(parseBgmVolume("0")).toBe(0);
    expect(parseSfxVolume("1")).toBe(1);
    expect(parseBgmVolume("1.01")).toBe(DEFAULT_BGM_VOLUME);
  });

  it("uses the phone-specific view default and bounds the saved range", () => {
    expect(parseViewScale(null, true)).toBe(DEFAULT_PHONE_VIEW_SCALE);
    expect(parseViewScale(null, false)).toBe(DEFAULT_DESKTOP_VIEW_SCALE);
    expect(parseViewScale("0.5", true)).toBe(0.5);
    expect(parseViewScale("1.01", false)).toBe(DEFAULT_DESKTOP_VIEW_SCALE);
  });
});

describe("game settings storage", () => {
  it("round-trips all lobby settings", () => {
    const bag: Record<string, string> = {};
    const storage = {
      getItem: (key: string) => bag[key] ?? null,
      setItem: (key: string, value: string) => {
        bag[key] = value;
      },
    };

    writeBgmVolume(0.28, storage);
    writeSfxVolume(0.7, storage);
    writeViewScale(0.85, true, storage);

    expect(bag).toEqual({
      [BGM_VOLUME_KEY]: "0.28",
      [SFX_VOLUME_KEY]: "0.7",
      [VIEW_SCALE_KEY]: "0.85",
    });
    expect(readBgmVolume(storage)).toBe(0.28);
    expect(readSfxVolume(storage)).toBe(0.7);
    expect(readViewScale(true, storage)).toBe(0.85);
  });
});
