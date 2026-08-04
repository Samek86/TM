#!/usr/bin/env node
/**
 * Static format verification — everything that can be 100% checked without a debugger.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "public/archive/extracted/data");
const SOUND = path.join(ROOT, "public/archive/extracted/sound");
const TM = path.join(ROOT, "public/archive/extracted/Tm.run");

function u16(b, o) {
  return b[o] | (b[o + 1] << 8);
}
function u32(b, o) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

let ok = 0;
let fail = 0;
function pass(msg) {
  console.log("OK ", msg);
  ok++;
}
function bad(msg) {
  console.error("FAIL", msg);
  fail++;
}

// --- Tm.run present ---
if (!fs.existsSync(TM)) bad("Tm.run missing");
else {
  const tm = fs.readFileSync(TM);
  pass(`Tm.run size ${tm.length}`);
  // weapon table
  const off = 0x39c20;
  let names = 0;
  for (let i = 0; i < 21; i++) {
    const rec = tm.subarray(off + i * 23, off + (i + 1) * 23);
    const name = Buffer.from(rec.subarray(0, 20)).toString("ascii").replace(/\0.*$/, "");
    if (name.length > 0) names++;
  }
  if (names === 21) pass("weapon name table 21/21");
  else bad(`weapon names ${names}/21`);
  // no wp18 path
  if (!tm.includes(Buffer.from("wp18"))) pass("no wp18 path in binary (expected)");
  else bad("unexpected wp18 path");
}

// --- MAP / TIL / BOB / DFX / LFX ---
const maps = ["JUNGLE.MAP", "jungle2.map", "vil.map", "z-desert.map", "z-desert2.map"];
for (const f of maps) {
  const p = path.join(DATA, f);
  if (!fs.existsSync(p)) {
    // case fold
    const hit = fs.readdirSync(DATA).find((x) => x.toLowerCase() === f.toLowerCase());
    if (!hit) {
      bad(`MAP missing ${f}`);
      continue;
    }
  }
  const buf = fs.readFileSync(path.join(DATA, fs.existsSync(p) ? f : fs.readdirSync(DATA).find((x) => x.toLowerCase() === f.toLowerCase())));
  if (u32(buf, 0) !== 0xf0000002) bad(`MAP magic ${f}`);
  else {
    const w = u16(buf, 4);
    const h = u16(buf, 6);
    const cells = w * h;
    if (buf.length !== 52 + cells * 6) bad(`MAP size ${f}`);
    else pass(`MAP ${f} ${w}x${h}`);
  }
}

for (const f of ["jungle.til", "VIL.TIL", "z-desert.til"]) {
  const buf = fs.readFileSync(path.join(DATA, f));
  if (u32(buf, 0) !== 0xf0000001) bad(`TIL magic ${f}`);
  else {
    const n = u16(buf, 772);
    if (buf.length !== 774 + n * 256) bad(`TIL size ${f}`);
    else pass(`TIL ${f} tiles=${n}`);
  }
}

for (const f of ["jungle.bob", "VIL.BOB", "z-desert.bob"]) {
  const buf = fs.readFileSync(path.join(DATA, f));
  if (u32(buf, 0) !== 0xf0000004) bad(`BOB magic ${f}`);
  else {
    const c = u32(buf, 4);
    const table = 8 + c * 0x1c;
    if (buf.length < table) bad(`BOB short ${f}`);
    else pass(`BOB ${f} objs=${c} trail=${buf.length - table}`);
  }
}

for (const f of ["jungle.dfx", "vil.dfx", "z-desert.dfx"]) {
  const p = path.join(DATA, f);
  if (!fs.existsSync(p)) {
    const hit = fs.readdirSync(DATA).find((x) => x.toLowerCase() === f.toLowerCase());
    if (!hit) {
      bad(`DFX missing ${f}`);
      continue;
    }
  }
  const name = fs.existsSync(p) ? f : fs.readdirSync(DATA).find((x) => x.toLowerCase() === f.toLowerCase());
  const buf = fs.readFileSync(path.join(DATA, name));
  if (buf.length !== 65536) bad(`DFX size ${f}`);
  else {
    let same = true;
    for (let r = 1; r < 256 && same; r++) {
      for (let i = 0; i < 256; i++) if (buf[r * 256 + i] !== buf[i]) same = false;
    }
    if (same) pass(`DFX ${f} tiled-256-LUT`);
    else bad(`DFX ${f} rows not identical`);
  }
}

for (const f of ["jungle.lfx", "vil.lfx", "z-desert.lfx"]) {
  const name = fs.readdirSync(DATA).find((x) => x.toLowerCase() === f.toLowerCase());
  if (!name) {
    bad(`LFX missing ${f}`);
    continue;
  }
  const buf = fs.readFileSync(path.join(DATA, name));
  if (buf.length !== 65536) bad(`LFX size ${f}`);
  else {
    let id = 0;
    for (let i = 0; i < 256; i++) if (buf[i] === i) id++;
    pass(`LFX ${f} light0 identity≈${id}/256`);
  }
}

// --- PPP full PCX-RLE decode ---
function pppDecodePlane(payload, w, h, start = 0) {
  const out = new Uint8Array(w * h);
  let pos = start;
  const n = payload.length;
  let oi = 0;
  for (let row = 0; row < h; row++) {
    let col = 0;
    while (col < w && pos < n) {
      const b = payload[pos++];
      if ((b & 0xc0) === 0xc0) {
        const cnt = b & 0x3f;
        if (pos >= n) break;
        const val = payload[pos++];
        for (let k = 0; k < cnt && col < w; k++, col++) out[oi++] = val;
      } else {
        out[oi++] = b;
        col++;
      }
    }
    while (col < w) {
      out[oi++] = 0;
      col++;
    }
  }
  return { consumed: pos - start, pixels: out };
}
function pppFindPal(payload) {
  if (payload.length >= 769 && payload[payload.length - 769] === 0x0c) {
    return { off: payload.length - 769, pal: payload.subarray(payload.length - 768) };
  }
  for (let i = payload.length - 769; i >= Math.max(0, payload.length - 2048); i--) {
    if (payload[i] === 0x0c) return { off: i, pal: payload.subarray(i + 1, i + 769) };
  }
  return null;
}
let pppOk = 0;
for (const f of fs.readdirSync(DATA)) {
  if (!f.toLowerCase().endsWith(".ppp")) continue;
  const buf = fs.readFileSync(path.join(DATA, f));
  if (!(buf[0] === 0x0a && buf[1] === 0x05 && buf[2] === 0x01 && buf[3] === 0x08)) {
    bad(`PPP sig ${f}`);
    continue;
  }
  let w = u16(buf, 12);
  let h = u16(buf, 14);
  const maxx = u16(buf, 8);
  const maxy = u16(buf, 10);
  if (!w || !h) {
    w = maxx + 1;
    h = maxy + 1;
  }
  const payload = buf.subarray(16);
  const palInfo = pppFindPal(payload);
  if (!palInfo) {
    bad(`PPP palette ${f}`);
    continue;
  }
  const cell = w * h;
  const multi = cell <= 128 * 128 && payload.length > cell * 2;
  let frames = 0;
  let pos = 0;
  const limit = palInfo.off;
  if (multi) {
    while (pos + 4 < limit && frames < 300) {
      const { consumed } = pppDecodePlane(payload, w, h, pos);
      if (consumed < 2) break;
      pos += consumed;
      frames++;
    }
  } else {
    const { consumed, pixels } = pppDecodePlane(payload, w, h, 0);
    if (pixels.length !== cell) {
      bad(`PPP plane size ${f}`);
      continue;
    }
    frames = 1;
    pos = consumed;
  }
  if (frames < 1) bad(`PPP frames ${f}`);
  else {
    pppOk++;
    pass(`PPP ${f} ${w}x${h} frames=${frames} palOK`);
  }
}
if (pppOk > 0) pass(`PPP full decode ${pppOk} files`);

// --- Entity stride markers in Tm.run ---
{
  const tm = fs.readFileSync(TM);
  // imul r,r,0x2C and imul r,r,0x74 appear for entity/player pools
  let imul2c = 0;
  let imul74 = 0;
  for (let i = 0; i < tm.length - 3; i++) {
    if (tm[i] === 0x6b && tm[i + 2] === 0x2c && (tm[i + 1] & 0xc0) === 0xc0) imul2c++;
    if (tm[i] === 0x6b && tm[i + 2] === 0x74 && (tm[i + 1] & 0xc0) === 0xc0) imul74++;
  }
  if (imul2c > 50) pass(`entity stride 0x2C imul sites=${imul2c}`);
  else bad(`entity 0x2C imul too few (${imul2c})`);
  if (imul74 > 5) pass(`player slot stride 0x74 imul sites=${imul74}`);
  else bad(`player 0x74 imul too few (${imul74})`);
  if (tm.includes(Buffer.from("Software\\Pantech Net\\Tactics Mercenary")))
    pass("registry path present");
  else bad("registry path missing");
  if (tm.includes(Buffer.from("DirectInputCreate 5.0 FAILED")))
    pass("DI joystick fallback string");
  else bad("DI string missing");
}

// --- SPR magic sample ---
let sprOk = 0;
for (const f of fs.readdirSync(DATA)) {
  if (!f.toLowerCase().endsWith(".spr")) continue;
  const buf = fs.readFileSync(path.join(DATA, f));
  if (buf[0] === 0x53 && buf[1] === 0x50 && buf[2] === 0x52) sprOk++;
  else bad(`SPR magic ${f}`);
}
pass(`SPR magic ${sprOk} files`);

// --- sound pack ---
const mid = ["tactics1.mid", "tactics2.mid", "tactics4.mid", "tactics5.mid"];
for (const f of mid) {
  if (fs.existsSync(path.join(SOUND, f))) pass(`MIDI ${f}`);
  else bad(`MIDI missing ${f}`);
}

console.log(`\n=== RE format verify: OK ${ok} FAIL ${fail} ===`);
console.log(
  fail
    ? "Static format layer NOT fully green."
    : "Static format layer 100% green (runtime BSS tables still need debugger).",
);
process.exit(fail ? 1 : 0);
