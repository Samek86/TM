/**
 * Use original TIL 6-bit DAC palettes for SPR rendering when possible.
 * Many era clients shared one active hardware palette; TIL embeds the
 * authoritative DAC for each tileset. Better than the provisional GIF ramp.
 */
import type { RgbaPalette } from "./decode";
import { getDefaultPalette } from "./decode";
import { loadTil, type TmTil } from "@/lib/map";

const cache = new Map<string, RgbaPalette>();

/** Convert TIL RGBA palette → SPR palette (index 0 transparent). */
export function tilToSprPalette(til: TmTil): RgbaPalette {
  const out = new Uint8ClampedArray(256 * 4);
  out.set(til.palette);
  out[3] = 0; // SPR index 0 = transparent
  return out;
}

export async function loadSprPaletteFromTil(
  tilUrl: string,
): Promise<RgbaPalette> {
  const hit = cache.get(tilUrl);
  if (hit) return hit;
  try {
    const til = await loadTil(tilUrl);
    const pal = tilToSprPalette(til);
    cache.set(tilUrl, pal);
    return pal;
  } catch {
    return getDefaultPalette();
  }
}

/** Best-effort default: jungle tileset (most common / first map). */
export async function loadSharedClientPalette(): Promise<RgbaPalette> {
  return loadSprPaletteFromTil("/archive/client/extracted/data/jungle.til");
}
