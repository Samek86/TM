/**
 * Browser MIDI playback via Tone.js + @tonejs/midi.
 * HTML <audio> cannot play .mid natively.
 */
import * as Tone from "tone";

// Lazy CJS interop — avoid named export issues under Vite SSR
type MidiParsed = {
  header: { tempos: { bpm?: number }[] };
  tracks: {
    notes: { time: number; name: string; duration: number; velocity: number }[];
  }[];
  duration: number;
};

async function parseMidi(buf: ArrayBuffer): Promise<MidiParsed> {
  const mod = (await import("@tonejs/midi")) as unknown as {
    Midi: new (data: ArrayBuffer) => MidiParsed;
    default?: { Midi: new (data: ArrayBuffer) => MidiParsed };
  };
  const Ctor = mod.Midi ?? mod.default?.Midi;
  if (!Ctor) throw new Error("@tonejs/midi Midi constructor missing");
  return new Ctor(buf);
}

export type MidiPlayHandle = {
  stop: () => void;
  duration: number;
};

let sharedSynth: Tone.PolySynth | null = null;
let activePart: Tone.Part | null = null;
let playing = false;
let endId: number | null = null;
/** HTMLAudioElement loop fallback (WAV) when MIDI fails */
let wavFallback: HTMLAudioElement | null = null;

function getSynth(): Tone.PolySynth {
  if (!sharedSynth) {
    // Direct to speakers — no reverb chain (was disconnecting and silencing audio)
    sharedSynth = new Tone.PolySynth(Tone.Synth).toDestination();
    sharedSynth.volume.value = -6;
    sharedSynth.maxPolyphony = 48;
  }
  return sharedSynth;
}

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
  try {
    sharedSynth?.releaseAll();
  } catch {
    /* ignore */
  }
  playing = false;
}

export function isMidiPlaying(): boolean {
  return playing || (!!wavFallback && !wavFallback.paused);
}

/**
 * Loop a WAV/MP3 URL with HTMLAudioElement (reliable BGM fallback).
 * Must be called from a user gesture the first time.
 */
export async function playWavLoop(
  url: string,
  opts: { volume?: number } = {},
): Promise<MidiPlayHandle> {
  stopMidi();
  const a = new Audio(url);
  a.loop = true;
  a.volume = opts.volume ?? 0.45;
  a.preload = "auto";
  wavFallback = a;
  try {
    await a.play();
    playing = true;
  } catch (e) {
    console.warn("[audio] wav loop play failed", url, e);
    throw e;
  }
  return {
    duration: Number.isFinite(a.duration) ? a.duration : 0,
    stop: () => stopMidi(),
  };
}

/**
 * Fetch and play a MIDI file URL.
 * Must be triggered from a user gesture the first time (autoplay policy).
 */
export async function playMidiUrl(
  url: string,
  opts: { loop?: boolean; volumeDb?: number } = {},
): Promise<MidiPlayHandle> {
  stopMidi();

  // Unlock audio graph on the gesture/call chain
  await Tone.start();
  try {
    await Tone.getContext().resume();
  } catch {
    /* ignore */
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MIDI fetch failed ${res.status}: ${url}`);
  }
  const buf = await res.arrayBuffer();
  const midi = await parseMidi(buf);

  const synth = getSynth();
  if (opts.volumeDb != null) synth.volume.value = opts.volumeDb;

  const transport = Tone.getTransport();
  transport.stop();
  transport.cancel(0);
  transport.position = 0;
  const bpm = midi.header.tempos[0]?.bpm;
  if (bpm) transport.bpm.value = bpm;

  type Ev = { time: number; name: string; duration: number; velocity: number };
  const events: Ev[] = [];
  for (const track of midi.tracks) {
    for (const note of track.notes) {
      events.push({
        time: note.time,
        name: note.name,
        duration: Math.max(0.05, note.duration),
        velocity: Math.min(1, Math.max(0.08, note.velocity)),
      });
    }
  }
  if (events.length === 0) {
    throw new Error("MIDI has no notes");
  }
  events.sort((a, b) => a.time - b.time);

  const part = new Tone.Part((time, ev) => {
    const e = ev as Ev;
    try {
      synth.triggerAttackRelease(e.name, e.duration, time, e.velocity);
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

  transport.start();
  playing = true;

  if (!opts.loop && midi.duration > 0) {
    endId = transport.scheduleOnce(() => {
      stopMidi();
    }, midi.duration + 0.35);
  }

  return {
    duration: midi.duration,
    stop: () => stopMidi(),
  };
}

/**
 * Try MIDI first, then WAV loop. Call from user gesture when possible.
 */
export async function playBgmWithFallback(
  midiUrl: string,
  wavUrl: string,
  opts: { volumeDb?: number; wavVolume?: number } = {},
): Promise<"midi" | "wav"> {
  try {
    await playMidiUrl(midiUrl, { loop: true, volumeDb: opts.volumeDb ?? -6 });
    return "midi";
  } catch (e) {
    console.warn("[audio] MIDI failed, WAV fallback", e);
    await playWavLoop(wavUrl, { volume: opts.wavVolume ?? 0.4 });
    return "wav";
  }
}
