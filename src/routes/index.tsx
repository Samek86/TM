import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArchiveBrowser } from "@/components/tm/ArchiveBrowser";
import { GameCanvas } from "@/components/tm/GameCanvas";
import { SprViewer } from "@/components/tm/SprViewer";
import { MapViewer } from "@/components/tm/MapViewer";
import { ARCHIVE_ITEM_COUNT } from "@/data/archive-catalog";
import { MAPS, formatMapSize } from "@/data/maps";
import { VULTURES } from "@/data/vultures";
import type { VultureId } from "@/data/weapons";
import { FULL_WEAPON_ROSTER } from "@/data/weapons";
import { SPR_CATALOG_COUNT } from "@/lib/spr";
import { MAP_CATALOG_COUNT } from "@/lib/map";
import { MidiPlayer } from "@/components/tm/MidiPlayer";
import { CraftCardArt, MapPreview } from "@/components/tm/LobbyPreviews";
import { BGM } from "@/lib/audio/sfx";
import {
  browserStorage,
  isPhonePlay,
  readDisplayMode,
  writeDisplayMode,
  type DisplayMode,
} from "@/game/displayMode";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Tab = "play" | "sprites" | "maps" | "archive" | "codex";

function HomePage() {
  const [tab, setTab] = useState<Tab>("play");
  const [playing, setPlaying] = useState(false);
  const [vultureId, setVultureId] = useState<VultureId>("born_armor");
  const [mapId, setMapId] = useState("jade_basin");
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() =>
    readDisplayMode(browserStorage()),
  );
  const [phonePlay, setPhonePlay] = useState(false);

  useEffect(() => {
    const update = () => {
      setPhonePlay(
        isPhonePlay({
          innerWidth: window.innerWidth,
          coarsePointer: window.matchMedia("(pointer: coarse)").matches,
        }),
      );
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const exitGame = useCallback(() => {
    setPlaying(false);
    setTab("play");
    void import("@/lib/audio/bgm").then(({ stopBgm }) => stopBgm());
  }, []);

  // Prefetch Tone + MIDI while user picks craft/map so BGM can start instantly on play
  useEffect(() => {
    void import("@/lib/audio/sfx").then(({ warmZoneBgm }) => {
      void warmZoneBgm(mapId);
    });
  }, [mapId]);

  const startGame = useCallback(() => {
    // Same click gesture: start BGM immediately (modules usually already warm)
    void import("@/lib/audio/sfx").then(({ startZoneBgm, resumeAudio }) => {
      void resumeAudio();
      void startZoneBgm(mapId);
    });
    setPlaying(true);
  }, [mapId]);

  const connectButton = (
    <button
      type="button"
      onClick={startGame}
      className="w-full min-w-0 whitespace-normal rounded-xl bg-tm-accent px-3 py-3.5 text-center text-sm font-bold text-tm-void shadow-[0_0_24px_rgba(240,180,41,0.25)] hover:brightness-110"
    >
      CONNECT · {phonePlay ? "전투 시작" : displayMode === "fullscreen" ? "전체화면 전투 시작" : "창 모드 전투 시작"}
    </button>
  );

  const displayPicker = (
    <div className="grid grid-cols-2 gap-2">
      {(
        [
          ["fullscreen", "전체화면"],
          ["window", "창 모드"],
        ] as const
      ).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => {
            setDisplayMode(mode);
            writeDisplayMode(mode, browserStorage());
          }}
          className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
            displayMode === mode
              ? "border-tm-cyan bg-tm-cyan/10 text-tm-fg"
              : "border-tm-border bg-tm-elevated/40 text-tm-muted hover:text-tm-fg"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="mx-auto flex h-dvh max-h-dvh w-full min-w-0 max-w-6xl flex-col overflow-hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pt-6 sm:pb-6">
      <header className="mb-3 min-w-0 shrink-0 overflow-hidden border-b border-tm-border pb-3 sm:mb-5 sm:flex sm:items-end sm:justify-between sm:gap-4 sm:pb-4">
        <div className="min-w-0">
          <p className="hidden text-xs font-semibold uppercase tracking-[0.2em] text-tm-cyan sm:block">
            Pantech Net · Lost Online Shooter
          </p>
          <h1 className="font-display break-words text-xl text-tm-fg sm:mt-1 sm:text-3xl">
            TACTICS MERCENARY
          </h1>
          <p className="mt-0.5 truncate text-[11px] text-tm-muted sm:mt-1 sm:text-sm">
            완전 부활 · 3D 아레나 · 21종 무기
          </p>
        </div>
        <nav className="mt-3 flex flex-wrap gap-2 sm:mt-0">
          {(
            [
              ["play", "플레이"],
              ["maps", "MAP 뷰어"],
              ["sprites", "SPR 뷰어"],
              ["archive", "자료실"],
              ["codex", "설계 문서"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                if (id !== "play") setPlaying(false);
              }}
              aria-pressed={tab === id}
              data-tab={id}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                tab === id
                  ? "bg-tm-accent text-tm-void"
                  : "bg-tm-elevated text-tm-muted hover:text-tm-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "sprites" && (
        <ViewerShell
          intro={
            <>
              원본 클라이언트 <strong className="text-tm-fg">.SPR</strong> 바이너리를
              브라우저에서 직접 디코딩합니다. {SPR_CATALOG_COUNT}개 파일 · RLE 코덱 완전
              해석 · 색은 임시 팔레트(형태 100% / 색 근사).
            </>
          }
        >
          <SprViewer />
        </ViewerShell>
      )}

      {tab === "maps" && (
        <ViewerShell
          intro={
            <>
              원본 <strong className="text-tm-fg">.MAP / .TIL / .BOB</strong> 디코드 · 높이맵 /
              타일 합성. 카탈로그 {MAP_CATALOG_COUNT}종 (원작 5 + 창작 3). attr→tile
              (mat×16+var&amp;15) · 원본 6-bit 팔레트.
            </>
          }
        >
          <MapViewer />
        </ViewerShell>
      )}

      {tab === "play" && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!playing ? (
            <>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y pb-3">
                <div className="grid min-w-0 max-w-full gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="min-w-0 max-w-full lg:hidden">
                    <h3 className="mb-2 font-display text-sm text-tm-accent-fg">
                      선택 맵 미리보기
                    </h3>
                    <MapPreview mapId={mapId} />
                  </div>
                  <section className="min-w-0 max-w-full rounded-2xl border border-tm-border bg-tm-panel/90 p-4 sm:p-5">
                    <h2 className="font-display text-lg text-tm-accent-fg">
                      Vulture 선택
                    </h2>
                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                      {VULTURES.map((v) => (
                        <CraftCardArt
                          key={v.id}
                          v={v}
                          selected={vultureId === v.id}
                          onSelect={() => setVultureId(v.id)}
                        />
                      ))}
                    </div>

                    <h2 className="font-display mt-6 text-lg text-tm-accent-fg">맵 선택</h2>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {MAPS.map((m, i) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMapId(m.id)}
                          className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                            mapId === m.id
                              ? "border-tm-cyan bg-tm-cyan/10 text-tm-fg"
                              : "border-tm-border bg-tm-elevated/40 text-tm-muted hover:text-tm-fg"
                          }`}
                        >
                          <span className="font-semibold">
                            {i + 1}. {m.name}
                          </span>
                          <span className="mt-0.5 block text-xs opacity-80">
                            {m.theme}
                          </span>
                          <span className="mt-1 block break-all font-mono text-[10px] text-tm-cyan/90">
                            크기 {formatMapSize(m)}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-tm-dim">
                            {m.features?.slice(0, 3).join(" · ")}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div className="mt-6 hidden lg:block">
                      {!phonePlay && (
                        <>
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-tm-dim">
                            화면
                          </p>
                          {displayPicker}
                        </>
                      )}
                      <div className={phonePlay ? "" : "mt-3"}>{connectButton}</div>
                      <p className="mt-2 text-center text-[11px] text-tm-dim">
                        오르막으로만 고지 등반 · 절벽 하강 가능 · Esc 일시정지 · Q 종료
                      </p>
                    </div>
                  </section>

                  <section className="flex min-w-0 max-w-full flex-col gap-4">
                    <div className="hidden lg:block">
                      <h3 className="mb-2 font-display text-sm text-tm-accent-fg">
                        선택 맵 미리보기
                      </h3>
                      <MapPreview mapId={mapId} />
                    </div>
                    <div className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 text-sm leading-relaxed text-tm-muted">
                      <h3 className="font-semibold text-tm-fg">조작 · 규칙</h3>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-xs sm:text-sm">
                        <li>
                          <strong className="text-tm-fg">WASD</strong> 이동 ·{" "}
                          <strong className="text-tm-accent-fg">오르막</strong>으로만 고지 등반 ·
                          절벽은 내려가기만 가능
                        </li>
                        <li>
                          <strong className="text-tm-fg">마우스</strong> 조준 · 좌클릭 발사 · 미사일{" "}
                          <strong className="text-tm-fg">직진</strong>
                        </li>
                        <li>
                          무기 <strong className="text-tm-cyan">총 4종</strong> · 기본 1(무제한) · 전용 2 · 공유 1
                        </li>
                        <li>
                          픽업 시 탄약만 누적 · <strong className="text-tm-fg">1</strong> 기본 ·{" "}
                          <strong className="text-tm-fg">2–4</strong> 필드
                          (×0 선택 불가 · 소진 시 1번)
                        </li>
                        <li>
                          무기마다 특색 다름 · 관통 / 순항스플래시 / 세침 / 살포 / 투척 / 핵폭발 / 냉기장판
                        </li>
                        <li>
                          봇 실력 <strong className="text-tm-fg">5단계 랜덤</strong>
                          (초보·견습·숙련·정예·에이스) · Esc 일시정지 · Q 종료
                        </li>
                      </ul>
                    </div>
                    <MidiPlayer
                      src={BGM.tactics1}
                      title="tactics1 — 로비 BGM"
                      loop
                    />
                  </section>
                </div>
              </div>
              <div className="min-w-0 shrink-0 border-t border-tm-border bg-tm-void/95 pt-2 lg:hidden">
                {connectButton}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-tm-border bg-tm-panel/60 p-6 text-center text-sm text-tm-muted">
              <p className="font-display text-tm-accent-fg">전투 중</p>
              <p className="mt-2 text-xs">
                게임이 실행 중입니다. 종료하려면 상단{" "}
                <strong className="text-tm-danger">게임 종료</strong> 또는{" "}
                <kbd className="rounded bg-tm-elevated px-1.5 py-0.5 font-mono text-tm-fg">
                  Q
                </kbd>{" "}
                키를 누르세요.
              </p>
              <button
                type="button"
                onClick={exitGame}
                className="mt-4 rounded-lg bg-tm-danger px-4 py-2 text-sm font-bold text-white"
              >
                강제 종료 (메뉴로)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen game portal — outside page max-width layout */}
      {playing && (
        <GameCanvas
          mapId={mapId}
          vultureId={vultureId}
          active={playing}
          onExit={exitGame}
          startFullscreen={phonePlay || displayMode === "fullscreen"}
        />
      )}

      {tab === "archive" && (
        <ViewerShell
          intro={
            <>
              웨이백 공식 사이트 · 클라이언트 추출물 · 오프닝 영상 등 확보 자료를 모두
              보관합니다. 카탈로그 {ARCHIVE_ITEM_COUNT}항목 · 디스크 전체{" "}
              <code className="text-tm-cyan">public/archive/</code>.
            </>
          }
        >
          <ArchiveBrowser />
        </ViewerShell>
      )}

      {tab === "codex" && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <CodexPanel />
        </div>
      )}
    </div>
  );
}

function ViewerShell({
  intro,
  children,
}: {
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-tm-border bg-tm-panel/50 p-3 sm:p-4">
      <p className="mb-2 hidden shrink-0 text-sm leading-relaxed text-tm-muted sm:mb-3 sm:block">
        {intro}
      </p>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function CodexPanel() {
  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-2">
      <DocCard title="프로젝트 목표">
        팬택네트 <strong>택틱스 머셔너리</strong>의 쿼터뷰 Vulture 루팅 슈터를 브라우저에서
        충실히 재현하고, 유실 직전의 원작 비주얼·클라이언트·문서를 한곳에 영구 보존합니다.
      </DocCard>
      <DocCard title="SPR 디코더 (완료)">
        Tm.run <code className="text-tm-cyan">0x409b10</code> 로더 역분석으로 헤더·타입별
        포인트·행 RLE(0x0A/0x0B/0x0C/0x0D) 완전 확정. 클라이언트 49개 .SPR 무잔여 바이트
        파싱. 팔레트는 임시(형태 정확). 뷰어 탭에서 실시간 확인.
      </DocCard>
      <DocCard title="원작 크레딧">
        Client Song KilSup · Server Hong Myung Goo · Sound Rim JaeWook · Graphic Son mee
        young / Hong ByungKee · Design Oh SeoungEan · PANTECH NET · v1.2
      </DocCard>
      <DocCard title="기체 3종">
        <ol className="list-decimal space-y-1 pl-4">
          {VULTURES.map((v) => (
            <li key={v.id}>
              <strong>{v.name}</strong> — {v.blurb}
            </li>
          ))}
        </ol>
      </DocCard>
      <DocCard title="맵 (원작 파일)">
        <ul className="list-disc space-y-1 pl-4">
          {MAPS.map((m) => (
            <li key={m.id}>
              <strong>{m.name}</strong> — {formatMapSize(m)} ·{" "}
              {m.originalFiles.join(", ")}
            </li>
          ))}
        </ul>
      </DocCard>
      <DocCard title="무기 로스터 (Tm.run)">
        <p className="mb-2 text-xs text-tm-dim">클라이언트 문자열 21종</p>
        <p className="font-mono text-[11px] leading-relaxed text-tm-muted">
          {FULL_WEAPON_ROSTER.join(" · ")}
        </p>
      </DocCard>
      <DocCard title="문서 파일 (repo)">
        <ul className="list-disc space-y-1 pl-4 text-tm-cyan">
          {[
            "docs/GAME_DESIGN.md",
            "docs/CONTROLS.md",
            "docs/WEAPONS.md",
            "docs/VULTURES.md",
            "docs/MAPS.md",
            "docs/SOURCES.md",
            "docs/ROADMAP.md",
            "docs/ARCHIVE_INDEX.md",
            "docs/reversing/ORIGINAL_FIDELITY_SPEC.md",
            "public/archive/MANIFEST.txt",
          ].map((f) => (
            <li key={f}>
              <code className="text-xs">{f}</code>
            </li>
          ))}
        </ul>
      </DocCard>
      <DocCard title="로드맵 요약">
        Phase 0 보존 ✅ · Phase 1 플레이 코어 ✅ ·{" "}
        <strong className="text-tm-accent-fg">Phase 2 SPR 디코더 ✅</strong> · 다음 MAP+TIL
        · 무기 수치 · 팔레트 원본 복원
      </DocCard>
    </div>
  );
}

function DocCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 text-sm leading-relaxed text-tm-muted">
      <h3 className="font-display mb-2 text-base text-tm-accent-fg">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
