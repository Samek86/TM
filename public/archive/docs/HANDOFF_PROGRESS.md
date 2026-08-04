# 택틱스 머셔너리 부활 — 진행 상황 핸드오프

**작성일:** 2026-08-01  
**목적:** 맥북 + Grok Build에서 이어서 작업하기 위한 상태 스냅샷  
**프로젝트명:** Tactics Mercenary Revival (Pantech Net, 1999 online shooter)

---

## 0. 이미 받으신 파일 (이전 배치)

아래 6개 압축 + 텍스트 1개는 **원본 자료 보존** 단계 산출물입니다.

| # | 파일 | 내용 |
|---|------|------|
| 1 | `tm_full_01_media_docs.tar.gz` | 스크린샷, 아트, 영상, 오디오, 문서, 웹 HTML |
| 2 | `tm_full_02_client_installers.tar.gz` | tm12.zip, tm10.exe, InstallShield CAB |
| 3 | `tm_full_03_client_extracted.tar.gz` | Tm.run, maps, spr, sound, logo.mpg 등 추출물 |
| 4–5 | `tm_revival_full_archive.tar.gz.part00` + `.part01` | 전체 아카이브 분할 (합치면 full) |
| 6 | (미디어 단독 팩이 있다면) `tm_revival_media_docs.tar.gz` | 01과 유사 미디어 묶음 |
| TXT | `REASSEMBLY.txt` | 합치기/해제 안내 |

**합치기 (part 사용 시, Mac Terminal):**
```bash
cat tm_revival_full_archive.tar.gz.part00 \
    tm_revival_full_archive.tar.gz.part01 \
    > tm_revival_full_archive.tar.gz
tar -xzf tm_revival_full_archive.tar.gz
```

**논리 팩만 쓸 때:** 01 + 02 + 03 을 각각 풀어서 `public/archive/` 아래로 맞추면 됩니다.

Google Drive (폴더만 생성됨, 업로드 미완):  
https://drive.google.com/drive/folders/1fMEg63u9Dh1jCQFmd4QAowRsAPt9hzAS

---

## 1. 이번 배치 (이어서 받은 것) — 디코더·앱 코드

| # | 파일 | 내용 |
|---|------|------|
| 4 | `tm_cont_04_app_source_decoders.tar.gz` | **앱 소스 전체** (`src/`), 설정, 문서, 검증 스크립트, 이 핸드오프 |
| 5 | `tm_cont_05_decoded_assets.tar.gz` | SPR/MAP 사전 디코드 PNG (`spr_decoded`, `map_decoded`) |
| MD | `HANDOFF_PROGRESS.md` (본 파일, 04 팩 안 + docs/) | 진행 상황 SSOT |

04 팩을 프로젝트 루트에 풀면 Grok Build용 **코드 워크스페이스**가 복원됩니다.  
원본 `.spr`/`.map` 바이너리는 **03 팩** (`public/archive/client/extracted/`) 이 필요합니다.

---

## 2. 맥북 + Grok Build 이어하기

### 2.1 권장 폴더 구조

```text
tactics-mercenary-revival/          ← Grok Build 프로젝트 루트
  package.json
  vite.config.ts
  startup.sh
  src/                              ← cont_04
  docs/                             ← cont_04
  scripts/                          ← cont_04
  public/
    archive/
      client/extracted/             ← full_03 (또는 full archive)
      art/
        spr_decoded/                ← cont_05
        map_decoded/                ← cont_05
        characters/ weapons/ ...    ← full_01
      screenshots/ video/ ...       ← full_01
  node_modules/                     ← npm install (Grok 환경이면 사전 설치될 수 있음)
```

### 2.2 복원 순서

```bash
# 1) 빈 프로젝트 또는 Grok Build 워크스페이스에서
mkdir -p tactics-mercenary-revival && cd tactics-mercenary-revival

# 2) 앱 코드 (필수)
tar -xzf /path/to/tm_cont_04_app_source_decoders.tar.gz

# 3) 디코드 PNG (권장)
tar -xzf /path/to/tm_cont_05_decoded_assets.tar.gz

# 4) 원본 클라이언트 추출물 (SPR/MAP 뷰어·플레이 높이맵에 필수)
mkdir -p public/archive
tar -xzf /path/to/tm_full_03_client_extracted.tar.gz -C public/archive
# 팩 내부 경로가 archive/client/... 이면 구조에 맞게 조정

# 5) 미디어 (자료실 탭)
tar -xzf /path/to/tm_full_01_media_docs.tar.gz
# 경로 확인 후 public/archive 아래로 이동

# 6) 의존성 + 실행 (로컬 Node가 있을 때)
npm install
npm run dev          # 0.0.0.0:8080
# 검증
node scripts/verify-spr.mjs
node scripts/verify-map.mjs
npm run typecheck
```

Grok Build 샌드박스에서는 보통 `node_modules`가 미리 있고 `startup.sh` / `npm run dev` 로 미리보기가 붙습니다.  
**채팅에 “이어서 SPR·MAP 다음 단계 진행”** 이라고 하면 됩니다.

### 2.3 이전 자료만 있고 코드 팩을 넣는 경우

이미 full archive를 풀어 `public/archive` 만 있는 상태라면:

```bash
# 프로젝트 루트에서 cont_04 내용 덮어쓰기
tar -xzf tm_cont_04_app_source_decoders.tar.gz
tar -xzf tm_cont_05_decoded_assets.tar.gz
```

---

## 3. 완료된 작업 (체크리스트)

### Phase 0 — 보존 ✅
- [x] Wayback 공식 사이트 스크린샷·무기·기체 GIF
- [x] 오프닝 `logo.mpg` → MP4 변환
- [x] 클라이언트 설치 패키지 + unshield 추출
- [x] `public/archive/` 통합 자료실 (~280 파일)
- [x] 설계 문서: GAME_DESIGN, CONTROLS, WEAPONS, VULTURES, MAPS, SOURCES, ROADMAP
- [x] PE 리버싱 덤프: imports, strings, pe_analysis, original_data_catalog

### Phase 1 — 플레이 가능 코어 ✅
- [x] 브라우저 아레나 프로토타입 (3 Vulture, 봇, 무기 루팅, 높이)
- [x] 자료실 / 코덱스 UI
- [x] 오프닝 영상 로비 재생
- [x] 모바일 가상 패드

### Phase 2a — SPR 디코더 ✅ (이번 배치 핵심)
- [x] 포맷 100% 해석 (Tm.run `0x409b10`, 프레임 stride `0x34`)
- [x] RLE: `0x0A` skip · `0x0B` n · `0x0C` n×4 · `0x0D` EOL
- [x] type 0/1/2 포인트 뱅크
- [x] **49/49** `.spr` 잔여 바이트 0
- [x] TS 모듈: `src/lib/spr/decode.ts`
- [x] 인앱 **SPR 뷰어** 탭
- [x] 사전 PNG: `public/archive/art/spr_decoded/`
- [ ] **원본 DirectDraw 8-bit 팔레트** (임시 팔레트 — 형태 100%, 색 근사)

### Phase 2b — MAP / TIL / BOB ✅ (이번 배치 핵심)
- [x] MAP magic `0xF0000002` — 높이 u16 + attr u32, 5맵 파일크기 검증
- [x] TIL magic `0xF0000001` — 6-bit 팔레트 + 16×16×N (jungle 4400 / vil·desert 2800)
- [x] BOB magic `0xF0000004` — count×0x1C + trailing (embedded SPR 존재)
- [x] TS 모듈: `src/lib/map/decode.ts`
- [x] 인앱 **MAP 뷰어** 탭 (높이/속성/플래그/타일시트, 셀 클릭)
- [x] 플레이 시 **원본 높이맵 다운샘플** 적용 (`mapDefFromOriginal`)
- [x] 사전 PNG: `public/archive/art/map_decoded/`
- [ ] attr 비트 → 타일 인덱스 확정 후 **지형 타일 합성 렌더**

### 리버싱으로 확정된 게임 데이터
- [x] 기체 3종: Born Armor / Killers Pot / Sorcerer (`char1–3.spr`, 120프레임=3° yaw)
- [x] 무기 21 이름 + 기체 마스크 (Tm.run `0x39C20`, 23바이트 레코드) — wp18–20 바디 파일 없음
- [x] 맵 5종 크기·높이 범위
- [x] 조작 대부분 (이동 키는 공식 문서 유실 — 추가 분석 필요)
- [x] 네트워크: UDP sendto/recvfrom, RTT≥1000ms 차단

---

## 4. 코드 맵 (중요 경로)

```text
src/lib/spr/
  decode.ts          SPR 파서 + RLE + RGBA
  catalog.ts         49개 카탈로그
  defaultPalette.json  임시 팔레트
src/lib/map/
  decode.ts          MAP / TIL / BOB + 렌더 헬퍼
  catalog.ts         맵 5종
src/components/tm/
  SprViewer.tsx
  MapViewer.tsx
  GameCanvas.tsx     ← 원본 높이맵 로드
  ArchiveBrowser.tsx
src/data/maps.ts     mapDefFromOriginal()
src/game/            아레나 엔진 (아직 절차 스프라이트)
scripts/
  verify-spr.mjs     49/49
  verify-map.mjs     MAP5+TIL3+BOB3
docs/
  HANDOFF_PROGRESS.md  ← 본 문서
  reversing/ORIGINAL_FIDELITY_SPEC.md  ← 포맷 SSOT
  ROADMAP.md
```

---

## 5. 다음에 할 일 (우선순위)

Grok Build 채팅 예시 한 줄:

> `HANDOFF_PROGRESS.md` 기준으로 Phase 2 다음: attr→타일 합성 또는 SPR 팔레트 복원 + char 스프라이트 인게임 연결`

| 순위 | 작업 | 비고 |
|------|------|------|
| 1 | **MAP attr → 타일 합성** | 고바이트/플래그 의미 리버싱, 쿼터뷰 지형 1:1 |
| 2 | **SPR 팔레트 복원** | DD 팔레트 소스 탐색 (PPP/실행 시 셋, 스크린샷 추정) |
| 3 | **기체·무기 SPR 인게임 연결** | 120프레임 yaw, 샷 이펙트 |
| 4 | **무기 수치 테이블** | 데미지·탄속·연사 — Tm.run .data |
| 5 | **이동/선회 키** | GetAsyncKeyState 테이블 |
| 6 | SFX WAV 연결, 폴리시, (후) 멀티 |

---

## 6. 검증 명령 (정상 시 기대 결과)

```bash
node scripts/verify-spr.mjs
# OK 49/49 FAIL 0

node scripts/verify-map.mjs
# MAP×5 TIL×3 BOB×3 → OK 11 FAIL 0

npm run typecheck
npm run build
```

UI: **MAP 뷰어** · **SPR 뷰어** · **플레이**(원본 높이) · **자료실** · **설계 문서**

---

## 7. 기술 스택 / 제약

- React 19 + TanStack Start + Vite + Tailwind v4
- 미리보기 포트 계약: `0.0.0.0:8080` (`startup.sh`)
- 배포 타깃: Vercel (`npm run build` 필수 통과)
- 원작 IP: Pantech Net — 보존·연구·팬 리바이벌 목적
- 싱글플레이/로컬 봇 우선 (원본 서버 없음)

---

## 8. 포맷 한 줄 요약

**SPR:** `SPR` + type0/1/2 + frames → (size,w,h,points) + row-RLE  
**MAP:** `0xF0000002` + names + heightmap u16 + attr u32  
**TIL:** `0xF0000001` + pal768 + count + 16×16 tiles  
**BOB:** `0xF0000004` + N×0x1C + trailing SPR?

상세: `docs/reversing/ORIGINAL_FIDELITY_SPEC.md`

---

*이 문서와 `tm_cont_04` / `tm_cont_05` 만으로 코드·디코더 작업은 이어갈 수 있습니다.  
원본 바이너리 뷰어/높이맵 실데이터는 `tm_full_03` (또는 full archive)가 필요합니다.*
