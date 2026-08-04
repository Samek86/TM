/**
 * Tactics Mercenary MAP / TIL / BOB decoders.
 *
 * Confirmed against Tm.run loaders:
 *   MAP  0x40a080  magic 0xF0000002
 *   TIL  0x409f40  magic 0xF0000001
 *   BOB  0x40a390  magic 0xF0000004
 */

export class MapDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapDecodeError";
  }
}

export interface TmMap {
  version: number;
  flags: number;
  width: number;
  height: number;
  sizeField: number;
  /** Tile-set key from header (e.g. "jungle", "vil") */
  nameTil: string;
  /** Bob key from header */
  nameBob: string;
  /** Terrain height per cell, u16 */
  heightmap: Uint16Array;
  /** Attribute/tile flags per cell, u32 */
  attrs: Uint32Array;
  heightMin: number;
  heightMax: number;
}

export interface TilTile {
  /** 16×16 palette indices, row-major */
  indices: Uint8Array;
}

export interface TmTil {
  version: number;
  flags: number;
  /** 256 RGB entries — original channels are 0–63 (6-bit DAC), already scaled ×4 to 0–252 */
  palette: Uint8ClampedArray; // length 256*4 RGBA
  tileCount: number;
  tiles: TilTile[];
  tileWidth: number;
  tileHeight: number;
}

/**
 * BOB on-disk record is 0x1C bytes (file size validated).
 * In-memory field map from Tm.run loader @ 0x40A390 (fread destinations):
 *
 * ```
 * +0x00  (u16) unused / zero in loader path
 * +0x02  (u16) unused / zero
 * +0x04  u16  field_a
 * +0x06  u16  field_b
 * +0x08  u8   flags
 * +0x0A  u16  field_c
 * +0x0C  u16  x          // often map units (768, 1280, …)
 * +0x0E  u16  y
 * +0x10  u16  field_d
 * +0x12  u16  width      // used with height for optional pixel blob
 * +0x14  u16  height
 * +0x16  u8[2] pad / extra
 * +0x18  u32  pixel_ptr  // runtime; on disk may be zero
 * ```
 *
 * After all records, loader may attach SPR stream (call 0x409B10) for decorations.
 */
export interface BobObject {
  raw: Uint8Array;
  /** 14×u16 view of the 28-byte record */
  fields: number[];
  fieldA: number;
  fieldB: number;
  flags: number;
  fieldC: number;
  x: number | null;
  y: number | null;
  fieldD: number;
  width: number;
  height: number;
  index: number;
}

export interface TmBob {
  version: number;
  flags: number;
  count: number;
  objects: BobObject[];
  /** Objects with a recovered (x,y) pair */
  placed: BobObject[];
  /** Remaining file bytes after object table (often embedded SPR streams) */
  trailing: Uint8Array;
  hasEmbeddedSpr: boolean;
  embeddedSprCount: number;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** 6-bit VGA DAC (0–63) → 8-bit channel. */
export function dac6to8(v: number): number {
  const x = Math.max(0, Math.min(63, v | 0));
  return ((x << 2) | (x >> 4)) & 0xff;
}

function u16(v: DataView, o: number): number {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number): number {
  return v.getUint32(o, true);
}

function cString(bytes: Uint8Array, max: number): string {
  let end = 0;
  while (end < max && end < bytes.length && bytes[end] !== 0) end++;
  return new TextDecoder("ascii").decode(bytes.subarray(0, end));
}

// ---------------------------------------------------------------------------
// MAP
// ---------------------------------------------------------------------------

/**
 * Decode a `.map` / `.MAP` buffer.
 *
 * ```
 * u16 version = 2
 * u16 flags   = 0xF000
 * u16 width, height
 * u32 size_field = 52 + width*height*2
 * char name_til[20]
 * char name_bob[20]
 * u16 heightmap[w*h]   @ 52
 * u32 attrs[w*h]       @ size_field
 * ```
 */
export function decodeMap(buf: ArrayBuffer | ArrayBufferView): TmMap {
  const view =
    buf instanceof ArrayBuffer
      ? new DataView(buf)
      : new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  if (bytes.length < 52) throw new MapDecodeError("MAP too small");

  const version = u16(view, 0);
  const flags = u16(view, 2);
  const width = u16(view, 4);
  const height = u16(view, 6);
  const sizeField = u32(view, 8);

  // magic check: version|flags packed == 0xF0000002 on disk as LE bytes 02 00 00 F0
  // (loader compares first 4 bytes as u32 0xF0000002)
  const magic = u32(view, 0);
  if (magic !== 0xf0000002 && !(version === 2 && flags === 0xf000)) {
    throw new MapDecodeError(
      `Bad MAP magic 0x${magic.toString(16)} (want 0xF0000002)`,
    );
  }

  const cells = width * height;
  const expected = 52 + cells * 2 + cells * 4;
  if (bytes.length < expected) {
    throw new MapDecodeError(
      `MAP truncated: got ${bytes.length}, need ${expected} for ${width}×${height}`,
    );
  }
  if (sizeField !== 52 + cells * 2) {
    throw new MapDecodeError(
      `MAP size_field mismatch: ${sizeField} vs ${52 + cells * 2}`,
    );
  }

  const nameTil = cString(bytes.subarray(12, 32), 20);
  const nameBob = cString(bytes.subarray(32, 52), 20);

  const heightmap = new Uint16Array(cells);
  for (let i = 0; i < cells; i++) {
    heightmap[i] = u16(view, 52 + i * 2);
  }

  const attrs = new Uint32Array(cells);
  for (let i = 0; i < cells; i++) {
    attrs[i] = u32(view, sizeField + i * 4);
  }

  let heightMin = 0xffff;
  let heightMax = 0;
  for (let i = 0; i < cells; i++) {
    const h = heightmap[i]!;
    if (h < heightMin) heightMin = h;
    if (h > heightMax) heightMax = h;
  }

  return {
    version,
    flags,
    width,
    height,
    sizeField,
    nameTil,
    nameBob,
    heightmap,
    attrs,
    heightMin,
    heightMax: heightMax || 1,
  };
}

export async function loadMap(url: string): Promise<TmMap> {
  const res = await fetch(url);
  if (!res.ok) throw new MapDecodeError(`Failed to fetch MAP ${url}: ${res.status}`);
  return decodeMap(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// TIL
// ---------------------------------------------------------------------------

/**
 * Decode a `.til` / `.TIL` buffer (Tm.run 0x409f40).
 *
 * ```
 * u32 magic = 0xF0000001
 * u8  palette[256][3]   // 6-bit RGB (0–63)
 * u16 tile_count
 * u8  tiles[tile_count][256]  // 16×16 indices each
 * ```
 */
export function decodeTil(buf: ArrayBuffer | ArrayBufferView): TmTil {
  const view =
    buf instanceof ArrayBuffer
      ? new DataView(buf)
      : new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  if (bytes.length < 774) throw new MapDecodeError("TIL too small");

  const magic = u32(view, 0);
  if (magic !== 0xf0000001) {
    throw new MapDecodeError(`Bad TIL magic 0x${magic.toString(16)}`);
  }

  const palette = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) {
    const r = bytes[4 + i * 3]!;
    const g = bytes[5 + i * 3]!;
    const b = bytes[6 + i * 3]!;
    // 6-bit VGA DAC (0–63) → 8-bit. Classic expand: (v<<2)|(v>>4)
    // matches hardware DAC better than plain ×4 for mid/high values.
    palette[i * 4] = dac6to8(r);
    palette[i * 4 + 1] = dac6to8(g);
    palette[i * 4 + 2] = dac6to8(b);
    palette[i * 4 + 3] = 255;
  }

  const tileCount = u16(view, 772);
  const expected = 774 + tileCount * 256;
  if (bytes.length < expected) {
    throw new MapDecodeError(
      `TIL truncated: got ${bytes.length}, need ${expected} for ${tileCount} tiles`,
    );
  }

  const tiles: TilTile[] = [];
  for (let i = 0; i < tileCount; i++) {
    const off = 774 + i * 256;
    tiles.push({ indices: bytes.slice(off, off + 256) });
  }

  return {
    version: 1,
    flags: 0xf000,
    palette,
    tileCount,
    tiles,
    tileWidth: 16,
    tileHeight: 16,
  };
}

export async function loadTil(url: string): Promise<TmTil> {
  const res = await fetch(url);
  if (!res.ok) throw new MapDecodeError(`Failed to fetch TIL ${url}: ${res.status}`);
  return decodeTil(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// BOB (object table — loader 0x40A390 fully mapped; trailing embeds SPR)
// ---------------------------------------------------------------------------

/**
 * Decode BOB header + object records (stride 0x1C).
 * Loader fread map: +04/+06 u16, +08 u8, +0A u16, +0C/+0E x/y,
 * +10 u16, +12/+14 w/h, +18 runtime pixel ptr = malloc(w*h).
 * Trailing payload: optional SPR stream (0x409B10).
 */
export function decodeBob(buf: ArrayBuffer | ArrayBufferView): TmBob {
  const view =
    buf instanceof ArrayBuffer
      ? new DataView(buf)
      : new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);

  if (bytes.length < 8) throw new MapDecodeError("BOB too small");
  const magic = u32(view, 0);
  if (magic !== 0xf0000004) {
    throw new MapDecodeError(`Bad BOB magic 0x${magic.toString(16)}`);
  }
  const count = u32(view, 4);
  const STRIDE = 0x1c;
  const tableEnd = 8 + count * STRIDE;
  if (bytes.length < tableEnd) {
    throw new MapDecodeError(
      `BOB truncated: got ${bytes.length}, need ≥${tableEnd} for ${count} objects`,
    );
  }

  const objects: BobObject[] = [];
  for (let i = 0; i < count; i++) {
    const off = 8 + i * STRIDE;
    const raw = bytes.slice(off, off + STRIDE);
    const fields: number[] = [];
    for (let j = 0; j < STRIDE; j += 2) {
      fields.push(raw[j]! | (raw[j + 1]! << 8));
    }
    // Loader map: +0x0C/+0x0E = x/y (fields[6], fields[7] as u16 LE pairs)
    const fieldA = fields[2] ?? 0; // +0x04
    const fieldB = fields[3] ?? 0; // +0x06
    const flags = raw[8] ?? 0; // +0x08
    const fieldC = fields[5] ?? 0; // +0x0A
    const xv = fields[6] ?? 0; // +0x0C
    const yv = fields[7] ?? 0; // +0x0E
    const fieldD = fields[8] ?? 0; // +0x10
    const width = fields[9] ?? 0; // +0x12
    const height = fields[10] ?? 0; // +0x14

    let x: number | null = null;
    let y: number | null = null;
    if (xv > 0 && yv > 0 && xv < 20000 && yv < 20000) {
      x = xv;
      y = yv;
    }

    objects.push({
      raw,
      fields,
      fieldA,
      fieldB,
      flags,
      fieldC,
      x,
      y,
      fieldD,
      width,
      height,
      index: i,
    });
  }

  const trailing = bytes.slice(tableEnd);
  let embeddedSprCount = 0;
  for (let i = 0; i + 2 < trailing.length; i++) {
    if (
      trailing[i] === 0x53 &&
      trailing[i + 1] === 0x50 &&
      trailing[i + 2] === 0x52
    ) {
      embeddedSprCount++;
      i += 2;
    }
  }

  const placed = objects.filter((o) => o.x != null && o.y != null);

  return {
    version: 4,
    flags: 0xf000,
    count,
    objects,
    placed,
    trailing,
    hasEmbeddedSpr: embeddedSprCount > 0,
    embeddedSprCount,
  };
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

export type MapViewMode = "height" | "attr" | "flags" | "material" | "tiles";

/** Paint a map cell grid into ImageData-sized RGBA buffer. */
export function renderMapRgba(
  map: TmMap,
  mode: MapViewMode = "height",
): { width: number; height: number; data: Uint8ClampedArray } {
  const { width, height, heightmap, attrs, heightMin, heightMax } = map;
  const data = new Uint8ClampedArray(width * height * 4);
  const span = Math.max(1, heightMax - heightMin);

  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    if (mode === "height") {
      const t = (heightmap[i]! - heightMin) / span;
      // amber-teal elevation ramp
      data[o] = Math.round(18 + t * 210);
      data[o + 1] = Math.round(48 + t * 150);
      data[o + 2] = Math.round(58 + (1 - t) * 90);
      data[o + 3] = 255;
    } else if (mode === "attr" || mode === "material") {
      const a = attrs[i]!;
      const hi = (a >>> 24) & 0xff;
      data[o] = hi;
      data[o + 1] = (hi * 3) & 0xff;
      data[o + 2] = (a & 0xff) * 2;
      data[o + 3] = 255;
    } else {
      // flags — low byte
      const fl = attrs[i]! & 0xff;
      const on = fl === 0x20 ? 40 : fl === 0x60 ? 180 : fl * 2;
      data[o] = on;
      data[o + 1] = fl === 0x60 ? 200 : 80;
      data[o + 2] = fl === 0x28 ? 220 : 60;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

/** Render one 16×16 TIL tile to RGBA. */
export function renderTilTileRgba(
  til: TmTil,
  tileIndex: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  const tile = til.tiles[tileIndex];
  if (!tile) throw new MapDecodeError(`Tile ${tileIndex} out of range`);
  const w = til.tileWidth;
  const h = til.tileHeight;
  const data = new Uint8ClampedArray(w * h * 4);
  const pal = til.palette;
  for (let i = 0; i < w * h; i++) {
    const idx = tile.indices[i]!;
    const p = idx * 4;
    const o = i * 4;
    data[o] = pal[p]!;
    data[o + 1] = pal[p + 1]!;
    data[o + 2] = pal[p + 2]!;
    data[o + 3] = pal[p + 3]!;
  }
  return { width: w, height: h, data };
}

/** Sheet of first `count` tiles (default 256). */
export function renderTilSheetRgba(
  til: TmTil,
  count = 256,
  cols = 16,
): { width: number; height: number; data: Uint8ClampedArray } {
  const n = Math.min(count, til.tileCount);
  const tw = til.tileWidth;
  const th = til.tileHeight;
  const rows = Math.ceil(n / cols);
  const width = cols * tw;
  const height = rows * th;
  const data = new Uint8ClampedArray(width * height * 4);
  const pal = til.palette;

  for (let i = 0; i < n; i++) {
    const tile = til.tiles[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const baseX = col * tw;
    const baseY = row * th;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const idx = tile.indices[y * tw + x]!;
        const p = idx * 4;
        const o = ((baseY + y) * width + (baseX + x)) * 4;
        data[o] = pal[p]!;
        data[o + 1] = pal[p + 1]!;
        data[o + 2] = pal[p + 2]!;
        data[o + 3] = pal[p + 3]!;
      }
    }
  }
  return { width, height, data };
}

export function toImageData(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): ImageData {
  const copy = new Uint8ClampedArray(data.length);
  copy.set(data);
  return new ImageData(copy, width, height);
}

export function drawRgbaToCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  data: Uint8ClampedArray,
  scale = 1,
): void {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const dw = Math.max(1, Math.round(width * safeScale));
  const dh = Math.max(1, Math.round(height * safeScale));
  // Hard cap canvas size (browser limit / UI freeze protection)
  const maxDim = 4096;
  const fit = Math.min(1, maxDim / dw, maxDim / dh);
  canvas.width = Math.max(1, Math.floor(dw * fit));
  canvas.height = Math.max(1, Math.floor(dh * fit));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = toImageData(width, height, data);
  if (safeScale === 1 && fit === 1) {
    ctx.putImageData(img, 0, 0);
    return;
  }
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const octx = off.getContext("2d");
  if (!octx) return;
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

/** Normalize heightmap to 0–1 for gameplay MapDef.elevation */
export function heightmapToElevation(map: TmMap): number[] {
  const span = Math.max(1, map.heightMax - map.heightMin);
  const out = new Array<number>(map.width * map.height);
  for (let i = 0; i < out.length; i++) {
    out[i] = (map.heightmap[i]! - map.heightMin) / span;
  }
  return out;
}

/**
 * MAP attr u32 layout (all 5 client maps, static RE 2026-08):
 *
 * ```
 * bits  0..7   flags     — 0x20 normal, 0x60 edge/special, 0x28 rare, 0x00 void-ish
 * bits  8..15  reserved  — always 0 in shipped maps
 * bits 16..23  variant   — autotile / edge nibble in low 4 bits; hi nibble aux
 * bits 24..31  material  — terrain class id (indexes 16-tile banks in .TIL)
 * ```
 *
 * Tile bank layout: tiles are packed as groups of 16 per material
 * (`jungle.til` 4400 = 275 banks, `VIL`/`z-desert` 2800 = 175 banks).
 *
 * Confirmed: `material * 16 + (variant & 0x0F)` is always in-range and
 * hits non-empty 16×16 tiles on ≥99.9% of cells (100% on jungle/vil).
 */
export interface AttrDecoded {
  raw: number;
  flags: number;
  reserved: number;
  /** Full mid-byte (0–255); low nibble selects bank variant */
  variant: number;
  /** High byte — material / terrain class */
  material: number;
  /** Resolved .TIL tile index */
  tileIndex: number;
}

export function decodeAttr(a: number): AttrDecoded {
  const flags = a & 0xff;
  const reserved = (a >>> 8) & 0xff;
  const variant = (a >>> 16) & 0xff;
  const material = (a >>> 24) & 0xff;
  const tileIndex = material * 16 + (variant & 0x0f);
  return { raw: a, flags, reserved, variant, material, tileIndex };
}

export function attrMaterial(a: number): number {
  return (a >>> 24) & 0xff;
}
export function attrFlags(a: number): number {
  return a & 0xff;
}
export function attrVariant(a: number): number {
  return (a >>> 16) & 0xff;
}
/** Resolved TIL index: material×16 + (variant & 0x0F) */
export function attrTileIndex(a: number): number {
  return ((a >>> 24) & 0xff) * 16 + ((a >>> 16) & 0x0f);
}

/** Common flag meanings (heuristic from border analysis — still refining). */
export const ATTR_FLAG = {
  VOID: 0x00,
  NORMAL: 0x20,
  RARE: 0x28,
  BLOCK: 0x40,
  SPECIAL: 0x60,
  SPECIAL_RARE: 0x68,
} as const;

/**
 * Optional LFX table: light row (0–255) × color index → remapped index.
 * Passed as raw 65536-byte table to avoid circular imports with lfx.ts.
 */
export type LfxTable = Uint8Array;

/** Bake one TIL tile to RGBA once (reused across cells). */
function bakeTileRgba(
  til: TmTil,
  tileIndex: number,
  lfxTable?: LfxTable | null,
  light = 0,
): Uint8ClampedArray {
  const tw = til.tileWidth;
  const th = til.tileHeight;
  const tile = til.tiles[tileIndex] ?? til.tiles[0]!;
  const out = new Uint8ClampedArray(tw * th * 4);
  const pal = til.palette;
  const L = Math.max(0, Math.min(255, light | 0));
  for (let i = 0; i < tw * th; i++) {
    let idx = tile.indices[i]!;
    if (lfxTable && lfxTable.length >= 65536) {
      idx = lfxTable[L * 256 + (idx & 0xff)]!;
    }
    const p = idx * 4;
    const o = i * 4;
    out[o] = pal[p]!;
    out[o + 1] = pal[p + 1]!;
    out[o + 2] = pal[p + 2]!;
    out[o + 3] = 255;
  }
  return out;
}

/**
 * Choose a safe outTileSize so the composed image stays interactive in the UI.
 * Targets ~maxEdge pixels on the long axis (default 960).
 */
export function pickComposeTileSize(
  mapW: number,
  mapH: number,
  prefer = 4,
  maxEdge = 960,
): number {
  let t = Math.max(1, Math.min(prefer, 16));
  while (t > 1 && (mapW * t > maxEdge || mapH * t > maxEdge)) {
    t = Math.floor(t / 2);
  }
  // Prefer at least 2px/cell when map is small enough
  if (t === 1 && mapW * 2 <= maxEdge && mapH * 2 <= maxEdge) return 2;
  return Math.max(1, t);
}

/**
 * Compose a map using original TIL graphics.
 *
 * Optimized for the viewer: bakes each unique tile once, caps resolution so the
 * main thread stays responsive. For true 1:1 full maps use outTileSize=16 with a
 * high maxPixels (or draw tiles in the game loop instead).
 *
 * @param opts.outTileSize  Output pixels per cell (default: auto ~960px edge).
 * @param opts.heightScale  If > 0, shift cells up by normalized height * scale.
 * @param opts.maxPixels    Soft cap on width*height (default 1.2MP).
 */
export function renderMapComposedRgba(
  map: TmMap,
  til: TmTil,
  opts: {
    heightScale?: number;
    drawFlagsOverlay?: boolean;
    outTileSize?: number;
    maxPixels?: number;
    /**
     * Shade tiles by height (low = darker). Used when LFX is not applied.
     * Default true for viewer/game feel.
     */
    heightShade?: boolean;
    /**
     * Original .LFX 65536-byte light×color LUT. When set, each cell picks a
     * light row from elevation (low terrain → dimmer light row).
     */
    lfxTable?: LfxTable | null;
    /**
     * Map elevT∈[0,1] → light 0–255 for LFX. Default: peaks brighter (high light).
     */
    elevToLight?: (elevT: number) => number;
  } = {},
): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  tileSize: number;
  maxLift: number;
  heightScale: number;
} {
  const srcTile = til.tileWidth; // 16
  let outTile =
    opts.outTileSize ?? pickComposeTileSize(map.width, map.height, 4, 960);
  const heightScale = opts.heightScale ?? 0;
  const heightShade = opts.heightShade !== false && !opts.lfxTable;
  const maxPixels = opts.maxPixels ?? 1_200_000;
  const span = Math.max(1, map.heightMax - map.heightMin);
  const lfxTable = opts.lfxTable ?? null;
  const elevToLight =
    opts.elevToLight ??
    ((elevT: number) => Math.max(0, Math.min(255, Math.round(40 + elevT * 200))));

  while (
    outTile > 1 &&
    map.width * outTile * (map.height * outTile + (heightScale > 0 ? heightScale : 0)) >
      maxPixels
  ) {
    outTile = Math.max(1, Math.floor(outTile / 2));
  }

  const maxLift = heightScale > 0 ? Math.ceil(heightScale) : 0;
  const width = map.width * outTile;
  const height = map.height * outTile + maxLift;
  const data = new Uint8ClampedArray(width * height * 4);

  // Cache baked tiles by (tileIndex, lightBucket) so LFX variants stay cheap
  const bakeCache = new Map<number, Uint8ClampedArray>();
  const getBake = (ti: number, light: number): Uint8ClampedArray => {
    const key = (ti & 0xffff) | ((light & 0xff) << 16);
    let b = bakeCache.get(key);
    if (!b) {
      b = bakeTileRgba(til, ti, lfxTable, light);
      bakeCache.set(key, b);
    }
    return b;
  };

  // Row-major paint (N→S). Cheap; height lift still reads as 2.5D.
  for (let cy = 0; cy < map.height; cy++) {
    for (let cx = 0; cx < map.width; cx++) {
    const ci = cy * map.width + cx;
    let ti = attrTileIndex(map.attrs[ci]!);
    if (ti < 0 || ti >= til.tileCount) {
      ti = Math.min(til.tileCount - 1, Math.max(0, attrMaterial(map.attrs[ci]!) * 16));
    }
    const elevT = (map.heightmap[ci]! - map.heightMin) / span;
    const light = lfxTable ? elevToLight(elevT) : 0;
    const bake = getBake(ti, light);
    // CRT-ish fallback shade when no LFX
    const shade = heightShade ? 0.52 + elevT * 0.68 : 1;

    const lift =
      heightScale > 0 ? Math.round(elevT * heightScale) : 0;
    const baseX = cx * outTile;
    const baseY = cy * outTile + maxLift - lift;

    if (outTile === 1) {
      const mid = (8 * srcTile + 8) * 4;
      const o = (baseY * width + baseX) * 4;
      if (baseY >= 0 && baseY < height) {
        data[o] = Math.min(255, Math.round(bake[mid]! * shade));
        data[o + 1] = Math.min(255, Math.round(bake[mid + 1]! * shade));
        data[o + 2] = Math.min(255, Math.round(bake[mid + 2]! * shade));
        data[o + 3] = 255;
      }
      continue;
    }

    for (let py = 0; py < outTile; py++) {
      const dy = baseY + py;
      if (dy < 0 || dy >= height) continue;
      const sy = Math.min(srcTile - 1, Math.floor((py * srcTile) / outTile));
      for (let px = 0; px < outTile; px++) {
        const sx = Math.min(srcTile - 1, Math.floor((px * srcTile) / outTile));
        const src = (sy * srcTile + sx) * 4;
        const o = (dy * width + (baseX + px)) * 4;
        data[o] = Math.min(255, Math.round(bake[src]! * shade));
        data[o + 1] = Math.min(255, Math.round(bake[src + 1]! * shade));
        data[o + 2] = Math.min(255, Math.round(bake[src + 2]! * shade));
        data[o + 3] = 255;
      }
    }
    } // cx
  } // cy

  return { width, height, data, tileSize: outTile, maxLift, heightScale };
}

/**
 * Resolve tile index for every cell (for gameplay / physics / tests).
 */
export function mapTileIndices(map: TmMap, tileCount?: number): Uint16Array {
  const out = new Uint16Array(map.width * map.height);
  const cap = tileCount ?? 0xffff;
  for (let i = 0; i < out.length; i++) {
    let ti = attrTileIndex(map.attrs[i]!);
    if (ti > cap) ti = attrMaterial(map.attrs[i]!) * 16;
    if (ti > cap) ti = 0;
    out[i] = ti;
  }
  return out;
}
