/**
 * Aircraft-style missile / cannon one-shots (replaces Kenney toy-laser pack).
 * Usage: node scripts/render-missile-sfx.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SR = 44100;
const ROOT = path.resolve(import.meta.dirname, "..");
const DST = path.join(ROOT, "public/sfx/combat");

const IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  161, 162,
];

/** Per-id voice. Cannon stays short so high RoF doesn't smear. */
const KIND = {
  1: "cannon",
  2: "dart",
  3: "cloud",
  4: "dart",
  5: "cannon",
  6: "energy",
  7: "energy",
  8: "heavy",
  9: "heavy",
  10: "mine",
  11: "lob",
  12: "dart",
  13: "scatter",
  14: "missile",
  15: "cruise",
  16: "nuke",
  17: "energy",
  18: "cloud",
  19: "missile",
  20: "cloud",
  21: "heavy",
  161: "missile",
  162: "cruise",
};

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pink(rng) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const w = rng() * 2 - 1;
    b0 = 0.997 * b0 + 0.0296 * w;
    b1 = 0.985 * b1 + 0.099 * w;
    b2 = 0.95 * b2 + 0.31 * w;
    return (b0 + b1 + b2 + 0.2 * w) * 0.45;
  };
}

function env(t, a, d) {
  if (t < 0) return 0;
  if (t < a) return t / a;
  return Math.exp((-Math.LN2 * (t - a)) / Math.max(0.02, d));
}

function params(id, kind) {
  const jitter = ((id * 17) % 11) * 0.012;
  switch (kind) {
    case "cannon":
      return { dur: 0.2, whoosh: 0.12, f0: 2400, f1: 280, bass: 92, punch: 0.7, hiss: 0.18 };
    case "dart":
      return { dur: 0.55, whoosh: 0.48, f0: 4200, f1: 380, bass: 110, punch: 0.4, hiss: 0.35 };
    case "energy":
      return { dur: 0.42, whoosh: 0.32, f0: 3600, f1: 520, bass: 140, punch: 0.35, hiss: 0.28 };
    case "cloud":
      return { dur: 0.85, whoosh: 0.7, f0: 1800, f1: 220, bass: 70, punch: 0.25, hiss: 0.5 };
    case "heavy":
      return { dur: 0.72, whoosh: 0.58, f0: 2600, f1: 240, bass: 68, punch: 0.62, hiss: 0.3 };
    case "mine":
      return { dur: 0.28, whoosh: 0.08, f0: 900, f1: 120, bass: 55, punch: 0.9, hiss: 0.08 };
    case "lob":
      return { dur: 0.7, whoosh: 0.55, f0: 1400, f1: 180, bass: 64, punch: 0.55, hiss: 0.22 };
    case "scatter":
      return { dur: 0.62, whoosh: 0.5, f0: 3000, f1: 300, bass: 88, punch: 0.48, hiss: 0.32 };
    case "cruise":
      return { dur: 1.05, whoosh: 0.92, f0: 2800, f1: 160, bass: 58, punch: 0.55, hiss: 0.42 };
    case "nuke":
      return { dur: 1.28, whoosh: 1.05, f0: 1600, f1: 90, bass: 42, punch: 0.85, hiss: 0.38 };
    default:
      return {
        dur: 0.78 + jitter,
        whoosh: 0.64,
        f0: 3200,
        f1: 220,
        bass: 72,
        punch: 0.5,
        hiss: 0.36,
      };
  }
}

function render(id) {
  const kind = KIND[id] ?? "missile";
  const p = params(id, kind);
  const n = Math.floor(p.dur * SR);
  const out = new Float32Array(n);
  const rng = mulberry(id * 997 + 13);
  const pn = pink(rng);
  // State-variable bandpass — the usual jet/missile whoosh (center falls).
  let low = 0;
  let band = 0;
  let high = 0;
  const q = 0.28;

  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = Math.min(1, t / Math.max(0.08, p.whoosh));
    const freq = p.f0 * (1 - u) ** 1.35 + p.f1 * (1 - (1 - u) ** 1.35);
    const f = 2 * Math.sin(Math.PI * Math.min(freq, SR / 6) / SR);
    const noise = pn();
    low += f * band;
    high = noise - low - q * band;
    band += f * high;
    const whooshAmp = env(t, 0.022, p.whoosh * 0.62) * 0.95;
    const body = band * whooshAmp;

    const punchT = env(t, 0.003, 0.07) * p.punch;
    const bassHz = Math.max(28, p.bass - t * 55);
    const bass =
      Math.sin(2 * Math.PI * bassHz * t) * punchT * 0.78 +
      Math.sin(2 * Math.PI * bassHz * 0.5 * t) * punchT * 0.4;

    const ign = env(t, 0.002, 0.045) * 0.22 * (rng() * 2 - 1);

    const hiss = high * env(t, 0.04, p.dur * 0.65) * p.hiss * 0.28;

    const engine =
      Math.sin(
        2 * Math.PI * (72 + id * 0.7) * t + Math.sin(2 * Math.PI * 28 * t) * 0.55,
      ) *
      env(t, 0.04, p.whoosh * 0.85) *
      0.16;

    out[i] = body * 1.15 + bass + ign + hiss + engine;
  }

  let peak = 1e-8;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const k = 0.9 / peak;
  for (let i = 0; i < n; i++) {
    const fade = i > n - 64 ? (n - i) / 64 : 1;
    out[i] = Math.tanh(out[i] * k * 1.15) * fade;
  }
  return out;
}

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE((Math.max(-1, Math.min(1, samples[i])) * 32767) | 0, o);
    o += 2;
  }
  fs.writeFileSync(file, buf);
}

fs.mkdirSync(DST, { recursive: true });
for (const id of IDS) {
  const raw = path.join(DST, `shoot${id}.raw.wav`);
  const out = path.join(DST, `shoot${id}.wav`);
  writeWav(raw, render(id));
  const r = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      raw,
      "-af",
      "highpass=f=45,lowpass=f=11000,loudnorm=I=-17:LRA=7:TP=-1.2",
      "-ar",
      "44100",
      "-ac",
      "1",
      out,
    ],
    { stdio: "ignore" },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed for shoot${id}`);
  fs.unlinkSync(raw);
  console.log("wrote", out);
}
