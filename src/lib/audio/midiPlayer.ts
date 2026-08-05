/**
 * Browser MIDI playback via Tone.js + @tonejs/midi.
 *
 * Multi-instrument soft ensemble (sub, bass, pad, pluck, brass, keys, lead)
 * with automatic bass reinforcement when the source MIDI is melody-heavy.
 * Pitches / timing / durations of original notes stay intact.
 */
import * as Tone from "tone";

type MidiNote = {
  time: number;
  name: string;
  midi: number;
  duration: number;
  velocity: number;
};

type MidiTrack = {
  name?: string;
  instrument?: { number?: number; family?: string; name?: string };
  notes: MidiNote[];
  channel?: number;
};

type MidiParsed = {
  header: { tempos: { bpm?: number }[] };
  tracks: MidiTrack[];
  duration: number;
};

const midiCache = new Map<string, MidiParsed>();
const midiFetchInflight = new Map<string, Promise<MidiParsed>>();

async function parseMidi(buf: ArrayBuffer): Promise<MidiParsed> {
  const mod = (await import("@tonejs/midi")) as unknown as {
    Midi: new (data: ArrayBuffer) => MidiParsed;
    default?: { Midi: new (data: ArrayBuffer) => MidiParsed };
  };
  const Ctor = mod.Midi ?? mod.default?.Midi;
  if (!Ctor) throw new Error("@tonejs/midi Midi constructor missing");
  return new Ctor(buf);
}

async function loadMidi(url: string): Promise<MidiParsed> {
  const hit = midiCache.get(url);
  if (hit) return hit;
  let inflight = midiFetchInflight.get(url);
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`MIDI fetch failed ${res.status}: ${url}`);
      const buf = await res.arrayBuffer();
      const midi = await parseMidi(buf);
      midiCache.set(url, midi);
      midiFetchInflight.delete(url);
      return midi;
    })().catch((e) => {
      midiFetchInflight.delete(url);
      throw e;
    });
    midiFetchInflight.set(url, inflight);
  }
  return inflight;
}

export type MidiPlayHandle = {
  stop: () => void;
  duration: number;
};

type VoiceRole = "sub" | "bass" | "pad" | "pluck" | "brass" | "keys" | "lead";

type BgmBus = {
  master: Tone.Channel;
  comp: Tone.Compressor;
  eq: Tone.EQ3;
  chorus: Tone.Chorus;
  reverb: Tone.Freeverb;
  airFilter: Tone.Filter;
  voices: Record<
    VoiceRole,
    {
      synth: Tone.PolySynth;
      vol: Tone.Volume;
      filter?: Tone.Filter;
    }
  >;
};

/** Bump to rebuild bus after sound-design changes. */
const BUS_VERSION = 5;
let bus: BgmBus | null = null;
let busPromise: Promise<BgmBus> | null = null;
let builtBusVersion = 0;
let activePart: Tone.Part | null = null;
let playing = false;
let playingUrl: string | null = null;
let endId: number | null = null;
let wavFallback: HTMLAudioElement | null = null;

function stopWavFallback(): void {
  if (wavFallback) {
    try {
      wavFallback.pause();
      wavFallback.src = "";
    } catch {
      /* ignore */
    }
    wavFallback = null;
  }
}

async function ensureAudioContext(): Promise<void> {
  try {
    await Tone.start();
  } catch {
    /* ignore */
  }
  try {
    await Tone.getContext().resume();
  } catch {
    /* ignore */
  }
}

function midiToNote(n: number): string {
  return Tone.Frequency(n, "midi").toNote();
}

/**
 * Full ensemble bus — strong low end + varied mid/high instruments.
 */
function ensureBus(): Promise<BgmBus> {
  if (bus && builtBusVersion === BUS_VERSION) return Promise.resolve(bus);
  if (busPromise && builtBusVersion === BUS_VERSION) return busPromise;

  if (bus) {
    try {
      disposeBus();
    } catch {
      /* ignore */
    }
  }

  builtBusVersion = BUS_VERSION;
  busPromise = (async () => {
    const master = new Tone.Channel({ volume: -10, pan: 0 });
    const comp = new Tone.Compressor({
      threshold: -22,
      ratio: 2.6,
      attack: 0.02,
      release: 0.28,
      knee: 16,
    });
    // Lift lows (was cutting bass before), soft highs
    const eq = new Tone.EQ3({
      low: 3.5,
      mid: 0.4,
      high: -4.5,
      lowFrequency: 160,
      highFrequency: 3800,
    });
    const chorus = new Tone.Chorus({
      frequency: 0.35,
      delayTime: 2.6,
      depth: 0.16,
      spread: 140,
      wet: 0.09,
    }).start();
    const reverb = new Tone.Freeverb({
      roomSize: 0.62,
      dampening: 3800,
    });
    reverb.wet.value = 0.16;
    const airFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 6800,
      rolloff: -12,
      Q: 0.25,
    });

    chorus.connect(reverb);
    reverb.connect(airFilter);
    airFilter.connect(eq);
    eq.connect(comp);
    comp.connect(master);
    master.toDestination();

    const mkVol = (db: number) => new Tone.Volume(db).connect(chorus);

    // --- Sub: pure sine foundation (felt more than heard) ---
    const subVol = mkVol(2);
    const sub = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.03, decay: 0.25, sustain: 0.85, release: 0.9 },
    });
    sub.maxPolyphony = 6;
    const subFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 90,
      rolloff: -24,
      Q: 0.4,
    });
    sub.connect(subFilter);
    subFilter.connect(subVol);

    // --- Bass: warm saw+filter (audible bass guitar / synth bass) ---
    const bassVol = mkVol(3.5);
    const bass = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsawtooth", count: 2, spread: 8 },
      envelope: { attack: 0.02, decay: 0.22, sustain: 0.7, release: 0.55 },
    });
    bass.maxPolyphony = 8;
    const bassFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 420,
      rolloff: -24,
      Q: 0.7,
    });
    bass.connect(bassFilter);
    bassFilter.connect(bassVol);

    // --- Pad: soft strings / ensemble ---
    const padVol = mkVol(-1.5);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.12, decay: 0.35, sustain: 0.7, release: 1.1 },
    });
    pad.maxPolyphony = 14;
    const padFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 1800,
      rolloff: -12,
      Q: 0.25,
    });
    pad.connect(padFilter);
    padFilter.connect(padVol);

    // --- Pluck: guitar / harp-ish ---
    const pluckVol = mkVol(-0.5);
    const pluck = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.004, decay: 0.28, sustain: 0.18, release: 0.45 },
    });
    pluck.maxPolyphony = 12;
    const pluckFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 2800,
      rolloff: -12,
      Q: 0.5,
    });
    pluck.connect(pluckFilter);
    pluckFilter.connect(pluckVol);

    // --- Brass: soft square-ish horn ---
    const brassVol = mkVol(-2);
    const brass = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "fatsquare", count: 2, spread: 10 },
      envelope: { attack: 0.06, decay: 0.2, sustain: 0.55, release: 0.5 },
    });
    brass.maxPolyphony = 8;
    const brassFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 2400,
      rolloff: -12,
      Q: 0.4,
    });
    brass.connect(brassFilter);
    brassFilter.connect(brassVol);

    // --- Keys: soft electric piano ---
    const keysVol = mkVol(-1);
    const keys = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.35, release: 0.8 },
    });
    keys.maxPolyphony = 12;
    const keysFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 3200,
      rolloff: -12,
      Q: 0.3,
    });
    // Gentle 2nd partial via detuned parallel not available easily — keep clean
    keys.connect(keysFilter);
    keysFilter.connect(keysVol);

    // --- Lead: clear melody ---
    const leadVol = mkVol(-1.5);
    const lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.015, decay: 0.18, sustain: 0.45, release: 0.55 },
    });
    lead.maxPolyphony = 12;
    const leadFilter = new Tone.Filter({
      type: "lowpass",
      frequency: 3800,
      rolloff: -12,
      Q: 0.3,
    });
    lead.connect(leadFilter);
    leadFilter.connect(leadVol);

    bus = {
      master,
      comp,
      eq,
      chorus,
      reverb,
      airFilter,
      voices: {
        sub: { synth: sub, vol: subVol, filter: subFilter },
        bass: { synth: bass, vol: bassVol, filter: bassFilter },
        pad: { synth: pad, vol: padVol, filter: padFilter },
        pluck: { synth: pluck, vol: pluckVol, filter: pluckFilter },
        brass: { synth: brass, vol: brassVol, filter: brassFilter },
        keys: { synth: keys, vol: keysVol, filter: keysFilter },
        lead: { synth: lead, vol: leadVol, filter: leadFilter },
      },
    };
    return bus;
  })();

  return busPromise;
}

function disposeBus(): void {
  if (!bus) return;
  const b = bus;
  bus = null;
  busPromise = null;
  builtBusVersion = 0;
  for (const v of Object.values(b.voices)) {
    try {
      v.synth.releaseAll();
    } catch {
      /* ignore */
    }
  }
  const nodes: { dispose: () => void }[] = [b.chorus, b.reverb, b.airFilter, b.eq, b.comp, b.master];
  for (const v of Object.values(b.voices)) {
    nodes.push(v.synth, v.vol);
    if (v.filter) nodes.push(v.filter);
  }
  for (const node of nodes) {
    try {
      node.dispose();
    } catch {
      /* ignore */
    }
  }
}

/** GM program → voice role */
function roleFromInstrument(program: number | undefined, midi: number): VoiceRole {
  const p = program ?? -1;
  // Piano / chromatic perc
  if (p >= 0 && p <= 7) return "keys";
  // Chromatic percussion
  if (p >= 8 && p <= 15) return "pluck";
  // Organ
  if (p >= 16 && p <= 23) return "pad";
  // Guitar
  if (p >= 24 && p <= 31) return "pluck";
  // Bass
  if (p >= 32 && p <= 39) return midi < 40 ? "sub" : "bass";
  // Strings / ensemble
  if (p >= 40 && p <= 55) return "pad";
  // Brass
  if (p >= 56 && p <= 63) return "brass";
  // Reed / pipe
  if (p >= 64 && p <= 79) return "lead";
  // Synth lead
  if (p >= 80 && p <= 87) return "lead";
  // Synth pad
  if (p >= 88 && p <= 95) return "pad";
  // FX / ethnic / percussive
  if (p >= 96 && p <= 119) return midi < 60 ? "pluck" : "lead";

  // Pitch fallback when instrument unknown
  if (midi < 40) return "sub";
  if (midi < 52) return "bass";
  if (midi < 60) return "pad";
  if (midi < 68) return "keys";
  if (midi < 76) return "pluck";
  if (midi < 84) return "brass";
  return "lead";
}

function velForRole(role: VoiceRole, v: number): number {
  // Keep bass present; tame harsh leads
  const base = 0.16 + Math.pow(v, 0.55) * 0.48;
  switch (role) {
    case "sub":
      return base * 1.15;
    case "bass":
      return base * 1.2;
    case "pad":
      return base * 0.75;
    case "pluck":
      return base * 0.9;
    case "brass":
      return base * 0.78;
    case "keys":
      return base * 0.85;
    case "lead":
      return base * 0.72;
    default:
      return base;
  }
}

type PlayEv = {
  time: number;
  name: string;
  midi: number;
  duration: number;
  velocity: number;
  role: VoiceRole;
};

/**
 * When the source has almost no notes below C3, invent a supporting bass line
 * from the lowest pitch in each 1/2-beat bucket (octave down). Melody notes unchanged.
 */
function enrichWithBass(events: PlayEv[]): PlayEv[] {
  const lows = events.filter((e) => e.midi < 52).length;
  const ratio = events.length ? lows / events.length : 0;
  // Already bass-rich — don't double
  if (ratio > 0.18) return events;

  const bucket = new Map<number, PlayEv>();
  for (const e of events) {
    if (e.midi < 48 || e.midi > 84) continue;
    if (e.duration < 0.08) continue;
    const t = Math.round(e.time * 2) / 2; // 1/2 beat-ish
    const prev = bucket.get(t);
    if (!prev || e.midi < prev.midi) bucket.set(t, e);
  }

  const extra: PlayEv[] = [];
  for (const [t, e] of bucket) {
    // Root an octave (or two) down into bass range
    let bassMidi = e.midi - 12;
    if (bassMidi > 51) bassMidi -= 12;
    if (bassMidi < 28) bassMidi += 12;
    if (bassMidi < 28 || bassMidi > 55) continue;
    const dur = Math.max(0.18, Math.min(0.75, e.duration * 1.1));
    extra.push({
      time: t,
      name: midiToNote(bassMidi),
      midi: bassMidi,
      duration: dur,
      velocity: Math.min(0.9, e.velocity * 0.85 + 0.1),
      role: bassMidi < 40 ? "sub" : "bass",
    });
    // Soft sub under bass for weight
    if (bassMidi >= 36) {
      const subMidi = bassMidi - 12;
      if (subMidi >= 24) {
        extra.push({
          time: t,
          name: midiToNote(subMidi),
          midi: subMidi,
          duration: dur * 1.05,
          velocity: 0.7,
          role: "sub",
        });
      }
    }
  }

  // Light pad doubles on long mid notes for “other instruments”
  for (const e of events) {
    if (e.duration >= 0.35 && e.midi >= 55 && e.midi <= 76 && e.role === "lead") {
      extra.push({
        ...e,
        role: "pad",
        velocity: e.velocity * 0.55,
        duration: e.duration * 1.15,
      });
    }
  }

  return events.concat(extra).sort((a, b) => a.time - b.time);
}

/** Stop any currently scheduled MIDI / WAV BGM. */
export function stopMidi(): void {
  stopWavFallback();
  if (activePart) {
    try {
      activePart.stop();
      activePart.dispose();
    } catch {
      /* ignore */
    }
    activePart = null;
  }
  if (endId != null) {
    try {
      Tone.getTransport().clear(endId);
    } catch {
      /* ignore */
    }
    endId = null;
  }
  try {
    Tone.getTransport().stop();
    Tone.getTransport().cancel(0);
    Tone.getTransport().position = 0;
  } catch {
    /* ignore */
  }
  if (bus) {
    for (const v of Object.values(bus.voices)) {
      try {
        v.synth.releaseAll();
      } catch {
        /* ignore */
      }
    }
  }
  playing = false;
  playingUrl = null;
}

export function isMidiPlaying(): boolean {
  return playing || (!!wavFallback && !wavFallback.paused);
}

export function getPlayingUrl(): string | null {
  return playingUrl;
}

export async function warmBgmEngine(urls: string[] = []): Promise<void> {
  void import("@tonejs/midi");
  try {
    await ensureBus();
  } catch (e) {
    console.warn("[audio] warm bus failed", e);
  }
  await Promise.all(
    urls.map((u) =>
      loadMidi(u).catch((e) => {
        console.warn("[audio] warm midi skip", u, e);
      }),
    ),
  );
}

export async function playWavLoop(
  url: string,
  opts: { volume?: number } = {},
): Promise<MidiPlayHandle> {
  if (playing && wavFallback && playingUrl === url && !wavFallback.paused) {
    return {
      duration: Number.isFinite(wavFallback.duration) ? wavFallback.duration : 0,
      stop: () => stopMidi(),
    };
  }
  stopMidi();
  const a = new Audio(url);
  a.loop = true;
  a.volume = opts.volume ?? 0.45;
  a.preload = "auto";
  wavFallback = a;
  playingUrl = url;
  try {
    await a.play();
    playing = true;
  } catch (e) {
    console.warn("[audio] wav loop play failed", url, e);
    playingUrl = null;
    throw e;
  }
  return {
    duration: Number.isFinite(a.duration) ? a.duration : 0,
    stop: () => stopMidi(),
  };
}

export async function playMidiUrl(
  url: string,
  opts: { loop?: boolean; volumeDb?: number } = {},
): Promise<MidiPlayHandle> {
  if (playing && playingUrl === url && activePart && !wavFallback) {
    if (opts.volumeDb != null && bus) {
      bus.master.volume.value = opts.volumeDb;
    }
    return {
      duration: midiCache.get(url)?.duration ?? 0,
      stop: () => stopMidi(),
    };
  }

  stopMidi();

  const [, midi, b] = await Promise.all([
    ensureAudioContext(),
    loadMidi(url),
    ensureBus(),
  ]);

  b.master.volume.value = opts.volumeDb ?? -9;

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel(0);
  transport.position = 0;
  const bpm = midi.header.tempos[0]?.bpm;
  if (bpm) transport.bpm.value = bpm;

  let events: PlayEv[] = [];
  for (const track of midi.tracks) {
    const prog = track.instrument?.number;
    for (const note of track.notes) {
      const midiNum =
        typeof note.midi === "number"
          ? note.midi
          : Tone.Frequency(note.name).toMidi();
      const role = roleFromInstrument(prog, midiNum);
      events.push({
        time: note.time,
        name: note.name || midiToNote(midiNum),
        midi: midiNum,
        duration: Math.max(0.04, note.duration),
        velocity: Math.min(1, Math.max(0.1, note.velocity)),
        role,
      });
    }
  }
  if (events.length === 0) {
    throw new Error("MIDI has no notes");
  }
  events.sort((a, c) => a.time - c.time);
  events = enrichWithBass(events);

  const part = new Tone.Part((time, ev) => {
    const e = ev as PlayEv;
    try {
      const voice = b.voices[e.role] ?? b.voices.lead;
      const vel = Math.min(0.95, velForRole(e.role, e.velocity));
      const dur =
        e.role === "pad"
          ? e.duration * 1.2
          : e.duration < 0.14
            ? e.duration * 1.3
            : e.duration * 1.05;
      voice.synth.triggerAttackRelease(e.name, dur, time, vel);
    } catch {
      /* polyphony race */
    }
  }, events);

  part.loop = !!opts.loop;
  if (opts.loop && midi.duration > 0) {
    part.loopEnd = Math.max(midi.duration, 1);
  }
  part.start(0);
  activePart = part;
  playingUrl = url;

  transport.start();
  playing = true;

  if (!opts.loop && midi.duration > 0) {
    endId = transport.scheduleOnce(() => {
      stopMidi();
    }, midi.duration + 0.5);
  }

  return {
    duration: midi.duration,
    stop: () => stopMidi(),
  };
}

export async function playBgmWithFallback(
  midiUrl: string,
  wavUrl: string,
  opts: { volumeDb?: number; wavVolume?: number } = {},
): Promise<"midi" | "wav"> {
  try {
    await playMidiUrl(midiUrl, { loop: true, volumeDb: opts.volumeDb ?? -9 });
    return "midi";
  } catch (e) {
    console.warn("[audio] MIDI failed, WAV fallback", e);
    await playWavLoop(wavUrl, { volume: opts.wavVolume ?? 0.4 });
    return "wav";
  }
}

export function disposeMidiEngine(): void {
  stopMidi();
  disposeBus();
}
