# PPP format (100% static)

**Status:** Closed — all 18 client `.ppp` files decode to full pixel planes + palette.

## Layout

| Off | Type | Meaning |
|-----|------|---------|
| 0 | `u8×4` | `0A 05 01 08` |
| 4 | `u32` | flags (0) |
| 8 | `u16` | max_x (inclusive) |
| 10 | `u16` | max_y |
| 12 | `u16` | width (`0` → max_x+1) |
| 14 | `u16` | height (`0` → max_y+1) |
| 16 | bytes | PCX RLE payload + palette |

## Payload codec

Identical to **8-bit PCX RLE**:

- If `(byte & 0xC0) == 0xC0`: run length = `byte & 0x3F`, next byte = value  
- Else: single literal pixel  
- Decode **per scanline** of `width` samples for `height` rows  

Trailer: classic PCX `0x0C` + **768-byte RGB** palette (may be preceded by a few pad bytes).

## Multi-frame atlases

When `width×height` is small and the file is large:

| File | Cell | Frames (this pack) |
|------|------|--------------------|
| `font.ppp` | 76×76 | 35 |
| `Now2.ppp` | 72×72 | 70 |

Frames are sequential RLE streams sharing one trailing palette. Header `max_x/max_y` still describe the logical UI surface (e.g. 639×479).

## Implementation

- `src/lib/ppp/decode.ts` — `decodePpp`, `decodePcxPlane`, `pppToRgba`  
- Sample: `docs/reversing/samples/Login0_decoded.png`  
- Verify: `node scripts/verify-re-formats.mjs` (PPP full decode checks)

## Path pattern in client

`data\now%d.ppp` plus fixed UI names (`Login0`, `Gameinte`, `HPBAR`, …).
