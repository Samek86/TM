/**
 * Render original tactics*.mid with FluidSynth/FluidR3 GM to loopable OGG.
 * tactics4.ogg is deliberately rendered as an unmapped reserve track.
 * Usage: node scripts/render-bgm.mjs
 * Optional: BGM_SOUNDFONT=/path/to/gm.sf2 node scripts/render-bgm.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SR = 44100;
const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "public/archive/audio");
const DST = path.join(ROOT, "public/sfx/bgm");
const TRACKS = ["tactics1", "tactics2", "tactics4", "tactics5"];

const SOUNDFONT_CANDIDATES = [
  process.env.BGM_SOUNDFONT,
  "/usr/share/sounds/sf2/FluidR3_GM.sf2",
  "/usr/share/soundfonts/FluidR3_GM.sf2",
].filter(Boolean);

const soundfont = SOUNDFONT_CANDIDATES.find((file) => fs.existsSync(file));
if (!soundfont) {
  throw new Error(
    "No GM soundfont found. Install FluidR3 GM or set BGM_SOUNDFONT to an .sf2 file.",
  );
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${args.join(" ")}`);
  }
}

fs.mkdirSync(DST, { recursive: true });
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tactics-bgm-"));
try {
  for (const name of TRACKS) {
    console.log(`render ${name} with ${path.basename(soundfont)}`);
    const midi = path.join(SRC, `${name}.mid`);
    const wav = path.join(tempDir, `${name}.wav`);
    const ogg = path.join(DST, `${name}.ogg`);
    run("fluidsynth", [
      "-ni",
      "-r",
      String(SR),
      "-g",
      "0.6",
      "-F",
      wav,
      soundfont,
      midi,
    ]);
    run("ffmpeg", [
      "-y",
      "-i",
      wav,
      "-c:a",
      "libvorbis",
      "-q:a",
      "4",
      "-ar",
      String(SR),
      ogg,
    ]);
  }
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
