/**
 * PPP UI image format — fully reversed from Tm.run corpus (PCX-style RLE).
 *
 * ```
 * offset 0  u8×4  signature  0A 05 01 08
 * offset 4  u32   flags      (always 0 in client pack)
 * offset 8  u16   max_x, max_y   // inclusive bounds (often 639,479)
 * offset 12 u16   width, height  // 0,0 → use max+1; small wh → multi-frame atlas
 * offset 16 payload
 *   - PCX RLE pixel stream (per scanline of `width` bytes; high2bits==11 → run)
 *   - optional pad bytes
 *   - 0x0C + 768-byte RGB palette (classic PCX VGA trailer)
 * ```
 *
 * Multi-frame: when width×height is small and payload is large
 * (font.ppp 76×76×N, Now2.ppp 72×72×N), frames are concatenated RLE streams
 * before the shared palette.
 */

export class PppDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PppDecodeError";
  }
}

export interface TmPpp {
  signature: [number, number, number, number];
  flags: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  /** Frame count (1 for full-screen UI) */
  frameCount: number;
  /** 8-bit indices per frame, length width*height each */
  frames: Uint8Array[];
  /** 256×RGB palette (768 bytes), or null if missing */
  palette: Uint8Array | null;
  payload: Uint8Array;
  decodeNote: string;
}

const SIG = [0x0a, 0x05, 0x01, 0x08] as const;

/** PCX-style RLE for one `w×h` plane (scanlines of exactly `w` samples). */
export function decodePcxPlane(
  payload: Uint8Array,
  w: number,
  h: number,
  start = 0,
): { indices: Uint8Array; consumed: number } {
  const out = new Uint8Array(w * h);
  let pos = start;
  const n = payload.length;
  let oi = 0;
  for (let row = 0; row < h; row++) {
    let col = 0;
    while (col < w && pos < n) {
      const b = payload[pos++]!;
      if ((b & 0xc0) === 0xc0) {
        const cnt = b & 0x3f;
        if (pos >= n) break;
        const val = payload[pos++]!;
        for (let k = 0; k < cnt && col < w; k++, col++) {
          out[oi++] = val;
        }
      } else {
        out[oi++] = b;
        col++;
      }
    }
    // pad incomplete row
    while (col < w) {
      out[oi++] = 0;
      col++;
    }
  }
  return { indices: out, consumed: pos - start };
}

/** Locate PCX 0x0C + 768-byte palette; prefer marker near end of stream. */
export function extractPcxPalette(
  payload: Uint8Array,
  afterPixels: number,
): { palette: Uint8Array | null; paletteOffset: number | null; how: string } {
  const rem = payload.subarray(afterPixels);
  // exact classic trailer
  if (rem.length >= 769 && rem[0] === 0x0c) {
    return {
      palette: rem.subarray(1, 769),
      paletteOffset: afterPixels,
      how: "marker@0",
    };
  }
  // pad then 0x0C
  for (let i = 0; i < Math.min(rem.length - 768, 64); i++) {
    if (rem[i] === 0x0c && i + 1 + 768 <= rem.length) {
      return {
        palette: rem.subarray(i + 1, i + 1 + 768),
        paletteOffset: afterPixels + i,
        how: `marker@${i}`,
      };
    }
  }
  // search from end of whole payload
  if (payload.length >= 769 && payload[payload.length - 769] === 0x0c) {
    return {
      palette: payload.subarray(payload.length - 768),
      paletteOffset: payload.length - 769,
      how: "end-769",
    };
  }
  for (let i = payload.length - 769; i >= Math.max(0, payload.length - 2048); i--) {
    if (payload[i] === 0x0c) {
      return {
        palette: payload.subarray(i + 1, i + 1 + 768),
        paletteOffset: i,
        how: `scan@${i}`,
      };
    }
  }
  if (rem.length >= 768) {
    return {
      palette: rem.subarray(rem.length - 768),
      paletteOffset: afterPixels + rem.length - 768,
      how: "last768",
    };
  }
  return { palette: null, paletteOffset: null, how: "none" };
}

export function decodePpp(buf: ArrayBuffer | ArrayBufferView): TmPpp {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (bytes.length < 16) throw new PppDecodeError("PPP too small");
  if (
    bytes[0] !== SIG[0] ||
    bytes[1] !== SIG[1] ||
    bytes[2] !== SIG[2] ||
    bytes[3] !== SIG[3]
  ) {
    throw new PppDecodeError(
      `Bad PPP signature ${bytes[0]?.toString(16)} ${bytes[1]?.toString(16)}`,
    );
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = view.getUint32(4, true);
  const maxX = view.getUint16(8, true);
  const maxY = view.getUint16(10, true);
  let width = view.getUint16(12, true);
  let height = view.getUint16(14, true);
  if (width === 0 || height === 0) {
    width = maxX + 1;
    height = maxY + 1;
  }
  const payload = bytes.subarray(16);
  const frames: Uint8Array[] = [];
  let pos = 0;
  const cell = width * height;
  const multi = cell <= 128 * 128 && payload.length > cell * 2;

  if (multi) {
    // Find palette first so we know where frames stop
    const { paletteOffset } = extractPcxPalette(payload, 0);
    const limit =
      paletteOffset != null && paletteOffset > 0 ? paletteOffset : payload.length;
    while (pos + 4 < limit && frames.length < 300) {
      const { indices, consumed } = decodePcxPlane(payload, width, height, pos);
      if (consumed < 2) break;
      frames.push(indices);
      pos += consumed;
    }
  } else {
    const { indices, consumed } = decodePcxPlane(payload, width, height, 0);
    frames.push(indices);
    pos = consumed;
  }

  const { palette, how } = extractPcxPalette(payload, multi ? pos : pos);
  const filled = frames[0]
    ? frames[0].reduce((a, v) => a + (v ? 1 : 0), 0)
    : 0;
  const note = `PCX-RLE frames=${frames.length} ${width}x${height} pal=${how} nz0=${filled}`;

  return {
    signature: [SIG[0], SIG[1], SIG[2], SIG[3]],
    flags,
    maxX,
    maxY,
    width,
    height,
    frameCount: frames.length,
    frames,
    palette,
    payload,
    decodeNote: note,
  };
}

/** Expand first frame to RGBA using the file palette (index 0 kept opaque). */
export function pppToRgba(
  ppp: TmPpp,
  frame = 0,
  opts?: { transparentIndex?: number },
): Uint8ClampedArray {
  const idx = ppp.frames[frame];
  if (!idx) throw new PppDecodeError(`frame ${frame} missing`);
  const pal = ppp.palette;
  if (!pal) throw new PppDecodeError("no palette");
  const rgba = new Uint8ClampedArray(ppp.width * ppp.height * 4);
  const t = opts?.transparentIndex;
  for (let i = 0; i < idx.length; i++) {
    const c = idx[i]!;
    const o = c * 3;
    const d = i * 4;
    rgba[d] = pal[o]!;
    rgba[d + 1] = pal[o + 1]!;
    rgba[d + 2] = pal[o + 2]!;
    rgba[d + 3] = t !== undefined && c === t ? 0 : 255;
  }
  return rgba;
}

export async function loadPpp(url: string): Promise<TmPpp> {
  const res = await fetch(url);
  if (!res.ok) throw new PppDecodeError(`Failed to fetch PPP ${url}`);
  return decodePpp(await res.arrayBuffer());
}
