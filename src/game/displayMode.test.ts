import { describe, expect, it } from "vitest";
import {
  DISPLAY_MODE_KEY,
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
