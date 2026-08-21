import { describe, expect, it } from "vitest";
import {
  DISPLAY_MODE_KEY,
  isPhonePlay,
  parseDisplayMode,
  readDisplayMode,
  writeDisplayMode,
} from "./displayMode";

describe("parseDisplayMode", () => {
  it("treats window as windowed and everything else as fullscreen", () => {
    expect(parseDisplayMode("window")).toBe("window");
    expect(parseDisplayMode("fullscreen")).toBe("fullscreen");
    expect(parseDisplayMode(null)).toBe("fullscreen");
    expect(parseDisplayMode("nope")).toBe("fullscreen");
  });
});

describe("isPhonePlay", () => {
  it("treats coarse pointers and narrow viewports as phone", () => {
    expect(isPhonePlay({ innerWidth: 390, coarsePointer: true })).toBe(true);
    expect(isPhonePlay({ innerWidth: 1280, coarsePointer: false })).toBe(false);
    expect(isPhonePlay({ innerWidth: 767, coarsePointer: false })).toBe(true);
    expect(isPhonePlay({ innerWidth: 1280, coarsePointer: true })).toBe(true);
  });
});

describe("displayMode storage", () => {
  it("round-trips through storage", () => {
    const bag: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => bag[k] ?? null,
      setItem: (k: string, v: string) => {
        bag[k] = v;
      },
    };
    expect(readDisplayMode(storage)).toBe("fullscreen");
    writeDisplayMode("window", storage);
    expect(bag[DISPLAY_MODE_KEY]).toBe("window");
    expect(readDisplayMode(storage)).toBe("window");
  });
});
