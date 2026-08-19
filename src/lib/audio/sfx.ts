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
  if (typeof window === "undefined") return;
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
    // Resume must complete for first shots after autoplay unlock
    if (c.state === "suspended") {
      void c.resume().then(() => playSfx(buffer, opts));
      return;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    if (opts.playbackRate != null && opts.playbackRate > 0) {
      src.playbackRate.value = opts.playbackRate;
    }
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
/** Aircraft-style missile / cannon one-shots (procedural, loudnorm). */
const COMBAT = "/sfx/combat";
/** Cache-bust after re-export so browsers pick up louder masters. */
const COMBAT_VER = "4";

/** SFX paths — fire uses modern soft pack; UI/world keep original client pack. */
export const SFX = {
  shoot: (n: number) => `${COMBAT}/shoot${n}.wav?v=${COMBAT_VER}`,
  /** Fallback if combat pack missing */
  shootOriginal: (n: number) => `${SOUND}/shoot${n}.wav`,
  item: `${SOUND}/item.wav`,
  vselect: `${SOUND}/vselect.wav`,
  click: `${SOUND}/click.wav`,
  over: `${SOUND}/over.wav`,
  wow: `${SOUND}/wow.wav`,
  rev: `${SOUND}/rev.wav`,
  gx1: `${SOUND}/gx1.wav`,
  gx2: `${SOUND}/gx2.wav`,
  gx3: `${SOUND}/gx3.wav`,
  /** Player hit / damage tick */
  hit: `${SOUND}/gx1.wav`,
  hitAlt: `${SOUND}/gx2.wav`,
  interback: `${SOUND}/interback.wav`,
} as const;

/** Weapon fire gain (files are loudnorm'd; this is the final bus fader). */
export const SHOOT_VOLUME = 0.26;
/** Damage-taken gain */
export const HIT_VOLUME = 0.42;

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

const BGM_OGG_VOLUME = 0.4;

/**
 * Prefetch the ogg loops while the user is still on the menu.
 * Safe without a gesture (won't unlock playback until play()).
 */
export async function warmZoneBgm(mapId?: string): Promise<void> {
  try {
    const { warmBgm, bgmFileForMap } = await import("./bgm");
    const urls = mapId
      ? [bgmFileForMap(mapId)]
      : [
          "/sfx/bgm/tactics1.ogg",
          "/sfx/bgm/tactics2.ogg",
          "/sfx/bgm/tactics4.ogg",
          "/sfx/bgm/tactics5.ogg",
        ];
    warmBgm(urls);
  } catch (e) {
    console.warn("[audio] warm BGM skip", e);
  }
}

/**
 * Start zone BGM from a user gesture.
 * Pre-rendered ogg loop — not live MIDI synth.
 * Idempotent: if the same track is already playing, does not restart.
 */
export async function startZoneBgm(
  mapId: string,
): Promise<"midi" | "wav" | "none"> {
  try {
    const { playBgm, isBgmPlaying, getBgmUrl, bgmFileForMap } =
      await import("./bgm");
    await resumeAudio();
    const url = bgmFileForMap(mapId);
    if (isBgmPlaying() && getBgmUrl() === url) return "wav";
    await playBgm(url, { volume: BGM_OGG_VOLUME });
    return "wav";
  } catch (e) {
    console.warn("[audio] all BGM failed", e);
    return "none";
  }
}

/** Preload common combat SFX into AudioBuffer cache. */
export async function preloadCombatSfx(): Promise<void> {
  await resumeAudio();
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 161, 162];
  await Promise.all([
    ...ids.map(async (n) => {
      const buf = await loadSfx(SFX.shoot(n));
      // If new pack failed, fall back to original client WAV
      if (!buf) await loadSfx(SFX.shootOriginal(n));
    }),
    loadSfx(SFX.item),
    loadSfx(SFX.over),
    loadSfx(SFX.wow),
    loadSfx(SFX.rev),
    loadSfx(SFX.gx1),
    loadSfx(SFX.gx2),
    loadSfx(SFX.gx3),
    loadSfx(SFX.hit),
    loadSfx(SFX.hitAlt),
  ]);
}

export { BGM_ORDER };
