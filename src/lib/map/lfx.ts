/**
 * LFX / DFX — fully reversed static structure (Tm.run deep pass 2026-08).
 *
 * LFX: light[256][colorIndex] → remapped palette index (software lighting).
 * DFX: 256-byte LUT tiled 256× (material/palette category remap, NOT lighting).
 */
export class LfxDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LfxDecodeError";
  }
}

export interface TmLfx {
  /** 256×256 table, index = light * 256 + color */
  table: Uint8Array;
  /** True if light 0 is mostly identity */
  light0NearIdentity: boolean;
}

export interface TmDfx {
  /** Effective 256-byte remap (all rows identical on shipped files) */
  lut: Uint8Array;
  rowsIdentical: boolean;
}

export function decodeLfx(buf: ArrayBuffer | ArrayBufferView): TmLfx {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (bytes.length !== 65536) {
    throw new LfxDecodeError(`LFX size ${bytes.length}, expected 65536`);
  }
  const table = bytes.slice();
  let same = 0;
  for (let i = 0; i < 256; i++) if (table[i] === i) same++;
  return { table, light0NearIdentity: same >= 200 };
}

export function decodeDfx(buf: ArrayBuffer | ArrayBufferView): TmDfx {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  if (bytes.length !== 65536) {
    throw new LfxDecodeError(`DFX size ${bytes.length}, expected 65536`);
  }
  const lut = bytes.slice(0, 256);
  let rowsIdentical = true;
  for (let r = 1; r < 256; r++) {
    for (let i = 0; i < 256; i++) {
      if (bytes[r * 256 + i] !== lut[i]) {
        rowsIdentical = false;
        break;
      }
    }
    if (!rowsIdentical) break;
  }
  return { lut, rowsIdentical };
}

/** Remap 8-bit index through light level (0–255). */
export function lfxRemap(lfx: TmLfx, light: number, colorIndex: number): number {
  const L = Math.max(0, Math.min(255, light | 0));
  const c = Math.max(0, Math.min(255, colorIndex | 0));
  return lfx.table[L * 256 + c]!;
}

export function dfxRemap(dfx: TmDfx, index: number): number {
  return dfx.lut[index & 0xff]!;
}

/**
 * Apply LFX lighting to an 8-bit index buffer → new indices.
 * lightMap: per-pixel 0–255 (e.g. from height or constant).
 */
export function applyLfxToIndices(
  indices: Uint8Array,
  lfx: TmLfx,
  light: number | Uint8Array,
): Uint8Array {
  const out = new Uint8Array(indices.length);
  if (typeof light === "number") {
    const L = Math.max(0, Math.min(255, light | 0));
    for (let i = 0; i < indices.length; i++) {
      out[i] = lfx.table[L * 256 + indices[i]!]!;
    }
  } else {
    for (let i = 0; i < indices.length; i++) {
      const L = light[i] ?? 0;
      out[i] = lfx.table[(L & 0xff) * 256 + indices[i]!]!;
    }
  }
  return out;
}
