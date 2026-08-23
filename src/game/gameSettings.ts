export const BGM_VOLUME_KEY = "tm.bgmVolume";
export const SFX_VOLUME_KEY = "tm.sfxVolume";
export const VIEW_SCALE_KEY = "tm.viewScale";

export const DEFAULT_BGM_VOLUME = 0.28;
export const DEFAULT_SFX_VOLUME = 0.7;
export const DEFAULT_PHONE_VIEW_SCALE = 0.85;
export const DEFAULT_DESKTOP_VIEW_SCALE = 1;

type Readable = Pick<Storage, "getItem">;
type Writable = Pick<Storage, "setItem">;

function parseInRange(
  raw: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function parseBgmVolume(raw: string | null | undefined): number {
  return parseInRange(raw, DEFAULT_BGM_VOLUME, 0, 1);
}

export function parseSfxVolume(raw: string | null | undefined): number {
  return parseInRange(raw, DEFAULT_SFX_VOLUME, 0, 1);
}

export function parseViewScale(
  raw: string | null | undefined,
  phoneLike: boolean,
): number {
  return parseInRange(
    raw,
    phoneLike ? DEFAULT_PHONE_VIEW_SCALE : DEFAULT_DESKTOP_VIEW_SCALE,
    0.5,
    1,
  );
}

function readSetting(
  key: string,
  parse: (raw: string | null | undefined) => number,
  storage?: Readable | null,
): number {
  try {
    return parse(storage?.getItem(key) ?? null);
  } catch {
    return parse(null);
  }
}

export function readBgmVolume(storage?: Readable | null): number {
  return readSetting(BGM_VOLUME_KEY, parseBgmVolume, storage);
}

export function readSfxVolume(storage?: Readable | null): number {
  return readSetting(SFX_VOLUME_KEY, parseSfxVolume, storage);
}

export function readViewScale(
  phoneLike: boolean,
  storage?: Readable | null,
): number {
  return readSetting(VIEW_SCALE_KEY, (raw) => parseViewScale(raw, phoneLike), storage);
}

function writeSetting(
  key: string,
  value: number,
  storage?: Writable | null,
): void {
  try {
    storage?.setItem(key, String(value));
  } catch {
    /* private mode / quota */
  }
}

export function writeBgmVolume(value: number, storage?: Writable | null): void {
  writeSetting(BGM_VOLUME_KEY, parseBgmVolume(String(value)), storage);
}

export function writeSfxVolume(value: number, storage?: Writable | null): void {
  writeSetting(SFX_VOLUME_KEY, parseSfxVolume(String(value)), storage);
}

export function writeViewScale(
  value: number,
  phoneLike: boolean,
  storage?: Writable | null,
): void {
  writeSetting(VIEW_SCALE_KEY, parseViewScale(String(value), phoneLike), storage);
}
