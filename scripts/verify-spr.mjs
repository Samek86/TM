#!/usr/bin/env node
/**
 * Node verification of SPR decode parity (no DOM).
 * Mirrors src/lib/spr/decode.ts logic for CI / agent checks.
 */
import fs from "node:fs";
import path from "node:path";

const DATA = "/workspace/public/archive/client/extracted/data";

function decodeRle(data, w, h) {
  const out = new Uint8Array(w * h);
  let pos = 0;
  let y = 0;
  while (y < h && pos + 2 <= data.length) {
    const segLen = data[pos] | (data[pos + 1] << 8);
    pos += 2;
    const end = Math.min(pos + segLen, data.length);
    let x = 0;
    while (pos < end) {
      const op = data[pos++];
      if (op === 0x0d) break;
      if (op === 0x0a) {
        if (pos >= end) break;
        x += data[pos++];
      } else if (op === 0x0b) {
        if (pos >= end) break;
        const n = data[pos++];
        for (let i = 0; i < n && pos < end; i++) {
          if (x >= 0 && x < w) out[y * w + x] = data[pos];
          pos++;
          x++;
        }
      } else if (op === 0x0c) {
        if (pos >= end) break;
        const n = data[pos++];
        const count = n * 4;
        for (let i = 0; i < count && pos < end; i++) {
          if (x >= 0 && x < w) out[y * w + x] = data[pos];
          pos++;
          x++;
        }
      } else break;
    }
    pos = end;
    y++;
  }
  return out;
}

function decodeSpr(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf[0] !== 0x53 || buf[1] !== 0x50 || buf[2] !== 0x52) {
    throw new Error("bad magic");
  }
  let off = 3;
  const reserved = view.getUint32(off, true);
  off += 4;
  const type = view.getUint16(off, true);
  off += 2;
  const frames = view.getUint32(off, true);
  off += 4;
  if (type <= 1) off += 8;
  let pixels = 0;
  for (let fi = 0; fi < frames; fi++) {
    const size = view.getUint32(off, true);
    off += 4;
    const w = view.getUint16(off, true);
    off += 2;
    const h = view.getUint16(off, true);
    off += 2;
    const n = type === 0 ? 1 : type === 1 ? 10 : 3;
    off += n * 2 * 2;
    const payload = buf.subarray(off, off + size);
    off += size;
    const idx = decodeRle(payload, w, h);
    for (let i = 0; i < idx.length; i++) if (idx[i]) pixels++;
  }
  return { type, frames, reserved, consumed: off, pixels };
}

const files = fs
  .readdirSync(DATA)
  .filter((f) => f.toLowerCase().endsWith(".spr"))
  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

let ok = 0;
const rows = [];
for (const f of files) {
  const buf = new Uint8Array(fs.readFileSync(path.join(DATA, f)));
  try {
    const r = decodeSpr(buf);
    if (r.consumed !== buf.length) {
      throw new Error(`remainder ${buf.length - r.consumed}`);
    }
    ok++;
    rows.push(`${f}\ttype=${r.type}\tframes=${r.frames}\tpixels=${r.pixels}`);
  } catch (e) {
    console.error("FAIL", f, e.message);
  }
}
console.log(rows.join("\n"));
console.log(`\nOK ${ok}/${files.length}`);
process.exit(ok === files.length ? 0 : 1);
