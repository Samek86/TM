# Input reverse engineering (Tm.run)

**Date:** 2026-08-01 (final static)  
**Binary:** `Tm.run` PE32 MSVC6, image base `0x00400000`  
**Source:** `d:\oldtm\client\directxs.cpp` (assert path)

## Subsystems

| Path | API | Role |
|------|-----|------|
| Keyboard (polled) | `USER32!GetAsyncKeyState` IAT `0x4351D8` | UI / special actions |
| Gameplay device | `DINPUT!DirectInputCreateA` IAT `0x435020` | Joystick **and** 256-byte keyboard device format |
| Mouse | Win32 / DInput | Aim (revival: continuous mouse) |

## GetAsyncKeyState call sites (complete)

Immediate `push imm8` before `call [IAT_GetAsyncKeyState]`:

| VK | Code | Sites (VA) | Likely role |
|----|------|------------|-------------|
| SHIFT | `0x10` | `0x401F1F`, `0x401F8A` | Modifier / UI |
| SPACE | `0x20` | `0x4147F0`, `0x4287E5` | **Special item** (official docs) |
| MENU (Alt) | `0x12` | `0x414D2F`, `0x414F01` | **Alt+slot items** |
| ESCAPE | `0x1B` | `0x4287F9` | Quit / cancel UI |
| RETURN | `0x0D` | `0x42880D` | Confirm / chat send |
| PRIOR | `0x21` | `0x412504`, `0x41E6F8` | UI page / list |
| NEXT | `0x22` | `0x412537`, `0x41E71D` | UI page / list |
| END | `0x23` | `0x41259B` | UI |
| HOME | `0x24` | `0x412580` | UI |

**Not** observed as GetAsyncKeyState immediates: WASD, arrows, VK_CONTROL as flight keys.

## DirectInput pipeline (structure closed)

| Step | Evidence |
|------|----------|
| `DirectInputCreateA` | jmp thunk `0x42B698`; call sites ~`0x40F028` / `0x40F077` |
| CreateDevice | string `IDirectInput::CreateDevice FAILED` |
| SetDataFormat | `DIDATAFORMAT` @ `0x42B3A0`: size=24, objSize=16, flags=2, **dataSize=256**, **numObjs=256**, rgodf=`0x42A3A0` |
| Objects | per-key `dwOfs=i`, type `0x8000000c | (i<<8)` — keyboard buttons |
| Joystick extras | `DIPH_DEADZONE`, `DIPH_RANGE`; fail strings for DI 5.0 “no joystick support” / DI 3.0 |
| Coop level | `SetCooperativeLevel FAILED` string |

**No static DIK→action table** in `.text`/`.data` immediates for W/A/S/D as buffer tests.

## Registry (`HKCU`)

Path: `Software\Pantech Net\Tactics Mercenary`

| Value | Type (from code) | Dest (example) |
|-------|------------------|----------------|
| Dir | string | install / data dir |
| UserID | string | `0x4738D0` area |
| Sound | REG_DWORD | `0x4738C4` default 1 |
| Screen | REG_DWORD | `0x4738BC` |
| ScreenMode | REG_DWORD | `0x4738B8` default 0 |
| **Control** | **REG_DWORD** | `0x4738C0` — mode flag, **not** a 256-byte keymap |

Load/save: `0x421860` / `0x421A30` / `0x421D10`.

## Revival mapping (current build)

| Action | Binding | Evidence |
|--------|---------|----------|
| Move | WASD / arrows | Default (DI table not in PE) |
| Aim | Mouse continuous | Player testimony |
| Fire | LMB (+ Ctrl alternate) | Official docs Ctrl + testimony |
| Special | Space | GetAsyncKeyState confirmed |
| Weapons 1–10 | Digit keys | Docs + common pattern |

## Debugger follow-ups (only remaining input RE)

1. Break after `GetDeviceState(256, buf)`; log which `buf[DIK_*]` bits drive thrust/turn/fire.  
2. Read live `Control` DWORD and correlate with keyboard vs joystick branch.  
3. Optional: export remapped keys if a later client version stores them (this PE does not).
