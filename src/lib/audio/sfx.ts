/**
 * Lightweight Web Audio SFX loader/player for original client WAVs.
 */
const cache = new Map<string, AudioBuffer>();
let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export async function resumeAudio(): Promise<void> {
  const c = getCtx();
  if (c.state === "suspended") await c.resume();
}

/** Sync cache hit — use on hot paths (shoot) after preload. */
export function getCachedSfx(url: string): AudioBuffer | null {
  return cache.get(url) ?? null;
}

export async function loadSfx(url: string): Promise<AudioBuffer | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const raw = await res.arrayBuffer();
    const buf = await getCtx().decodeAudioData(raw.slice(0));
    cache.set(url, buf);
    return buf;
  } catch {
    return null;
  }
}

export function playSfx(
  buffer: AudioBuffer | null | undefined,
  opts: { volume?: number; playbackRate?: number } = {},
): void {
  if (!buffer) return;
  try {
    const c = getCtx();
    if (c.state === "suspended") void c.resume();
    const src = c.createBufferSource();
    src.buffer = buffer;
    if (opts.playbackRate) src.playbackRate.value = opts.playbackRate;
    const gain = c.createGain();
    gain.gain.value = opts.volume ?? 0.7;
    src.connect(gain);
    gain.connect(c.destination);
    src.start(0);
  } catch {
    /* ignore */
  }
}

export async function playSfxUrl(
  url: string,
  opts?: { volume?: number; playbackRate?: number },
): Promise<void> {
  const buf = await loadSfx(url);
  playSfx(buf, opts);
}

const SOUND = "/archive/client/extracted/sound";

/** Original client SFX paths under the extracted sound pack. */
export const SFX = {
  shoot: (n: number) => `${SOUND}/shoot${n}.wav`,
  item: `${SOUND}/item.wav`,
  vselect: `${SOUND}/vselect.wav`,
  click: `${SOUND}/click.wav`,
  over: `${SOUND}/over.wav`,
  wow: `${SOUND}/wow.wav`,
  rev: `${SOUND}/rev.wav`,
  gx1: `${SOUND}/gx1.wav`,
  gx2: `${SOUND}/gx2.wav`,
  gx3: `${SOUND}/gx3.wav`,
  interback: `${SOUND}/interback.wav`,
} as const;

export const BGM = {
  tactics1: "/archive/audio/tactics1.mid",
  tactics2: "/archive/audio/tactics2.mid",
  tactics4: "/archive/audio/tactics4.mid",
  tactics5: "/archive/audio/tactics5.mid",
  /** Same tracks also ship inside client sound/ */
  client: {
    tactics1: `${SOUND}/tactics1.mid`,
    tactics2: `${SOUND}/tactics2.mid`,
    tactics4: `${SOUND}/tactics4.mid`,
    tactics5: `${SOUND}/tactics5.mid`,
  },
} as const;

const BGM_ORDER = [
  BGM.tactics1,
  BGM.tactics2,
  BGM.tactics4,
  BGM.tactics5,
] as const;

/** Pick BGM MIDI by map id for variety. */
export function bgmForMap(mapId: string): string {
  if (mapId.includes("desert")) return BGM.tactics4;
  if (mapId.includes("vil")) return BGM.tactics5;
  if (mapId.includes("jungle2")) return BGM.tactics2;
  return BGM.tactics1;
}

/** Reliable WAV underlay / fallback (original client interback.wav). */
export function bgmWavFallback(_mapId?: string): string {
  return SFX.interback;
}

/**
 * Start zone BGM from a user gesture when possible.
 * MIDI first, then interback.wav loop.
 */
export async function startZoneBgm(mapId: string): Promise<"midi" | "wav" | "none"> {
  await resumeAudio();
  try {
    const { playBgmWithFallback } = await import("./midiPlayer");
    return await playBgmWithFallback(bgmForMap(mapId), bgmWavFallback(mapId), {
      volumeDb: -5,
      wavVolume: 0.42,
    });
  } catch (e) {
    console.warn("[audio] all BGM failed", e);
    return "none";
  }
}

/** Preload common combat SFX into AudioBuffer cache. */
export async function preloadCombatSfx(): Promise<void> {
  await resumeAudio();
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21, 161, 162];
  await Promise.all([
    ...ids.map((n) => loadSfx(SFX.shoot(n))),
    loadSfx(SFX.item),
    loadSfx(SFX.over),
    loadSfx(SFX.wow),
    loadSfx(SFX.rev),
    loadSfx(SFX.gx1),
    loadSfx(SFX.gx2),
    loadSfx(SFX.gx3),
  ]);
}

export { BGM_ORDER };
