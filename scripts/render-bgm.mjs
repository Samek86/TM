/**
 * Bounce original tactics*.mid to loopable OGG (no Tone.js at runtime).
 * Usage: node scripts/render-bgm.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pkg from "@tonejs/midi";

const Midi = pkg.Midi ?? pkg.default?.Midi ?? pkg;
const SR = 44100;
const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public/archive/audio");
const DST = path.join(ROOT, "public/sfx/bgm");
const TRACKS = ["tactics1", "tactics2", "tactics4", "tactics5"];

function midiToHz(n) {
  return 440 * 2 ** ((n - 69) / 12);
}

function osc(kind, phase, freq) {
  const ny = SR * 0.45;
  const harms = Math.max(1, Math.min(kind === "sine" ? 1 : 6, Math.floor(ny / freq)));
  let s = 0;
  if (kind === "sine") return Math.sin(phase);
  if (kind === "tri") {
    for (let h = 0; h < harms; h++) {
      const n = 2 * h + 1;
      s += Math.sin(phase * n) / (n * n) * (h % 2 === 0 ? 1 : -1);
    }
    return s * 0.95;
  }
  if (kind === "square") {
    for (let h = 0; h < harms; h++) {
      const n = 2 * h + 1;
      s += Math.sin(phase * n) / n;
    }
    return s * 0.7;
  }
  // saw
  for (let h = 1; h <= harms; h++) s += Math.sin(phase * h) / h;
  return s * 0.55;
}

function family(program, midi) {
  const p = program ?? -1;
  if (p >= 0 && p <= 7) return { kind: "sine", gain: 0.22, atk: 0.006, rel: 0.18, lp: 4200 };
  if (p >= 16 && p <= 23) return { kind: "square", gain: 0.14, atk: 0.01, rel: 0.22, lp: 2400 };
  if (p >= 24 && p <= 31) return { kind: "tri", gain: 0.16, atk: 0.004, rel: 0.2, lp: 3200 };
  if (p >= 32 && p <= 39) return { kind: "saw", gain: 0.28, atk: 0.008, rel: 0.12, lp: midi < 40 ? 280 : 520 };
  if (p >= 40 && p <= 55) return { kind: "tri", gain: 0.13, atk: 0.08, rel: 0.45, lp: 2600 };
  if (p >= 56 && p <= 63) return { kind: "square", gain: 0.12, atk: 0.03, rel: 0.2, lp: 2200 };
  if (p >= 80 && p <= 87) return { kind: "saw", gain: 0.15, atk: 0.01, rel: 0.16, lp: 3800 };
  if (p >= 88 && p <= 95) return { kind: "sine", gain: 0.14, atk: 0.1, rel: 0.5, lp: 1800 };
  if (midi < 48) return { kind: "saw", gain: 0.24, atk: 0.01, rel: 0.14, lp: 400 };
  if (midi < 72) return { kind: "tri", gain: 0.16, atk: 0.02, rel: 0.22, lp: 2800 };
  return { kind: "saw", gain: 0.12, atk: 0.012, rel: 0.18, lp: 3600 };
}

function env(t, dur, atk, rel) {
  if (t < 0) return 0;
  if (t < atk) return t / atk;
  const tail = t - (dur - rel);
  if (tail > 0) return Math.max(0, 1 - tail / rel);
  return 1;
}

function hash(n) {
  let x = (n | 0) * 374761393 + 668265263;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function addDrum(L, R, start, midi, vel) {
  const v = Math.max(0.15, vel);
  if (midi === 35 || midi === 36) {
    const len = Math.floor(0.22 * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.exp(-t * 18) * v * 0.55;
      const s = Math.sin(2 * Math.PI * (78 - t * 40) * t) * e;
      const k = start + i;
      if (k >= L.length) break;
      L[k] += s;
      R[k] += s;
    }
    return;
  }
  if (midi === 38 || midi === 40) {
    const len = Math.floor(0.16 * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.exp(-t * 22) * v * 0.32;
      const nse = (hash(start + i) * 2 - 1) * e;
      const tone = Math.sin(2 * Math.PI * 190 * t) * e * 0.45;
      const k = start + i;
      if (k >= L.length) break;
      L[k] += nse + tone;
      R[k] += nse * 0.85 + tone;
    }
    return;
  }
  if (midi === 42 || midi === 44 || midi === 46) {
    const len = Math.floor((midi === 46 ? 0.18 : 0.05) * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.exp(-t * (midi === 46 ? 14 : 55)) * v * 0.12;
      const nse = (hash(9000 + start + i) * 2 - 1) * e;
      const k = start + i;
      if (k >= L.length) break;
      L[k] += nse;
      R[k] += nse * 0.7;
    }
    return;
  }
  if (midi === 49 || midi === 57 || midi === 51 || midi === 59) {
    const len = Math.floor(1.1 * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.exp(-t * 3.2) * v * 0.16;
      const nse = (hash(12000 + start + i) * 2 - 1) * e;
      const k = start + i;
      if (k >= L.length) break;
      L[k] += nse;
      R[k] += nse * 0.9;
    }
  }
}

function addNote(L, R, start, dur, midiNum, vel, program, pan) {
  const f = family(program, midiNum);
  const freq = midiToHz(midiNum);
  const atk = f.atk;
  const rel = f.rel;
  const total = dur + rel;
  const n = Math.floor(total * SR);
  const g = f.gain * (0.18 + Math.pow(vel, 0.7) * 0.82);
  const twoPi = 2 * Math.PI;
  let lp = 0;
  const a = Math.exp((-2 * Math.PI * f.lp) / SR);
  const pl = (1 - pan) * 0.5;
  const pr = (1 + pan) * 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const amp = env(t, dur, atk, rel) * g;
    if (amp <= 1e-5) continue;
    const ph = twoPi * freq * t;
    const raw = osc(f.kind, ph, freq);
    lp = a * lp + (1 - a) * raw;
    const s = lp * amp;
    const k = start + i;
    if (k >= L.length) break;
    L[k] += s * pl;
    R[k] += s * pr;
  }
}

function crossfadeLoop(L, R, seconds) {
  const fade = Math.min(L.length >> 1, Math.floor(seconds * SR));
  const outN = L.length - fade;
  const oL = new Float32Array(outN);
  const oR = new Float32Array(outN);
  oL.set(L.subarray(0, outN));
  oR.set(R.subarray(0, outN));
  for (let i = 0; i < fade; i++) {
    const t = i / fade;
    const e = outN - fade + i;
    oL[e] = L[e] * (1 - t) + L[i] * t;
    oR[e] = R[e] * (1 - t) + R[i] * t;
  }
  return { L: oL, R: oR };
}

function peakNormalize(L, R, target = 0.86) {
  let p = 1e-8;
  for (let i = 0; i < L.length; i++) {
    p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
  }
  const k = target / p;
  for (let i = 0; i < L.length; i++) {
    L[i] *= k;
    R[i] *= k;
  }
}

function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i]));
    const r = Math.max(-1, Math.min(1, R[i]));
    buf.writeInt16LE((l * 32767) | 0, o);
    buf.writeInt16LE((r * 32767) | 0, o + 2);
    o += 4;
  }
  fs.writeFileSync(file, buf);
}

function renderOne(name) {
  const midi = new Midi(fs.readFileSync(path.join(SRC, `${name}.mid`)));
  const dur = Math.max(1, midi.duration + 1.2);
  const n = Math.ceil(dur * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let notes = 0;
  midi.tracks.forEach((track, ti) => {
    const program = track.instrument?.number;
    const perc = !!track.instrument?.percussion;
    const pan = ((ti % 7) - 3) * 0.12;
    for (const note of track.notes) {
      const start = Math.floor(note.time * SR);
      const midiNum = note.midi;
      const vel = Math.min(1, Math.max(0.08, note.velocity));
      if (perc) {
        addDrum(L, R, start, midiNum, vel);
      } else {
        addNote(L, R, start, Math.max(0.04, note.duration), midiNum, vel, program, pan);
      }
      notes += 1;
    }
  });
  const looped = crossfadeLoop(L, R, 0.55);
  peakNormalize(looped.L, looped.R, 0.84);
  return { ...looped, notes, dur: midi.duration };
}

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(" ")}`);
}

fs.mkdirSync(DST, { recursive: true });
for (const name of TRACKS) {
  console.log("render", name);
  const t0 = Date.now();
  const { L, R, notes, dur } = renderOne(name);
  const wav = path.join(DST, `${name}.wav`);
  const ogg = path.join(DST, `${name}.ogg`);
  writeWav(wav, L, R);
  ffmpeg([
    "-y",
    "-i",
    wav,
    "-c:a",
    "libvorbis",
    "-q:a",
    "4",
    "-ar",
    "44100",
    ogg,
  ]);
  fs.unlinkSync(wav);
  console.log(
    `  ${name}: ${dur.toFixed(1)}s ${notes} notes → ${ogg} (${Date.now() - t0}ms)`,
  );
}
