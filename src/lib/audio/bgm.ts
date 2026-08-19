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

/** Map id → loop file. Same track intent as the old MIDI picker. */
export function bgmFileForMap(mapId: string): string {
  const id = mapId.toLowerCase();
  if (id.includes("desert") || id.includes("scar")) {
    return "/sfx/bgm/tactics4.ogg";
  }
  if (id.includes("vil") || id.includes("iron")) {
    return "/sfx/bgm/tactics5.ogg";
  }
  if (id.includes("jungle2")) return "/sfx/bgm/tactics2.ogg";
  return "/sfx/bgm/tactics1.ogg";
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
