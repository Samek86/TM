export const DISPLAY_MODE_KEY = "tm.displayMode";

export type DisplayMode = "fullscreen" | "window";

type Readable = Pick<Storage, "getItem">;
type Writable = Pick<Storage, "setItem">;

export function parseDisplayMode(raw: string | null | undefined): DisplayMode {
  return raw === "window" ? "window" : "fullscreen";
}

export function readDisplayMode(storage?: Readable | null): DisplayMode {
  try {
    return parseDisplayMode(storage?.getItem(DISPLAY_MODE_KEY) ?? null);
  } catch {
    return "fullscreen";
  }
}

export function writeDisplayMode(
  mode: DisplayMode,
  storage?: Writable | null,
): void {
  try {
    storage?.setItem(DISPLAY_MODE_KEY, mode);
  } catch {
    /* private mode / quota */
  }
}

export function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
