/**
 * In-match / lobby BGM via HTMLAudioElement.
 * Pre-rendered ogg — no Tone.js on the play path (live MIDI synth hitching).
 */

const TACTICS = new Set(["tactics1", "tactics2", "tactics4", "tactics5"]);

export function oggForMidiPath(midiUrl: string): string | null {
  const name = midiUrl.split("/").pop()?.replace(/\.midi?$/i, "") ?? "";
  if (!TACTICS.has(name)) return null;
  return `/sfx/bgm/${name}.ogg`;
}

/** Lobby map id → pre-rendered loop file. tactics4.ogg is an unmapped reserve. */
export function bgmFileForMap(mapId: string): string {
  const tracks: Record<string, string> = {
    jade_basin: "/sfx/bgm/tactics1.ogg",
    scar_ridge: "/sfx/bgm/tactics2.ogg",
    iron_ring: "/sfx/bgm/tactics5.ogg",
  };
  return tracks[mapId.toLowerCase()] ?? tracks.jade_basin;
}

let el: HTMLAudioElement | null = null;
let playingUrl: string | null = null;

export function stopBgm(): void {
  if (!el) {
    playingUrl = null;
    return;
  }
  try {
    el.pause();
    el.removeAttribute("src");
    el.load();
  } catch {
    /* ignore */
  }
  el = null;
  playingUrl = null;
}

export function isBgmPlaying(): boolean {
  return !!el && !el.paused && !el.ended;
}

export function getBgmUrl(): string | null {
  return playingUrl;
}

export async function playBgm(
  url: string,
  opts: { volume?: number } = {},
): Promise<void> {
  if (el && playingUrl === url && !el.paused) {
    if (opts.volume != null) el.volume = opts.volume;
    return;
  }
  stopBgm();
  const a = new Audio(url);
  a.loop = true;
  a.preload = "auto";
  a.volume = opts.volume ?? 0.4;
  el = a;
  playingUrl = url;
  try {
    await a.play();
  } catch (e) {
    console.warn("[audio] bgm play failed", url, e);
    if (el === a) stopBgm();
    throw e;
  }
}

/** Prefetch decoded media so CONNECT starts the loop immediately. */
export function warmBgm(urls: string[]): void {
  for (const url of urls) {
    const a = new Audio();
    a.preload = "auto";
    a.src = url;
  }
}
