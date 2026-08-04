# Tactics Mercenary (택틱스 머셔너리) — Binary Reverse Engineering Report

**Target:** Pantech Net client v1.2 (1999)  
**Analyzed:** 2026-08-01  
**Method:** Static PE analysis (pefile), string extraction, objdump (i386), asset header parsing  
**Packing:** None (unpacked MSVC 6.0 PE, entropy ~6.0–6.5)

---

## 1. Binary inventory

| File | Size | Role | Build timestamp (PE) | Compiler |
|------|------|------|----------------------|----------|
| **tm.exe** | 143,360 | Launcher / updater / HTTP patcher | 1999-09-29 | MSVC 6.0 (`VC20XC00U`) |
| **Tm.run** | 249,856 | **Main game client** | 1999-10-13 | MSVC 6.0 |
| **tmup.run** | 24,576 | Hot-swap updater (rename `tmnew.exe` → `tm.exe`) | 1999-03-29 | MSVC 6.0 |
| **DirtStrDll.dll** | 28,672 | Chat profanity filter | 1999-07-19 | MSVC 6.0 |
| tm10.exe | ~4.1MB | InstallShield installer (v1.0 package) | 1998-03-26 | InstallShield |
| Setup.exe / _Setup.dll | — | InstallShield 16-bit NE stubs | — | — |

### Architecture
- **PE32 / i386** only
- GUI subsystem (`IMAGE_SUBSYSTEM_WINDOWS_GUI`)
- Image base `0x00400000` (exe), `0x10000000` (DirtStrDll)
- No ASLR / DEP / SafeSEH (1999-era PE)

---

## 2. Process architecture (launch chain)

```
tm.exe  (launcher)
  │  1. Registry: HKCU\Software\Pantech Net\Tactics Mercenary
  │  2. Optional HTTP update from tactics.pannet.co.kr / channeli.net
  │  3. bzip2 decompress of patch payloads (libbzip2 0.9.0c embedded)
  │  4. May spawn tmup.run for atomic binary replace
  │  5. WinExec / CreateProcess → "tm.run %s %d"
  ▼
Tm.run  (game)
  │  Loads DirtStrDll.dll (CDirtModify for chat)
  │  DirectDraw + DirectSound + DirectInput 3.0/5.0
  │  Winsock2 UDP-style game socket
  ▼
Game loop / map server connection
```

### Command line
```
tm.run %s %d
```
Likely: `tm.run <server_or_userid> <port_or_flag>` (exact argv roles not fully resolved statically).

### Registry
```
Software\Pantech Net\Tactics Mercenary
  ScreenMode
  UserID
  (install path / other settings)
```

---

## 3. Main client — Tm.run

### 3.1 Imports (capability map)

| Subsystem | DLL | Key APIs |
|-----------|-----|----------|
| **Graphics** | DDRAW.dll | `DirectDrawCreate` |
| | GDI32.dll | `StretchDIBits`, `TextOutA`, `CreateFontA` |
| **Input** | DINPUT.dll | `DirectInputCreateA` (+ fallback path for 3.0 / 5.0 joystick) |
| | USER32 | `GetAsyncKeyState`, window msg pump |
| **IME (Korean)** | IMM32.dll | `ImmGetContext`, `ImmGet/SetConversionStatus` |
| **Audio FX** | DSOUND.dll | ordinal 1 (`DirectSoundCreate`) |
| **Music** | WINMM.dll | `mciSendStringA` (MIDI via sequencer alias `MUSIC`) |
| | WINMM mixer* | volume UI (music/SFX sliders) |
| **Network** | WS2_32.dll | `WSASocketA`, `sendto`, `recvfrom`, `gethostbyname`, `setsockopt`, … |
| **Chat filter** | DirtStrDll.dll | `CDirtStrDll` ctor, `CDirtModify` |
| **COM** | ole32 | `CoInitialize`, `CoCreateInstance` (DirectX helper) |

**Note:** `send`/`recv`/`connect` appear in the import table but have **zero call sites** in `.text`. All live traffic goes through **`sendto` / `recvfrom`** (connectionless datagram model).

### 3.2 Source file leftovers (debug paths)
Embedded assert / error paths reveal original tree:

```
d:\oldtm\client\gmain.cpp       — main loop / WinMain
d:\oldtm\client\directxs.cpp    — DirectX init
d:\oldtm\client\fio.cpp         — file I/O
d:\oldtm\client\message.cpp     — UI messages / lang strings
d:\oldtm\client\ninter.cpp      — network interface
d:\oldtm\client\sprmanager.cpp  — sprite manager
d:\oldtm\client\srd.cpp         — shared runtime / util
```

### 3.3 Window / brand
- Window class / title: **`TactApp`**, caption **`Tactics Mercenary(v 1.2)`**
- Company string: **`PANTECH NET`** / **`PANACT01`**

### 3.4 Credits (embedded)
| Role | Name |
|------|------|
| Design | Oh SeoungEan (eany) |
| Server programming | Hong Myung Goo |
| Sound | Rim JaeWook (MusicFighter) |
| Staff | Kook kyungmok (Doogie), Shin JinHo (laputan), Hwang sooyong (Him), Song Youngkook (MAYA), Shin Hwakook (Micael), Kook Hyunsub (khs) |

---

## 4. Network protocol (from disassembly)

### 4.1 Socket setup (`0x41F000` region)

```c
// reconstructed
WSAStartup(0x0102, &wsaData);           // Winsock 1.1
SOCKET s = WSASocketA(
    AF_INET,     // 2
    /*type*/ 3,  // SOCK_RAW on Win32 — see note
    /*proto*/ 1,
    NULL, 0, 0);
setsockopt(s, SOL_SOCKET, SO_SNDTIMEO, &timeout_ms=1000, 4); // 0x1005
setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &timeout_ms=1000, 4); // 0x1006
gethostbyname(hostname);  // or inet_addr fallback
// sockaddr_in filled; htons on port
```

**Latency gate:** client runs a **5-probe ping loop** (`counter init=5`), each iteration:
1. Build packet (~**0x20 + 0x0C = 44** base size region; buffers allocated **0x400**)
2. Stamp `GetTickCount()` into packet offset `+0x08`
3. Sequence word at `+0x06`, field at `+0x02` (checksum/len written by helper `0x41F520`)
4. `sendto` → `recvfrom`
5. On `WSAEWOULDBLOCK` (`0x274C`) retry; else error
6. `Sleep(1000)` between probes
7. Average RTT stored; if **≥ 1000ms**, login rejected (matches `lang.*` strings)

This matches official copy: *“통신 속도가 1000ms 이상의 사용자의 경우 게임의 접속을 제한”*.

### 4.2 Observed debug / event strings (server→client semantics)

| String | Meaning |
|--------|---------|
| `Recv : 0x%x 0x%x` | Packet opcode / subcode dump |
| `Join %x %s x:%d y:%d %d %d speed:%d` | Player join snapshot |
| `start!! v:%d id: %s %d %d speed:%d score:%d` | Match start |
| `Pilot %s is entering this zone.` | Zone enter broadcast |
| `Pilot %s is escaped this zone.` | Leave / disconnect |
| `BPilot %s is crushed by %s.` | Kill feed |
| `weapon:%d ID:%s` | Weapon state |
| `I:%d hp:%d %d:%d %d %d` | Entity HP / status |
| `id:%s speed:%d score:%d` | Scoreboard line |
| `Other Player :%d` | Remote player count |
| `MAX item :%d` | Ground item cap |
| `AIndex:%d x:%lf y:%lf id:%s` | Entity index + double coords |
| `[Login]` / `[Connect]` | UI state labels |
| `Too many users` / map server errors | Capacity / map routing |

### 4.3 Protocol shape (inferred)

```
UDP-like datagram, custom binary header:

  +0x00  ? magic / length
  +0x02  u16  checksum or payload length (written post-build)
  +0x06  u16  sequence
  +0x08  u32  GetTickCount timestamp (RTT probes)
  +0x0C… payload (opcodes drive Join/HP/weapon/…)
```

Full opcode table needs dynamic tracing (server dead). Static evidence is sufficient for a revival **client-prediction + simplified lobby** design.

---

## 5. Gameplay systems (static evidence)

### 5.1 Vultures (playable craft)
Hard-coded select list:
1. **Born Armor**
2. **Killers Pot** (Killer Pod)
3. **Sorcerer**

Sprites: `data\char1.spr`, `char2.spr`, `char3.spr`  
Select VFX: `canit1/2/3.spr`  
Death/debris: `piece.spr`, effects `ef1.spr`, `cop.spr`, `cyr.spr`

### 5.2 Weapons (name table in binary)
| Name | Notes |
|------|-------|
| Vulcan Cannon | Default ballistic |
| ATi-Gun | |
| EM-Gun | |
| Gun Cannon | |
| Laser Cannon | |
| Multi Missiler | |
| Tow Missile | |
| Fire Bomb | |
| Ice Bault / Fire Bault | Beam variants (typo “Bault”=Bolt) |
| Lust Cannon | |
| Blazing Beam | |
| Burst Launcher | |
| Plazma Shooter | |
| Paranoid Shooter | |
| Burst Apocalypse | |
| S-mine | |
| Slayer / Spiner / Stinger / Tomahawk | |

On-disk sprites: `wp1.spr`…`wp21.spr`, shot FX `wp*sht.spr` / `WP*SHT.SPR`, plus `sound\shoot1.wav`…`shoot162.wav`.

### 5.3 Maps
Loaded as `data\%s.map` + linked `til` / `bob` / `dfx` / `lfx`:

| Map file | Size (tiles) | Linked assets |
|----------|--------------|---------------|
| jungle / JUNGLE.MAP | **400×170** | jungle.til, jungle.bob |
| jungle2.map | **300×300** | jungle.* |
| vil.map | **600×320** | vil.* / VIL.* |
| z-desert.map / z-desert2.map | **240×120** | z-desert.* |

### 5.4 Resolutions
UI strings + PPP canvases:
- 640×480, 800×600, 1024×768
- Default PPP frame often **639×479** (0-based 640×480)

### 5.5 Controls
- Keyboard via `GetAsyncKeyState`
- Joystick via DirectInput 5.0 (fallback message if missing)
- IME for Korean chat input
- Touch not present (native Win32 only)

### 5.6 Chat / social
- Chat UI: `data\chat.ppp`
- Profanity filter via DirtStrDll (EN + CP949 Korean banlist)
- Kill/zone messages are server-driven formatted strings

---

## 6. DirtStrDll.dll — chat filter

### Exports (MSVC decorated)
```
??0CDirtStrDll@@QAE@XZ              CDirtStrDll::CDirtStrDll()
??4CDirtStrDll@@QAEAAV0@ABV0@@Z     operator=
?CDirtModify@CDirtStrDll@@QAEXPAD@Z CDirtStrDll::CDirtModify(char*)
?fnDirtStrDll@@YAHXZ
?nDirtStrDll@@3HA
```

### `CDirtModify` algorithm (disasm `0x10001040`)
1. For each character position in the input C-string  
2. Walk wordlist entries at `0x10005030`, **stride 10 bytes** each  
3. `strncmp`-style compare (`0x10001100`)  
4. On match, overwrite matched span with **`0x78` (`'x'`)** repeated (`0x78787878` dword fill)  
5. Advance to next character

### English banlist (confirmed)
`asshole`, `bitch`, `fuck`, `hell`, `sex`, `suck`  
(+ many CP949 Korean tokens in same table)

---

## 7. Asset formats

### 7.1 `.SPR` — sprite sheet (**완전 해석**, 49/49 검증)

구현: `src/lib/spr/decode.ts` · 로더: `Tm.run` `0x409b10` · 프레임 stride `0x34`.

```
// header (LE)
char magic[3] = 'SPR'          // 3 bytes only
u32  reserved = 0
u16  type     = 0 | 1 | 2
u32  frames
u16  global[4]                 // only if type <= 1

// per frame
u32  compressed_size
u16  width, height
u16  points_a[N], points_b[N]  // N=1 (type0) / 10 (type1) / 3 (type2)
u8   rle[compressed_size]
```

**RLE (per row):** `u16 row_byte_len` then ops:  
`0x0A n` skip · `0x0B n` + n literals · `0x0C n` + n×4 literals · `0x0D` EOL.  
Palette index 0 = transparent. 원본 DD 8-bit 팔레트는 미확보(임시 팔레트 사용).

Craft bodies: **120** direction frames (3° yaw). Shot/FX: smaller counts.  
사전 디코드: `public/archive/art/spr_decoded/`.

### 7.2 `.MAP` — terrain
```
u16 version = 2
u16 flags   = 0xF000
u16 width
u16 height
u32 size_field = 52 + width*height*2   // header + height layer
char name_til[20]  // e.g. "jungle" + "til"
char name_bob[20]  // e.g. "jungle" + "bob"
… pad to 52 …
u16 heightmap[width*height]            // first layer (size_field-52)
u32 layer2[width*height]               // second layer (tile/object attrs)
```
Verified: `filesize == size_field + width*height*4` for all five maps.

### 7.3 `.TIL` / `.BOB`
- **TIL:** tile bitmap bank (header `01 00 00 F0 …`)
- **BOB:** object/building placements (`04 00 00 F0` + count)

### 7.4 `.DFX` / `.LFX`
- Both **exactly 65536 bytes** (256×256 tables)  
- LFX often identity 0..255 ramp → lighting / fog LUT  
- DFX → damage / collision / height auxiliary

### 7.5 `.PPP` — UI panel (Pantech Picture?)
```
u8  0x0A, 0x05, 0x01, 0x08   // signature / version
u32 0
u16 width-1, height-1        // e.g. 639,479 → 640×480
u16 paramA, paramB           // hotspot / virtual size
// followed by compressed/raw pixel payload
```

### 7.6 Fonts / lang
- `SENG.FNT`, `SHAN.FNT` — bitmap fonts  
- `lang.kor` (EUC-KR), `lang.eng` — UI string tables (newline separated)

### 7.7 Audio
- WAV one-shots under `sound\`  
- MIDI BGM: `tactics1/2/4/5.mid` via MCI `open %s type sequencer alias MUSIC`  
- Opening: `data\logo.mpg` (MPEG-1 system stream)

---

## 8. Launcher — tm.exe

| Feature | Evidence |
|---------|----------|
| HTTP update | WinINet: `InternetOpen/Connect`, `HttpOpenRequest/SendRequest`, UA `Mozilla/4.0 … Proudhon's Bot` |
| Hosts | `tactics.pannet.co.kr`, `http://www.pannet.co.kr/tactics/tm.htm` |
| ID service | `http://home.channeli.net/game/IDFetch/IDFetch.asp` |
| Compression | Embedded **bzip2 0.9.0c** (Julian Seward) |
| Launch | `tm.run %s %d` |
| Update swap | writes `tmnew.exe`, runs `tmup.run` → `MoveFileA` over `tm.exe` |
| Registry | `Software\Pantech Net\Tactics Mercenary` |
| Single instance | `FindWindowA` / “TM can not be run on more than two applications” |

---

## 9. tmup.run

Minimal GUI helper:
- Imports only KERNEL32 + USER32 (`MoveFileA`, `DeleteFileA`, `FindWindowA`, `PostMessageA`)
- Replaces running binary after quit — classic self-update pattern for Win9x.

---

## 10. Security / reverse notes

| Topic | Finding |
|-------|---------|
| Packer | **None** — clean MSVC link |
| Strings | Mostly plaintext (weapons, paths, protocol debug) |
| Chat filter | Client-side only (trivial to bypass) |
| Auth | Password checked server-side; client only validates non-empty / match confirm |
| Anti-cheat | Not observed beyond single-instance window check |
| Protocol crypto | No obvious crypto imports; assume **plaintext datagrams** |

---

## 11. Revival implications

1. **Client is fully recoverable as offline/local sim** — rendering stack is classic DirectDraw surface blit + SPR; can reimplement on Canvas/WebGL.  
2. **120-frame craft sprites** → interpolate or step yaw by 3°.  
3. **MAP height + attr layers** → implement terrain occlusion / flight height (original “quarter-view” height combat).  
4. **Network** → original servers gone; revival should use new protocol or pure local bots (current web prototype path).  
5. **Do not ship DirtStrDll banlist blindly** — historical slur list; replace with modern moderation if online.  
6. **Legal:** assets are Pantech Net IP; archival/research vs public redistribution is a separate decision.

---

## 12. Tooling artifacts in this repo

```
docs/reversing/pe_analysis.json          — full PE metadata
docs/reversing/imports_*.txt             — per-binary import lists
docs/reversing/strings_*_cats.txt        — categorized strings
docs/reversing/strings_*_all.txt         — full unique strings
docs/reversing/REVERSE_ENGINEERING.md    — this document
```

---

## 13. Residual unknowns (need dynamic RE / server)

- Exact `WSASocket` type/protocol intent (raw vs historical constant misuse)
- Full opcode enum for combat packets
- Server-side map routing / DB schema
- ~~Precise SPR pixel codec~~ ✅ (see §7.1); original DD palette still provisional
- Default game server host:port baked vs registry/config only

*End of report.*
