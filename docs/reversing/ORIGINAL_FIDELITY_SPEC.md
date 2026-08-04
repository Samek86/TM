# Tactics Mercenary — 원본 동일 구현을 위한 데이터 스펙

목표: 맵 · 비행기(Vulture) · 미사일/무기 를 **원본과 동일**하게 TS(또는 다른 언어)로 복원.  
이 문서는 현재까지 **정적 리버싱 + 공식 웹 + 클라이언트 파일**로 확정·추정한 정보를 모은다.

관련 파일:
- `docs/reversing/REVERSE_ENGINEERING.md` — 바이너리/프로토콜
- `docs/reversing/original_data_catalog.json` — 기계 판독용 카탈로그
- `public/archive/client/extracted/` — 원본 바이너리·에셋
- **`src/lib/spr/decode.ts`** — SPR 디코더 구현 (검증 완료)

---

## 0. TS로 “완벽 복원”이 가능한가?

**가능하다.** 원작은 3D 엔진이 아니라:

- 2D 스프라이트 (`SPR`) + 쿼터뷰
- 높이맵 기반 지형
- DirectDraw 블릿 수준의 렌더
- UDP 커스텀 패킷

브라우저 Canvas/WebGL + ArrayBuffer 파서로 **픽셀·물리·패킷 단위 재현**이 이론상 가능하다.  
TS를 고르는 실질 이유:

| 이점 | 설명 |
|------|------|
| 원본 에셋 직행 | `.spr/.map/.til` 을 서버 없이 파싱해 렌더 |
| 배포 | 설치 없이 즉시 플레이(부활 접근성) |
| 디버그 | 맵/스프라이트 뷰어를 웹에 붙여 고증 검증 쉬움 |
| 성능 | 60fps 마케팅 스펙, 맵 최대 600×320 타일 — JS/Wasm으로 충분 |

C#이 유리한 영역(네이티브 디버거, 서버)과 충돌하지 않음.  
**에셋 고증 코어를 TS(+필요 시 Wasm)로 두고**, 나중에 네이티브 클라를 붙여도 된다.

---

## 1. 확정된 게임 정체

| 항목 | 값 |
|------|-----|
| 제목 | Tactics Mercenary (택틱스 머셔너리) |
| 클라 버전 문자열 | `Tactics Mercenary(v 1.2)` |
| 제작 | Pantech Net / PANACT01 |
| 장르 | 소형 Vulture 공중 슈팅, 멀티 + (시나리오 모드 시) 몹 |
| 시점 | 쿼터뷰 2D, **지형 높이**가 핵심 |
| 목표 FPS (공식) | **60fps** |
| 해상도 | 640×480 / 800×600 / 1024×768 |
| 권장 (1999) | P166, RAM32, VGA2MB, 33600bps+ |

공식 차별점 (`pannet_tm.htm`):
1. 시나리오/존 단위 목적  
2. Battle Field 모드의 서버 컨트롤 **Mob/NPC**  
3. **지형·높낮이** (높이값이 게임 전반에 영향)

---

## 2. Vulture (비행기) — 원본 3종

선택 UI 문자열 순서:

```
1> Born Armor
2> Killers Pot
3> Sorcerer
```

| ID | 이름 | 스프라이트 | 선택 애니 | 공식 스펙 (웹) |
|----|------|------------|-----------|----------------|
| 1 | **Born Armor** | `char1.spr` | `canit1.spr` | 형식 XRb 324-A Krisaris BA / 엔진 354KW / 중량 12T / **속도 12** / 범용 밸런스 |
| 2 | **Killers Pot** | `char2.spr` | `canit2.spr` | (웹 전문 일부 유실) 단거리 화력·EM-Gun 특화 |
| 3 | **Sorcerer** | `char3.spr` | `canit3.spr` | (웹 전문 일부 유실) 접근 전격 |

### 스프라이트 관찰
- `char1/2/3.spr`: 매직 `SPR`, **type=1**, **frames=120**  
  → 360° / 120 = **3° 단위 선회 프레임** 확정
- 파괴 파편: `piece.spr` (63프레임)
- 이펙트: `ef1.spr`, `cop.spr`, `cyr.spr`

### 미확보 (추가 리버싱 필요)
- HP / 가속도 / 선회율 / 충돌 반경의 **수치 테이블** (이름·속도 12 외 미확정)
- Killers·Sorcerer 공식 스펙 페이지 (Born만 character.htm 잔존)

---

## 3. 무기·미사일 — 21종 + 기체 마스크

### 3.1 바이너리 테이블 (Tm.run `0x39C20`)

**레코드 크기: 23바이트 (0x17)** × 21개

```
struct WeaponNameRec {          // 23 bytes
  char name[20];                // null-terminated, rest zero-padded
  uint8_t usable_born;          // 1 = Born Armor 사용 가능
  uint8_t usable_killers;       // 1 = Killers Pot
  uint8_t usable_sorcerer;      // 1 = Sorcerer
};
```

| ID | 이름 | B | K | S | 바디 스프라이트 | 샷 스프라이트 | SFX |
|----|------|---|---|---|-----------------|---------------|-----|
| 1 | Vulcan Cannon | ● | ● | ● | wp1.spr | WP1SHT.SPR | shoot1.wav |
| 2 | ATi-Gun | ● | | | wp2.spr | WP2SHT.SPR | shoot2.wav |
| 3 | EM-Gun | | ● | | wp3.spr | WP3SHT.SPR | shoot3.wav |
| 4 | Plazma Shooter | | | ● | wp4.spr | wp4sht.spr | shoot4.wav |
| 5 | Gun Cannon | ● | | | wp5.spr | wp5sht.spr | shoot5.wav |
| 6 | Laser Cannon | ● | | | wp6.spr | WP6SHT.SPR | shoot6.wav |
| 7 | Spiner | ● | ● | | wp7.spr | WP7SHT.SPR | shoot7.wav |
| 8 | Slayer | | | ● | wp8.spr | wp8sht.spr | shoot8.wav |
| 9 | Paranoid Shooter | | ● | ● | wp9.spr | WP9SHT.SPR | shoot9.wav |
| 10 | S-mine | ● | | ● | wp10.spr | WP10SHT.SPR | shoot10.wav |
| 11 | Fire Bomb | | ● | | wp11.spr | WP11SHT.SPR | shoot11.wav |
| 12 | Stinger | ● | | ● | wp12.spr | WP12SHT.SPR | shoot12.wav |
| 13 | Multi Missiler | | ● | ● | wp13.spr | WP13SHT.SPR | shoot13.wav |
| 14 | Tow Missile | | ● | ● | wp14.spr | WP14SHT.SPR | shoot14.wav |
| 15 | Tomahawk | ● | | | wp15.spr | WP15SHT.SPR | shoot15.wav |
| 16 | Burst Apocalypse | | ● | | WP16.SPR | WP16SHT / WP161SHT | shoot16/161/162 |
| 17 | Blazing Beam | ● | | ● | wp17.spr | WP17SHT.SPR | shoot17.wav |
| 18 | Fire Bault | ● | | | *(wp18 없음)* | *(샷 파일 없음)* | ? |
| 19 | Burst Launcher | | ● | | *(wp19 없음)* | 없음 | ? |
| 20 | Ice Bault | | | ● | *(wp20 없음)* | 없음 | ? |
| 21 | Lust Cannon | | ● | | wp21.spr | wp21sht.spr | shoot21.wav |

> **주의:** 이름 테이블은 21개이나, 추출 클라이언트에 **wp18–20 바디 스프라이트가 없음**.  
> ID↔파일 1:1 가정이 18–20에서 깨질 수 있음. 설치 패키지 전체 또는 다른 버전 클라 교차 확인 필요.

### 3.2 공식 웹 설명 (weapon.htm, 상세 5종만 잔존)

| 웹 설명 순서 | 내용 | 클라 대응 추정 |
|--------------|------|----------------|
| 기본 3연발 Shell, 전 기체, 레벨업 시 공격력↑ | **Vulcan Cannon** | ID1 |
| 단발, Born 전용, Vulcan 개량, 연사·화력↑ Special Shell | **ATi-Gun** | ID2 |
| 단발 전방, 단거리 고화력, Killers, Special Shell | **EM-Gun** | ID3 |
| 접근 전격, Sorcerer, Special Shell | 웹명 Dragon Teeth? / 클라 **Plazma Shooter** 또는 별명 | ID4 유력 |
| 포획·추적(자신 제외), Born+Killers, Energy Shell | 웹명 Catcher / 클라 에너지 계열 중 하나 | 마스크 B+K 후보: Spiner(ID7) 등 |

탄종 키워드: **Shell / Special Shell / Energy Shell**

### 3.3 발사·전투 관련 클라 문자열
- `weapon:%d ID:%s`
- `BPilot %s is crushed by %s.` — 킬 피드
- `I:%d hp:%d %d:%d %d %d` — 엔티티 HP 디버그
- `MAX item :%d` — 필드 드롭 상한
- 아이템 스프라이트: `item.spr` (22프레임)

### 3.4 미확보 / 부분 확보
- [x] 21 이름 + B/K/S 마스크 + body/shot 파일 매핑 → `WEAPON_TABLE.json` / `src/data/weapons.ts`
- [ ] 데미지·연사·탄속 **런타임 수치 테이블** (on-disk .data에 21-float 조밀 배열 없음 — BSS/동적 초기화 추정)
- [ ] 히트박스 / 폭발 반경 / 유도 플래그
- 레벨업 곡선 (Vulcan “레벨업 시 공격력↑”)
- 무기 슬롯 10개와 21종 해금/픽업 규칙

부활 빌드는 **탄속 = 기체속도 비율**, 데미지는 기체 `damageMul`×무기 기본값으로 운용.

---

## 4. 맵 — 포맷 (정적 분석으로 검증됨)

### 4.1 파일 세트
맵 1개 = 보통 다음 묶음:

| 확장자 | 역할 |
|--------|------|
| `.map` | 헤더 + 높이맵 + 타일/속성 레이어 |
| `.til` | 타일 그래픽 뱅크 |
| `.bob` | 지상 오브젝트/구조물 배치 |
| `.dfx` | 65536B 보조 테이블 (데미지/충돌 추정) |
| `.lfx` | 65536B 라이팅/포그 LUT (다수 identity 0..255) |

### 4.2 `.MAP` 바이너리 레이아웃 (전 맵 검증)

```
offset 0  u16 version = 2
offset 2  u16 flags   = 0xF000
offset 4  u16 width
offset 6  u16 height
offset 8  u32 size_field = 52 + width*height*2
offset 12 char name_a[20]   // 타일셋 키 ("jungle","vil","z-desert" …)
offset 32 char name_b[20]   // bob 키 또는 동일 이름 / "z-desert.til" 형태도 존재
offset 52 u16 heightmap[width*height]   // 지형 높이
offset size_field  u32 attr[width*height]  // 타일/속성 팩
// 불변식: filesize == size_field + width*height*4
//         == 52 + w*h*2 + w*h*4
```

### 4.3 수록 맵

| 파일 | W×H | 높이 범위(u16) | 에셋 키 |
|------|-----|----------------|---------|
| JUNGLE.MAP | **400×170** | 0–4378 | jungle |
| jungle2.map | **300×300** | 0–3599 | jungle |
| vil.map | **600×320** | 0–2610 | vil |
| z-desert.map | **240×120** | 0–2797 | z-desert |
| z-desert2.map | **240×120** | 0–2797 | z-desert.til / .bob 문자열 |

### 4.3.1 attr u32 비트필드 (**합성 인덱스 확정**, 2026-08)

```
bits  0..7   flags     — 0x20 normal (다수), 0x60 edge/special (경계 100%),
                         0x28 rare, 0x00 void-ish, 0x40 극소
bits  8..15  reserved  — 전 맵 항상 0
bits 16..23  variant   — 하위 4비트 = 뱅크 내 타일 변형(0–15)
                         상위 4비트 = 보조(사막 등에서 연속값 관측, 추가 분석)
bits 24..31  material  — 지형 클래스 ID (TIL 16-tile 뱅크 인덱스)
```

**타일 인덱스 (구현·검증 완료):**

```
tileIndex = material * 16 + (variant & 0x0F)
```

| 맵 | TIL tiles | used unique | nonempty cell % |
|----|-----------|-------------|-----------------|
| JUNGLE | 4400 | 59 | **100%** |
| jungle2 | 4400 | 50 | **100%** |
| vil | 2800 | 19 | **100%** |
| z-desert | 2800 | 122 | **99.93%** |
| z-desert2 | 2800 | 149 | **99.94%** |

구현: `decodeAttr` / `attrTileIndex` / `renderMapComposedRgba` · 뷰어「타일 합성」· 인게임 타일 블릿.

### 4.4 렌더 함의 (동일 구현)
- 셀마다 높이 → 쿼터뷰에서 Y오프셋 / 엄폐 / 강제 고도  
- 공식 문구: 높이값이 게임 전반에 영향, 오르막 동선  
- 60fps 유지하며 타일+높이 블리팅

---


### 4.5 `.TIL` — 타일 뱅크 (**완전 해석**, Tm.run `0x409f40`)

```
u32 magic = 0xF0000001
u8  palette[256][3]     // 6-bit RGB (0–63), 표시 시 ×4
u16 tile_count
u8  tiles[tile_count][256]  // 각 16×16 팔레트 인덱스
// filesize == 774 + tile_count*256
```

| 파일 | tiles |
|------|-------|
| jungle.til | **4400** |
| VIL.TIL | **2800** |
| z-desert.til | **2800** |

구현: `src/lib/map/decode.ts` · 뷰어: MAP 뷰어 탭.

### 4.6 `.BOB` — 오브젝트 배치 (부분)

```
u32 magic = 0xF0000004
u32 count
// count × 0x1C 레코드
// trailing: 종종 embedded SPR 스트림
```

휴리스틱: 다수 레코드에서 `fields[6],fields[7]` 이 좌표(768,1280 등).  
완전 스키마(링크/타입 필드)는 미해독.

### 4.7 `.DFX` / `.LFX` (2026-08 deep pass)

| 파일 | 크기 | 구조 | 용도 추정 |
|------|------|------|-----------|
| `.dfx` | 65536 | **256바이트 LUT × 256 동일 행** | 팔레트/머티리얼 리맵 (라이팅 아님) |
| `.lfx` | 65536 | **light[256][color] → newIndex** | 8-bit 소프트웨어 라이팅/시간대 |

- DFX: 행이 전부 동일 → 실질 256-entry 테이블. identity 거의 없음.
- LFX: light=0 은 대체로 identity, light↑ 시 인덱스 대량 재매핑.

### 4.8 `.PPP` UI 이미지 (헤더)

```
u8  10,5,1,8     // 상수 시그니처
u32 flags        // 0
u16 max_x, max_y // 예: 639,479
u16 width,height // 예: 640,480 (일부 0)
// offset 16+: RLE/픽셀 페이로드 (SPR과 유사한 0x0B 패턴 관측)
```

### 4.9 사전 렌더
`public/archive/art/map_decoded/*_height.png` · `*_attr.png` · `*_tiles.png`

### 4.10 에셋 완전성
`Tm.run` 고정 경로 **102개** 전부 추출본에 존재.  
`wp18-20` 경로 문자열 자체가 바이너리에 **없음** (이름 테이블만 존재).

## 5. SPR 포맷 (**100% 확정** — 49/49 파일 검증)

구현: [`src/lib/spr/decode.ts`](../../src/lib/spr/decode.ts)  
로더: Tm.run `0x409b10`, 프레임 구조체 stride **0x34**  
사전 디코드 PNG: `public/archive/art/spr_decoded/*_{f0,sheet}.png`

### 5.1 파일 헤더 (LE)

```
offset 0   char magic[3]     = 'S','P','R'     // null 없음 — 3바이트만 비교
offset 3   u32 reserved      = 0               // 항상 0 (관측)
offset 7   u16 type          = 0 | 1 | 2
offset 9   u32 frame_count
// type <= 1 일 때만:
offset 13  u16 global[4]     // 전역 포인트 4개 (대부분 0)
// 이후 프레임 레코드 × frame_count
```

| type | 용도 | 프레임 포인트 수 | 대표 |
|------|------|------------------|------|
| 0 | 샷·FX·선택연출·아이템 | bank A/B 각 **1** | `WP1SHT`, `ef1`, `item`, `canit*` |
| 1 | 기체·일부 오브젝트 | bank A/B 각 **10** | `char1/2/3`, `cop` |
| 2 | 무기 바디 | bank A/B 각 **3** | `wp1`…`wp21` |

### 5.2 프레임 레코드 (파일 상)

```
u32 compressed_size   // 이어지는 RLE 페이로드 바이트 수
u16 width
u16 height
u16 points_a[N]       // N = 1 / 10 / 3  (type별)
u16 points_b[N]
u8  rle[compressed_size]
```

메모리 구조체(게임 내부, stride 0x34):
```
+0x00  flag byte
+0x02  width
+0x04  height
+0x06  points_a…
+0x1a  points_b…
+0x30  pixel buffer pointer (malloc(compressed_size) 후 fread)
```

`points_a[0]`/`points_b[0]` 은 type0에서 핫스팟(중심)으로 쓰이는 것이 유력.  
type1의 10쌍은 무기 장착/충돌 포인트 후보.

### 5.3 RLE 코덱 (행 단위)

각 행:
```
u16 row_byte_len          // 이어지는 바이트 수 (0x0D 포함)
u8  ops[row_byte_len]
```

| op | 인자 | 의미 |
|----|------|------|
| `0x0A` | `n` (u8) | 투명 픽셀 **n** 개 스킵 (인덱스 0) |
| `0x0B` | `n` + `n` bytes | 팔레트 인덱스 **n** 개 리터럴 |
| `0x0C` | `n` + `n*4` bytes | 팔레트 인덱스 **n×4** 개 리터럴 |
| `0x0D` | — | 행 종료 (EOL) |

- 픽셀은 **8-bit 팔레트 인덱스**
- **인덱스 0 = 투명**
- 빈 행: `01 00 0D` (len=1, 즉시 EOL)
- 파일 끝: 전 프레임 소모 후 **잔여 바이트 0** (49파일 전부)

### 5.4 팔레트 상태

| 상태 | 내용 |
|------|------|
| ✅ | 인덱스 형상 100% 정확 |
| ⚠️ | 원본 DirectDraw 8-bit 시스템 팔레트 미확보 |
| 임시 | `src/lib/spr/defaultPalette.json` (GIF/스크린샷 근사 + ramp) |
| 비고 | `.PPP` 는 UI 이미지 RLE이며 팔레트 테이블이 아님 |

원본 팔레트 후보 추가 탐색: `Tm.run` 데이터 섹션 768-byte RGB, 런타임 `SetPaletteEntries`, 스크린샷 클러스터링.

### 5.5 수록 SPR 요약

| 용도 | 파일 | type | frames |
|------|------|------|--------|
| 기체 | char1–3 | 1 | **120** |
| 선택 연출 | canit1–3 | 0 | 20 |
| 무기 바디 | wp* / WP16 | 2 | 120 (다수) |
| 탄환 | *SHT | 0 | 10–40 |
| 아이템 | item | 0 | 22 |
| 폭발/FX | ef1 | 0 | 84 |
| 파편 | piece | 0 | 63 |

### 5.6 API (TS)

```ts
import { decodeSpr, frameToRgba, loadSpr, getDefaultPalette } from "@/lib/spr";

const spr = await loadSpr("/archive/client/extracted/data/char1.spr");
const { data, width, height } = frameToRgba(spr.frames[0]);
// ImageData / canvas putImageData
```

뷰어 UI: 앱 탭 **「SPR 뷰어」** (`SprViewer`).

---

## 6. 조작 (공식 explain.htm)

| 기능 | 키 |
|------|-----|
| 발사 | **Ctrl** |
| 특수 아이템 | **Space** |
| 무기 1–10 | **1–0** |
| 아이템 1–10 | **Alt+1–0** |
| 상태/옵션/종료 창 | **S / O / Q** |
| 채팅 | **Enter** 후 입력 |
| 팀/지역/전체 채팅 | **F1 / F2 / F3** |

- “순수 키보드 조작” 명시  
- 조이스틱: DirectInput 5.0 지원 코드 존재  
- **이동·선회 키는 공식 문서 유실** — `GetAsyncKeyState` 스캔코드 테이블 추가 분석 필요

---

## 7. 네트워크 (전투 동기화 고증용)

- 전송: **sendto/recvfrom** 데이터그램  
- 접속 전 **5회 RTT 프로브**, 타임아웃 1000ms, **RTT≥1000ms 차단**  
- 이벤트 예: Join, zone enter/escape, crush(킬), weapon/hp 상태  
- 서버 소스 없음 → 리바이벌은 **로컬/신프로토콜**이 현실적, 원본 패킷 완전 호환은 패킷 덤프 확보 시

---

## 8. 동일 구현 체크리스트

### 이미 확보 (구현 착수 가능)
- [x] 기체 3종 이름·스프라이트·선택 순서  
- [x] 무기 21 이름 + 기체 사용 마스크  
- [x] 맵 5종 크기·높이맵 바이너리 레이아웃  
- [x] 무기/샷/효과 파일 매핑 (대다수)  
- [x] 해상도·60fps·높이맵 전투 철학  
- [x] 조작 대부분 (이동 제외)  
- [x] UI PPP / lang 문자열  
- [x] **SPR 픽셀 디코더 (RLE + 헤더, 49/49)**  
- [x] **SPR 뷰어 UI**  

### 추가 확보 필요 (완벽 고증)
- [ ] 원본 8-bit 팔레트  
- [x] MAP 파서 + 높이맵 뷰어
- [x] TIL 파서 (16×16×N, 6-bit pal)
- [x] BOB 헤더/오브젝트 테이블 (embedded SPR 후행)
- [x] MAP attr → 타일 합성 렌더 (`material×16+(variant&0xF)`)  
- [x] MAP attr 비트 레이아웃 (flags / variant / material) — 플래그 의미는 휴리스틱  
- [x] 기체 SPR 인게임 연결 (char1–3, 120 yaw, 임시 팔레트)  
- [ ] 원본 8-bit SPR 팔레트  
- [ ] 기체 스탯 테이블 (HP, 가속, 선회)  
- [ ] 무기 수치 테이블 (데미지, 탄속, 연사, 유도)  
- [ ] 무기·샷 SPR 인게임 + 장착 포인트  
- [ ] 이동/선회 키 매핑  
- [ ] wp18–20 누락 규명  
- [ ] 탄 물리 (직선/유도/지뢰/빔) 분류  
- [ ] 피격·리스폰·점수 규칙  
- [ ] (선택) 원본 프로토콜 옵코드

### 권장 다음 리버싱 순서
1. ~~**SPR 디코더**~~ ✅  
2. ~~**MAP+TIL 합성 → 지형 1:1**~~ ✅  
3. **원본 SPR 팔레트 복원** + 무기/샷 SPR 인게임  
4. **무기 수치 테이블** (.data 구조체 / 디스어셈블)  
5. **입력 테이블** (GetAsyncKeyState 즉시값)  
6. 탄 엔티티 업데이트 루프 재구성  

---

## 9. 월드/설정 키워드 (연출·UI 고증)

Vulture, Titans, Atlas, 통합 정부, 30반치 사건, Battle Field / Zone, Pilot ID, PANTECH NET

---

*이 스펙은 복원 구현의 SSOT로 유지한다. 새 사실이 나오면 catalog JSON과 함께 갱신.*
