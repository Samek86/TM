#!/usr/bin/env node
/** Offline MAP/TIL/BOB + attr→tile composition verification. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_CANDIDATES = [
  path.join(ROOT, "public/archive/client/extracted/data"),
  path.join(ROOT, "public/archive/extracted/data"),
  "/workspace/public/archive/client/extracted/data",
];
const DATA = DATA_CANDIDATES.find((d) => fs.existsSync(d));
if (!DATA) {
  console.error("DATA dir not found. Tried:", DATA_CANDIDATES.join(", "));
  process.exit(1);
}

function u16(buf, o) {
  return buf[o] | (buf[o + 1] << 8);
}
function u32(buf, o) {
  return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
}

function attrTileIndex(a) {
  const material = (a >>> 24) & 0xff;
  const variant = (a >>> 16) & 0x0f;
  return material * 16 + variant;
}

function decodeMap(buf) {
  const magic = u32(buf, 0);
  if (magic !== 0xf0000002) throw new Error(`bad map magic ${magic.toString(16)}`);
  const w = u16(buf, 4);
  const h = u16(buf, 6);
  const sizeField = u32(buf, 8);
  const cells = w * h;
  if (sizeField !== 52 + cells * 2) throw new Error("size_field");
  if (buf.length !== 52 + cells * 2 + cells * 4) throw new Error("filesize");
  const attrs = new Uint32Array(cells);
  for (let i = 0; i < cells; i++) attrs[i] = u32(buf, sizeField + i * 4);
  const nameTil = Buffer.from(buf.subarray(12, 32)).toString("ascii").replace(/\0.*$/, "");
  return { w, h, cells, attrs, nameTil };
}

function decodeTil(buf) {
  const magic = u32(buf, 0);
  if (magic !== 0xf0000001) throw new Error(`bad til magic ${magic.toString(16)}`);
  const count = u16(buf, 772);
  if (buf.length !== 774 + count * 256) throw new Error(`til size count=${count}`);
  // nonempty tile flags
  const nonempty = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const off = 774 + i * 256;
    let nz = 0;
    for (let p = 0; p < 256; p++) if (buf[off + p]) nz++;
    nonempty[i] = nz > 8 ? 1 : 0;
  }
  return { count, nonempty };
}

function decodeBob(buf) {
  const magic = u32(buf, 0);
  if (magic !== 0xf0000004) throw new Error(`bad bob magic ${magic.toString(16)}`);
  const count = u32(buf, 4);
  const need = 8 + count * 0x1c;
  if (buf.length < need) throw new Error(`bob short ${buf.length}<${need}`);
  return { count, trailing: buf.length - need };
}

function resolveTil(nameTil) {
  const key = nameTil.toLowerCase().replace(/\.til$/, "");
  for (const f of fs.readdirSync(DATA)) {
    if (f.toLowerCase().endsWith(".til") && f.toLowerCase().includes(key)) {
      return f;
    }
  }
  if (key.includes("jungle")) return "jungle.til";
  if (key.includes("vil")) return "VIL.TIL";
  if (key.includes("desert")) return "z-desert.til";
  return null;
}

let ok = 0;
let fail = 0;
const maps = ["JUNGLE.MAP", "jungle2.map", "vil.map", "z-desert.map", "z-desert2.map"];
for (const f of maps) {
  try {
    const r = decodeMap(fs.readFileSync(path.join(DATA, f)));
    console.log("MAP", f, r.w + "x" + r.h, "OK");
    ok++;

    // attr → tile composition check
    const tilName = resolveTil(r.nameTil);
    if (!tilName) throw new Error(`no til for key ${r.nameTil}`);
    const til = decodeTil(fs.readFileSync(path.join(DATA, tilName)));
    let over = 0;
    let emptyHit = 0;
    let good = 0;
    for (let i = 0; i < r.cells; i++) {
      const ti = attrTileIndex(r.attrs[i]);
      if (ti >= til.count) over++;
      else if (!til.nonempty[ti]) emptyHit++;
      else good++;
    }
    const pct = (100 * good) / r.cells;
    if (over > 0 || pct < 95) {
      throw new Error(
        `compose fail over=${over} emptyHit=${emptyHit} good%=${pct.toFixed(1)} til=${tilName}(${til.count})`,
      );
    }
    console.log(
      "  COMPOSE",
      f,
      "→",
      tilName,
      `tile=mat*16+(var&15) good=${pct.toFixed(1)}% used≈`,
      new Set([...r.attrs].map(attrTileIndex)).size,
      "OK",
    );
    ok++;
  } catch (e) {
    console.error("MAP FAIL", f, e.message);
    fail++;
  }
}
for (const f of ["jungle.til", "VIL.TIL", "z-desert.til"]) {
  try {
    const r = decodeTil(fs.readFileSync(path.join(DATA, f)));
    console.log("TIL", f, "tiles", r.count, "OK");
    ok++;
  } catch (e) {
    console.error("TIL FAIL", f, e.message);
    fail++;
  }
}
for (const f of ["jungle.bob", "VIL.BOB", "z-desert.bob"]) {
  try {
    const r = decodeBob(fs.readFileSync(path.join(DATA, f)));
    console.log("BOB", f, "objs", r.count, "trail", r.trailing, "OK");
    ok++;
  } catch (e) {
    console.error("BOB FAIL", f, e.message);
    fail++;
  }
}
console.log(`\nOK ${ok} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
