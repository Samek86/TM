# Entity / player / input runtime structures (Tm.run)

**Date:** 2026-08-01 (deep static pass)  
**Binary:** `Tm.run` PE32 MSVC6, image base `0x00400000`  
**Source paths (assert strings):** `d:\oldtm\client\{directxs,fio,gmain,message,ninter,sprmanager,srd}.cpp`

---

## 1. Map object / FX entity pool

| Item | Value |
|------|--------|
| Base | BSS `0x43E5A0` |
| Stride | **0x2C (44)** |
| Capacity | **1000** (`cmp …, 999` / clear loop to 1000) |
| Free index | `0x44918C` |
| Template table | BSS `0x43DAB0`, stride **0x1C**, filled by BOB loader |

### Spawn (`0x402180`) field map

| Off | Type | Init | Role |
|-----|------|------|------|
| +0x00 | u32 | arg0 | type / handle param |
| +0x04 | u32 | arg1 | secondary param |
| +0x08 | u32 | sx(arg2) | template / sprite index |
| +0x0C | u8 | 1 | **alive** |
| +0x10 | u32 | `GetTickCount` | spawn time |
| +0x14 | u32 | template[+0x04] | from BOB/template row |
| +0x18 | u32 | **10** | constant (TTL/class?) |
| +0x1C | u32 | 0 | clear on pool reset |
| +0x20 | u16 | template[+0x12] | width-related |
| +0x22 | u16 | template[+0x14] | height-related |
| +0x28 | u32 | 0 | pad/extra |

Absolute field refs observed for offsets  
`0,4,8,12,16,20,24,28,32,34,36,40` within the 0x2C record.

BOB load path: `0x4022E6` → `0x40A390(path, dest=0x43DAB0)`.

---

## 2. BOB on-disk / in-memory (`0x40A390`)

```
magic u32 = 0xF0000004
count u32
count × 0x1C:
  +0x04 u16  field_a
  +0x06 u16  field_b
  +0x08 u8   flags
  +0x0A u16  field_c
  +0x0C u16  x
  +0x0E u16  y
  +0x10 u16  field_d
  +0x12 u16  width
  +0x14 u16  height
  +0x16 …    6+ bytes meta
  +0x18 u32  runtime → malloc(width*height), then fread pixels
```

After all objects: optional **SPR** load (`0x409B10`) from remaining file into global slot `0x449180`.

Implementations: `src/lib/map/bob.ts`, verified by `scripts/verify-re-formats.mjs`.

---

## 3. Network / HUD player snapshot

Debug format `I:%d hp:%d %d:%d %d %d` at `0x411720` (packet/view at `ebp+12`):

| Off | Type | Format slot |
|-----|------|-------------|
| +0x00 | u16 | `I` |
| +0x0F | char[] | name (push `base+15`) |
| +0x18 | i16 | **hp** |
| +0x1C | float | x (via `ftol`) |
| +0x20 | float | y |
| +0x28 | u32 | trailing debug field |
| +0x59 | i8 | **weapon id** (`weapon:%d ID:%s`) |

### Local slot array

| Item | Value |
|------|--------|
| Stride | **0x74 (116)** |
| Base (example stores) | `0x6A7D88` region |
| Index range | 0..99 |

Copies from network view: id word, floats x/y (duplicated to two float pairs in the 0x74 record).

Join/zone strings prove **speed/score come from server**:

- `Join %x %s x:%d y:%d %d %d speed:%d`
- `id:%s speed:%d score:%d`
- `rt!! v:%d id: %s %d %d speed:%d score:%d`

---

## 4. Weapon name table (static) vs combat numbers

| Item | Status |
|------|--------|
| Names + B/K/S | **Static** `0x439C20`, 21×23 — closed |
| UI use | `imul reg,23` + craft mask byte `0x4738E4` — draw only |
| Damage / ROF / missile speed | **Not in on-disk image** |
| Likely source | Server packets + BSS filled after enter-map; client multiplayer strings are authoritative for identity/speed |

Weapon body SPR load batch around `0x40C800` (paths under `data\wp*.spr`).

---

## 5. Input subsystem

### 5.1 GetAsyncKeyState (complete immediate list)

IAT `0x4351D8` — UI / special only:

| VK | Role |
|----|------|
| SHIFT, SPACE, ALT, ESC, ENTER, PRIOR, NEXT, END, HOME | documented in `INPUT_KEYS.md` |

### 5.2 DirectInput (primary flight)

| Item | Detail |
|------|--------|
| Import | `DINPUT!DirectInputCreateA` IAT `0x435020`, jmp thunk `0x42B698` |
| Calls | `0x40F028`, `0x40F077` region (`directxs.cpp`) |
| Data format | **Keyboard-shaped** `DIDATAFORMAT` at `0x42B3A0`: `dwDataSize=256`, `dwNumObjs=256`, objects at `0x42A3A0` |
| Also | Joystick path: `DIPH_DEADZONE`, `DIPH_RANGE`, messages *“no joystick support”* for DI 5.0 fail |
| Coop / device | `SetCooperativeLevel`, `SetDataFormat`, `CreateDevice`, `GetDeviceInfo` strings |

**There is no static DIK→action table in `.data`.**  
Registry `Control` under `Software\Pantech Net\Tactics Mercenary` is a **REG_DWORD** (not a 256-byte keymap), loaded to `0x4738C0`.

Other registry values: `Dir`, `UserID`, `Screen`, `Sound`, `ScreenMode`.

### 5.3 Revival binding policy

Until a live `GetDeviceState` dump exists:

| Action | Binding | Evidence class |
|--------|---------|----------------|
| Move | WASD / arrows | testimony + common DI defaults |
| Fire | LMB + Ctrl | official docs Ctrl + testimony |
| Special | Space | GetAsyncKeyState confirmed |
| Aim | Mouse continuous | testimony |

---

## 6. What still requires a debugger (honest)

1. Filled BSS weapon damage/ROF/speed after enter-map  
2. Exact DIK indices polled each frame from the 256-byte device state  
3. Full UDP opcode enum (need capture)  
4. DirectDraw 8-bit system palette entries at `SetPalette`  

Static **formats + loaders + struct sizes + registry layout** are closed.
