# Reverse Engineering Status (deep pass)

**Date:** 2026-08-01 (second pass)  
**Target:** `Tm.run` + extracted `data/` + `sound/`

## Binary layout

| Section | VA | On-disk | Notes |
|---------|-----|---------|--------|
| `.text` | `0x401000` | ~208 KB | Game code |
| `.rdata` | `0x435000` | ~12 KB | Imports + strings |
| `.data` | `0x438000` | **16 KB init** / **~2.7 MB virtual** | Most game tables are **BSS** (zero at load, filled at runtime) |
| `.rsrc` | `0x6DB000` | small | Resources |

This explains why weapon **damage/fire-rate tables are not findable** as static float arrays: they live in the huge zeroed `.data` BSS and are initialized in code we have not fully traced.

## Asset inventory (complete vs disk)

`Tm.run` embeds **102** fixed `data\*` / `sound\*` paths.  
Cross-check against `public/archive/extracted/`: **0 missing**.

Notable: **no `wp18` / `wp19` / `wp20`** paths exist in the binary at all.  
Names Fire Bault / Burst Launcher / Ice Bault are name-table only.

### Sprites
- Vultures: `char1-3.spr`, select `canit1-3.spr`
- FX: `ef1`, `piece`, `cop`, `cyr`, `item`
- Weapons body: `wp1-17`, `wp21`, `wp16` (no 18-20)
- Shots: `wp*sht` / `WP*SHT`, plus `wp161sht`

### Audio
- SFX: shoot1-17, 21, 161, 162, item, click, vselect, wow, gx1-2, rev, cyr, over, interback, inputsel
- BGM MIDI: tactics1,2,4,5 (no tactics3 path)

### UI
- PPP: button, chat, gameinte, hpbar, inter, inter2, interb, login0-2, msgbox, ranking, ranking2, screenc, font
- Fonts: SENG.FNT, SHAN.FNT
- Video: logo.mpg

## Confirmed tables

### Weapon names (`0x439C20`, 21 × 23 bytes)
Already documented — masks B/K/S verified again this pass.

### GetAsyncKeyState
IAT `0x4351D8`. Immediate VKs: SPACE, Alt, Esc, Enter, Shift, PgUp/PgDn/Home/End.  
**Not** WASD/arrows/Ctrl — those go through **DirectInput**.

### Vulture select UI strings
```
3> Sorcerer
2> Killers Pot
1> Born Armor
```

## Format updates

### DFX (`.dfx`, 65536 bytes)
- **All 256 rows identical** to row0.
- Effective structure: **256-byte LUT** (tiled).
- Not a lighting table. Likely palette/material category remap or damage class map.
- Only **1 fixed point** (index maps to itself) — highly non-identity.

### LFX (`.lfx`, 65536 bytes)
- **`light (0-255) × color_index (0-255)` → new palette index**.
- Light 0: mostly identity (20 indices differ).
- Higher lights: heavy remapping (day/night, height shading, or flash).
- Suitable for software lighting on 8-bit surfaces.

### PPP (UI)
```
u8 a=10, b=5, c=1, d=8   // constant magic/version
u32 flags (=0)
u16 max_x, max_y         // often 639, 479
u16 width, height        // often 640, 480 (Login0 has 0,0)
// +16: RLE/image payload (uses 0x0B patterns similar to SPR)
```

### MAP / TIL / SPR / BOB
Unchanged; still valid as previously documented.

## What is still NOT reversed

| Item | Status | Why hard |
|------|--------|----------|
| Weapon damage / ROF / bullet speed numbers | Open | BSS runtime init |
| Vulture HP/accel tables | Open | BSS / not near name strings |
| DirectInput key binding table | Closed as absent | DI keyboard 256-format + joy props; Control=REG_DWORD; no DIK table in PE |
| PPP full bitmap | **Closed** | PCX RLE + palette; 18/18 |
| Entity 0x2C / player 0x74 | **Closed sizes** | spawn + HP view fields mapped |
| Weapon combat floats | Open (BSS/server) | not on disk |
| Full BOB graph fields | Partial | Mixed link/coord records |
| SPR system palette | Open | DirectDraw runtime palette |
| Network opcodes | Partial | Need capture |
| PPP full RLE | Partial | Header only |

## Implications for revival

1. **All ship assets are already extracted** — no more files hiding in the EXE paths list.
2. Combat numbers must be **tuned or live-traced**, not dumped from a simple .data table.
3. Lighting authenticity → apply **LFX** to 8-bit indices before palette expand.
4. DFX → research as material remap, not required for free-flight visual map.
5. Movement authenticity → reverse **DirectInput** device state parsing next.

## Files produced
- `docs/reversing/RE_STATUS_2026-08.json` — machine-readable dump
- This document
