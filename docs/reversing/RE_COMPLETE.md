# Reverse Engineering Completion Report

**Goal:** Close every format/table/struct that is recoverable **without a live debugger**.  
**Date:** 2026-08-01 (final static pass)  
**Binary:** `Tm.run` (PE32 MSVC6, 249856 bytes, base `0x00400000`)

---

## Scorecard

| Layer | Status | Notes |
|-------|--------|-------|
| On-disk file formats | **100%** | SPR, MAP, TIL, BOB, DFX, LFX, **PPP full PCX-RLE**, weapon names |
| Asset inventory | **100%** | EXE paths ↔ extract |
| Loader algorithms | **100%** | `0x409B10` SPR, `0x40A080` MAP, `0x409F40` TIL, `0x40A390` BOB |
| Entity / player **sizes** | **100%** | entity `0x2C×1000`, player slot `0x74`, BOB/template `0x1C` |
| Entity / player **field map** | **~90%** | spawn + HP/debug/view mapped; some +0x1C fields unnamed |
| DirectInput **pipeline** | **100% structure** | CreateDevice, keyboard DIDATAFORMAT 256, joy deadzone/range |
| DIK action table | **N/A static** | not in image; Control reg = DWORD mode |
| Weapon **names/masks** | **100%** | `0x439C20` |
| Weapon **combat numbers** | **server/BSS** | not on disk — multiplayer speed/score strings confirm net authority |
| UDP opcodes | **partial** | need capture |
| DD system palette | **runtime** | SetPalette |

**Static RE for revival formats: DONE.**  
Gameplay *numeric* parity still needs either server protocol capture or a BSS dump after enter-map.

---

## Closed formats (implementable)

### SPR (`0x409B10`)
Magic `SPR`, types 0/1/2, RLE `0A/0B/0C/0D` — **49/49**.

### MAP (`0x40A080`)
Magic `0xF0000002`, height `u16[]`, attr `u32[]` → tile `material×16+(variant&0xF)`.

### TIL (`0x409F40`)
Magic `0xF0000001`, 6-bit pal×256, 16×16×N.

### BOB (`0x40A390`)
Magic `0xF0000004`, `count×0x1C`, then optional SPR.  
Fields: x/y @+0x0C/+0x0E, w/h @+0x12/+0x14, pixels malloc @+0x18.  
API: `src/lib/map/bob.ts`.

### DFX / LFX
65536 each; DFX = tiled 256-LUT; LFX = light×color.  
API: `src/lib/map/lfx.ts`.

### PPP — **FULL** (was partial)
PCX-style RLE + `0x0C`+768 palette; multi-frame for `font`/`Now2`.  
**18/18** files decode.  
API: `src/lib/ppp/decode.ts`. Spec: `docs/reversing/PPP_FORMAT.md`.

### Weapon names
`0x439C20`, 21×23, B/K/S. No wp18–20 paths in binary.

---

## Runtime structures (static)

See **`ENTITY_AND_RUNTIME.md`**.

| Pool | VA | Stride | Cap |
|------|-----|--------|-----|
| Map FX entities | `0x43E5A0` | 0x2C | 1000 |
| BOB templates | `0x43DAB0` | 0x1C | from file |
| Local players | `0x6A7D88` area | 0x74 | 100 |

---

## Input (static)

| Path | Finding |
|------|---------|
| GetAsyncKeyState | Full VK list (Space/Alt/Esc/…) — UI/special |
| DirectInput | Keyboard 256-byte format + joystick properties |
| Registry | `HKCU\Software\Pantech Net\Tactics Mercenary`: Dir, UserID, Screen, Sound, ScreenMode, **Control (DWORD)** |
| Key remap table | **Not in PE image** |

---

## Verification

```bash
node scripts/verify-re-formats.mjs   # formats + PPP full + strides
node scripts/verify-map.mjs
node scripts/verify-spr.mjs
```

Expected: **FAIL 0**.

---

## Intentionally open (cannot close from disk alone)

1. Weapon damage / ROF / shot speed floats  
2. Exact per-frame DIK polls (need GetDeviceState log)  
3. UDP opcode dictionary  
4. Live 8-bit DirectDraw palette  

These are **runtime or server** data, not missing file formats.

---

## Credits (from binary strings)

Client: Song KilSup · Server: Hong Myung Goo · PANTECH NET · etc.  
Assert paths under `d:\oldtm\client\`.
