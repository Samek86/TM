/**
 * Tactics Mercenary .SPR decoder
 *
 * Reverse-engineered from Tm.run loader @ 0x409b10 (frame stride 0x34).
 * Verified: 49/49 client sprites parse with zero trailing bytes.
 *
 * RLE ops (per row, after u16 byte-length):
 *   0x0A n     — skip n transparent pixels
 *   0x0B n     — n literal palette indices
 *   0x0C n     — n*4 literal palette indices
 *   0x0D       — end of row
 * Index 0 is transparent.
 */

import defaultPaletteFlat from "./defaultPalette.json";

export type SprType = 0 | 1 | 2;

export interface SprFrame {
  width: number;
  height: number;
  /** Compressed payload size in file */
  compressedSize: number;
  /** Attachment / hotspot points bank A (u16 count depends on type) */
  pointsA: number[];
  /** Attachment / hotspot points bank B */
  pointsB: number[];
  /** w*h palette indices (0 = transparent) */
  indices: Uint8Array;
}

export interface SprSprite {
  magic: "SPR";
  /** Always 0 in client data; reserved dword after magic */
  reserved: number;
  type: SprType;
  frameCount: number;
  /** Present only when type <= 1: four global u16 values */
  globalPoints: number[] | null;
  frames: SprFrame[];
  /** Bytes consumed from the buffer (should equal file size) */
  bytesConsumed: number;
}

export type RgbaPalette = Uint8ClampedArray; // length 256*4

export class SprDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SprDecodeError";
  }
}

const MAGIC = [0x53, 0x50, 0x52] as const; // "SPR"

/** Built-in provisional palette (gif-derived + game-colored ramp). Index 0 alpha forced 0. */
export function getDefaultPalette(): RgbaPalette {
  const flat = defaultPaletteFlat as number[];
  if (flat.length !== 256 * 4) {
    throw new SprDecodeError(`default palette length ${flat.length}, expected 1024`);
  }
  const out = new Uint8ClampedArray(flat);
  out[3] = 0; // index 0 transparent
  return out;
}

function readU16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function toImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  // Fresh ArrayBuffer-backed view for DOM ImageData constructor typing
  const copy = new Uint8ClampedArray(data.length);
  copy.set(data);
  return new ImageData(copy, width, height);
}

/**
 * Decode one frame's RLE payload into palette indices.
 */
export function decodeRle(payload: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  let pos = 0;
  let y = 0;
  const data = payload;

  while (y < height && pos + 2 <= data.length) {
    const segLen = data[pos]! | (data[pos + 1]! << 8);
    pos += 2;
    const end = Math.min(pos + segLen, data.length);
    let x = 0;

    while (pos < end) {
      const op = data[pos++]!;
      if (op === 0x0d) {
        break;
      }
      if (op === 0x0a) {
        if (pos >= end) break;
        const n = data[pos++]!;
        x += n;
        continue;
      }
      if (op === 0x0b) {
        if (pos >= end) break;
        const n = data[pos++]!;
        for (let i = 0; i < n; i++) {
          if (pos >= end) break;
          const px = data[pos++]!;
          if (x >= 0 && x < width && y >= 0 && y < height) {
            out[y * width + x] = px;
          }
          x++;
        }
        continue;
      }
      if (op === 0x0c) {
        if (pos >= end) break;
        const n = data[pos++]!;
        const count = n * 4;
        for (let i = 0; i < count; i++) {
          if (pos >= end) break;
          const px = data[pos++]!;
          if (x >= 0 && x < width && y >= 0 && y < height) {
            out[y * width + x] = px;
          }
          x++;
        }
        continue;
      }
      // Unknown opcode — abort row
      break;
    }

    pos = end;
    y++;
  }

  return out;
}

/**
 * Parse a full .SPR binary buffer.
 */
export function decodeSpr(buffer: ArrayBuffer | Uint8Array): SprSprite {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 13) {
    throw new SprDecodeError("file too small for SPR header");
  }
  if (bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1] || bytes[2] !== MAGIC[2]) {
    throw new SprDecodeError(
      `bad magic ${String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!)} (expected SPR)`,
    );
  }

  let off = 3;
  const reserved = readU32(view, off);
  off += 4;
  const typeRaw = readU16(view, off);
  off += 2;
  if (typeRaw > 2) {
    throw new SprDecodeError(`unsupported SPR type ${typeRaw}`);
  }
  const type = typeRaw as SprType;
  const frameCount = readU32(view, off);
  off += 4;

  let globalPoints: number[] | null = null;
  if (type <= 1) {
    if (off + 8 > bytes.length) {
      throw new SprDecodeError("truncated global points");
    }
    globalPoints = [
      readU16(view, off),
      readU16(view, off + 2),
      readU16(view, off + 4),
      readU16(view, off + 6),
    ];
    off += 8;
  }

  const frames: SprFrame[] = [];
  for (let fi = 0; fi < frameCount; fi++) {
    if (off + 8 > bytes.length) {
      throw new SprDecodeError(`truncated frame ${fi} header`);
    }
    const compressedSize = readU32(view, off);
    off += 4;
    const width = readU16(view, off);
    off += 2;
    const height = readU16(view, off);
    off += 2;

    let pointCount: number;
    if (type === 0) pointCount = 1;
    else if (type === 1) pointCount = 10;
    else pointCount = 3;

    const need = pointCount * 2 * 2; // two banks of u16
    if (off + need > bytes.length) {
      throw new SprDecodeError(`truncated frame ${fi} points`);
    }
    const pointsA: number[] = [];
    const pointsB: number[] = [];
    for (let i = 0; i < pointCount; i++) {
      pointsA.push(readU16(view, off));
      off += 2;
    }
    for (let i = 0; i < pointCount; i++) {
      pointsB.push(readU16(view, off));
      off += 2;
    }

    if (off + compressedSize > bytes.length) {
      throw new SprDecodeError(
        `truncated frame ${fi} payload (need ${compressedSize}, have ${bytes.length - off})`,
      );
    }
    const payload = bytes.subarray(off, off + compressedSize);
    off += compressedSize;

    const indices = decodeRle(payload, width, height);
    frames.push({
      width,
      height,
      compressedSize,
      pointsA,
      pointsB,
      indices,
    });
  }

  return {
    magic: "SPR",
    reserved,
    type,
    frameCount,
    globalPoints,
    frames,
    bytesConsumed: off,
  };
}

/**
 * Expand one frame to RGBA ImageData (or plain Uint8ClampedArray).
 */
export function frameToRgba(
  frame: SprFrame,
  palette: RgbaPalette = getDefaultPalette(),
): { width: number; height: number; data: Uint8ClampedArray } {
  const { width, height, indices } = frame;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]!;
    const p = idx * 4;
    const o = i * 4;
    data[o] = palette[p]!;
    data[o + 1] = palette[p + 1]!;
    data[o + 2] = palette[p + 2]!;
    data[o + 3] = idx === 0 ? 0 : palette[p + 3]!;
  }
  return { width, height, data };
}

/** Draw a frame onto a canvas (creates canvas if omitted). */
export function drawFrameToCanvas(
  frame: SprFrame,
  canvas?: HTMLCanvasElement,
  palette: RgbaPalette = getDefaultPalette(),
  scale = 1,
): HTMLCanvasElement {
  const { width, height, data } = frameToRgba(frame, palette);
  const c =
    canvas ??
    (typeof document !== "undefined"
      ? document.createElement("canvas")
      : (null as unknown as HTMLCanvasElement));
  if (!c) {
    throw new SprDecodeError("drawFrameToCanvas requires a canvas in non-DOM env");
  }
  const dw = Math.max(1, Math.floor(width * scale));
  const dh = Math.max(1, Math.floor(height * scale));
  c.width = dw;
  c.height = dh;
  const ctx = c.getContext("2d");
  if (!ctx) throw new SprDecodeError("2d context unavailable");

  const img = toImageData(data, width, height);
  if (scale === 1) {
    ctx.putImageData(img, 0, 0);
  } else {
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    const tctx = tmp.getContext("2d")!;
    tctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(tmp, 0, 0, dw, dh);
  }
  return c;
}

/** Build a sprite sheet ImageData (cols columns). */
export function framesToSheet(
  frames: SprFrame[],
  cols = 10,
  palette: RgbaPalette = getDefaultPalette(),
): { width: number; height: number; data: Uint8ClampedArray; cols: number; rows: number } {
  if (frames.length === 0) {
    return { width: 1, height: 1, data: new Uint8ClampedArray(4), cols: 1, rows: 1 };
  }
  const maxW = Math.max(...frames.map((f) => f.width));
  const maxH = Math.max(...frames.map((f) => f.height));
  const c = Math.min(cols, frames.length);
  const rows = Math.ceil(frames.length / c);
  const width = c * maxW;
  const height = rows * maxH;
  const data = new Uint8ClampedArray(width * height * 4);

  frames.forEach((frame, i) => {
    const col = i % c;
    const row = Math.floor(i / c);
    const ox = col * maxW;
    const oy = row * maxH;
    const { data: src } = frameToRgba(frame, palette);
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const si = (y * frame.width + x) * 4;
        const di = ((oy + y) * width + (ox + x)) * 4;
        data[di] = src[si]!;
        data[di + 1] = src[si + 1]!;
        data[di + 2] = src[si + 2]!;
        data[di + 3] = src[si + 3]!;
      }
    }
  });

  return { width, height, data, cols: c, rows };
}

/** Fetch and decode a SPR from a URL (browser). */
export async function loadSpr(url: string): Promise<SprSprite> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new SprDecodeError(`fetch ${url} failed: ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return decodeSpr(buf);
}

export { toImageData };
