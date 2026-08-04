# Tactics Mercenary Revival — Compact Handoff

**Date:** 2026-08-04  
**Phase transition:** 원작 복원 한계 인정 → **창작 영역**으로 전환 준비  
**Binary:** `Tm.run` PE32 MSVC6 (1999, Pantech Net)

---

## 1. 한 줄 요약

원본 클라이언트 에셋·포맷은 정적 리버싱으로 **닫을 수 있는 부분까지 닫음**.  
게임플레이 수치·큰 스크린샷·런타임 테이블은 **디스크에 없음**.  
이후는 증언+보유 자료를 베이스로 한 **창작적 재구성** 단계.

---

## 2. 리버싱 상태

| 레이어 | 상태 |
|--------|------|
| SPR / MAP / TIL / BOB / DFX / LFX / PPP | **포맷·로더 완료** |
| 무기 이름 21종 + B/K/S 마스크 | **완료** (`0x439C20`) |
| 엔티티 0x2C×1000, 플레이어 슬롯 0x74 | **구조 크기 완료** |
| DirectInput 파이프라인 | **구조 완료** (DIK 테이블은 이미지에 없음) |
| 무기 데미지/연사/탄속 수치 | **BSS/서버 — 정적 불가** |
| 고해상 공식 스크린샷 `bigscreen*.gif` | **웨이백 미수집, 서버 폐쇄** |

검증: `node scripts/verify-re-formats.mjs` (포맷 레이어 green 목표)

문서: `docs/reversing/RE_COMPLETE.md`, `ENTITY_AND_RUNTIME.md`, `PPP_FORMAT.md`, `WEAPON_TABLE.json`

---

## 3. 보유 원본 자료

```
public/archive/
  extracted/          Tm.run, data/* (MAP/TIL/SPR/BOB/LFX/PPP), sound/*
  screenshots/gameplay/   공식 썸네일급 screen01–06 (~110px / ~440px)
  screenshots/website/    공식 웹 GIF
  video/                  logo.mpg → opening + stills
  website-html/           웨이백 HTML + cdx_all.txt
  art/                    spr_decoded, map_decoded, weapons, characters
```

**없는 것:** `bigscreen0N.gif` (공식 확대 샷 — 아카이브 404)

---

## 4. 현재 게임 구현 (부활 빌드)

| 영역 | 내용 |
|------|------|
| 스택 | React 19 + TanStack Start + Vite + Tailwind, dev `:8080` |
| 지형 | MAP+TIL 합성, 2단 고도(저지/고지), 오르막만 등반·절벽 하강 가능 |
| 기체 | Born / Killers / Sorcerer — SPR char1–3, 역할별 속도·기본무기 |
| 기본 무기 | Born 2연 레이저(∞) · Killers 구름형 강(∞) · Sorcerer 약·빠름(∞) |
| 필드 무기 | 루팅 + **탄약 제한** |
| 탄 | 직진 (유도/스핀 제거) |
| 입력 | WASD 이동, 마우스 조준/LMB 발사, 전체화면, Q 종료 |
| 오디오 | tactics*.mid (Tone) + interback.wav 폴백, shootN.wav |
| 로비 | 기체 SPR 카드, 맵 미리보기 (영상 제거) |

주요 경로:

- `src/game/{engine,render,assets,camera,terrainStyle}.ts`
- `src/data/{maps,weapons,vultures}.ts`
- `src/lib/{map,spr,ppp,audio}/`
- `src/components/tm/{GameCanvas,LobbyPreviews}.tsx`

---

## 5. 플레이어 증언 (창작 시 SSOT)

1. 높이 **2단계** — 언덕 위 = 고지, 아래 = 저지  
2. **오르막길로만** 등반 / **절벽 하강은 가능** / 그 외 장애물 없음  
3. 맵은 2D지만 **3D 느낌**, **깔끔·만화풍**  
4. 미사일 **일직선**  
5. Born 표준·레이저 2줄 / Killers 살짝 느림·강 구름 미사일 / Sorcerer 빠름·약 기본  
6. 기본 미사일 **무제한**, 필드 미사일 **탄수 제한**

---

## 6. 알려진 한계 (복원으로 못 닫는 것)

- 원작 전투 수치 표 (데미지/ROF/탄속)  
- 원작 DIK 키맵 그대로  
- 원작 LFX light 입력의 정확한 수식  
- 고해상 공식 인게임 캡처  
- 원작 서버 프로토콜 / 멀티  

→ 이후 수치는 **플레이 테스트로 튜닝** = 창작.

---

## 7. 창작 단계 제안 백로그

1. **비주얼 방향 고정** — 만화풍 팔레트·절벽 실루엣·오르막 표현 재디자인  
2. **밸런스 패스** — 킬 타임, 픽업 밀도, 봇 AI  
3. **맵 콘텐츠** — 원본 실루엣 유지 + 읽기 쉬운 2단 지형 아트  
4. **무기 판타지** — 21종 이름 유지, 탄수·연출 창작  
5. **메타/UI** — 랭킹·멀티는 나중; 싱글 아레나 완성도 우선  
6. **성능** — 대형 맵 베이크/카메라 추가 최적화  

---

## 8. 실행

```bash
export PATH="$PWD/.local/node/bin:$PATH"
npm run dev          # http://localhost:8080
node scripts/verify-re-formats.mjs
```

---

## 9. 판단

| 복원 | 창작으로 넘길 것 |
|------|------------------|
| 포맷·에셋 로딩·기본 룰 골격 | 룩앤필·밸런스 폴리시·연출 |
| 공식 썸네일·웨이백 자료 보존 | “완벽한 1:1 화면” 목표 폐기 |

**이 핸드오프 이후 작업은 “복원 완성”이 아니라 “TM 정신의 새 작품”으로 취급.**
