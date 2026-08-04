import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ArchiveBrowser } from "@/components/tm/ArchiveBrowser";
import { GameCanvas } from "@/components/tm/GameCanvas";
import { SprViewer } from "@/components/tm/SprViewer";
import { MapViewer } from "@/components/tm/MapViewer";
import { ARCHIVE_ITEM_COUNT } from "@/data/archive-catalog";
import { MAPS } from "@/data/maps";
import { VULTURES } from "@/data/vultures";
import type { VultureId } from "@/data/weapons";
import { FULL_WEAPON_ROSTER } from "@/data/weapons";
import { SPR_CATALOG_COUNT } from "@/lib/spr";
import { MAP_CATALOG_COUNT } from "@/lib/map";
import { MidiPlayer } from "@/components/tm/MidiPlayer";
import { CraftCardArt, MapPreview } from "@/components/tm/LobbyPreviews";
import { BGM } from "@/lib/audio/sfx";

export const Route = createFileRoute("/")({
  component: HomePage,
});

type Tab = "play" | "sprites" | "maps" | "archive" | "codex";

function HomePage() {
  const [tab, setTab] = useState<Tab>("maps");
  const [playing, setPlaying] = useState(false);
  const [vultureId, setVultureId] = useState<VultureId>("born_armor");
  const [mapId, setMapId] = useState("jade_basin");

  const exitGame = useCallback(() => {
    setPlaying(false);
    setTab("play");
    void import("@/lib/audio/midiPlayer").then(({ stopMidi }) => stopMidi());
  }, []);

  const startGame = useCallback(() => {
    // Start BGM in the same user-gesture turn (autoplay policy)
    void import("@/lib/audio/sfx").then(({ startZoneBgm }) => {
      void startZoneBgm(mapId);
    });
    setPlaying(true);
  }, [mapId]);

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col px-3 py-4 sm:px-5 sm:py-6">
      <header className="mb-5 flex flex-col gap-4 border-b border-tm-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-tm-cyan">
            Pantech Net · Lost Online Shooter
          </p>
          <h1 className="font-display mt-1 text-2xl text-tm-fg sm:text-3xl">
            TACTICS MERCENARY
          </h1>
          <p className="mt-1 text-sm text-tm-muted">
            완전 부활 · 원본 MAP/TIL 지형 · 미사일·이펙트 SPR · tactics MIDI BGM · 21종 무기
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {(
            [
              ["maps", "MAP 뷰어"],
              ["sprites", "SPR 뷰어"],
              ["play", "플레이"],
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
        <div className="flex min-h-[min(72vh,760px)] flex-1 flex-col rounded-2xl border border-tm-border bg-tm-panel/50 p-3 sm:p-4">
          <p className="mb-3 text-sm text-tm-muted">
            원본 클라이언트 <strong className="text-tm-fg">.SPR</strong> 바이너리를
            브라우저에서 직접 디코딩합니다. {SPR_CATALOG_COUNT}개 파일 · RLE 코덱 완전
            해석 · 색은 임시 팔레트(형태 100% / 색 근사).
          </p>
          <div className="min-h-0 flex-1">
            <SprViewer />
          </div>
        </div>
      )}

      {tab === "maps" && (
        <div className="flex min-h-[min(72vh,760px)] flex-1 flex-col rounded-2xl border border-tm-border bg-tm-panel/50 p-3 sm:p-4">
          <p className="mb-3 text-sm text-tm-muted">
            원본 <strong className="text-tm-fg">.MAP / .TIL / .BOB</strong> 1:1 합성.
            맵 {MAP_CATALOG_COUNT}종 · attr→tile (mat×16+var&amp;15) · 원본 6-bit 팔레트 ·
            플레이 시 풀 해상도 지형 + 기체 SPR.
          </p>
          <div className="min-h-0 flex-1">
            <MapViewer />
          </div>
        </div>
      )}

      {tab === "play" && (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          {!playing ? (
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-2xl border border-tm-border bg-tm-panel/90 p-5">
                <h2 className="font-display text-lg text-tm-accent-fg">Vulture 선택</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {MAPS.map((m) => (
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
                      <span className="font-semibold">{m.name}</span>
                      <span className="mt-0.5 block text-xs opacity-80">{m.theme}</span>
                      <span className="mt-1 block text-[10px] text-tm-dim">
                        {m.features?.slice(0, 3).join(" · ")}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={startGame}
                  className="mt-6 w-full rounded-xl bg-tm-accent py-3.5 font-display text-sm font-bold tracking-wider text-tm-void shadow-[0_0_24px_rgba(240,180,41,0.25)] hover:brightness-110"
                >
                  CONNECT · 전체화면 전투 시작
                </button>
                <p className="mt-2 text-center text-[11px] text-tm-dim">
                  오르막으로만 고지 등반 · 절벽 하강 가능 · Esc 일시정지 · Q 종료
                </p>
              </section>

              <section className="flex flex-col gap-4">
                <div>
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
                      기본 무기 <strong className="text-tm-cyan">무제한</strong> · 필드 무기는{" "}
                      <strong className="text-tm-cyan">탄약 제한</strong>
                    </li>
                    <li>
                      Born 2연 레이저 · Killers 강 구름 미사일 · Sorcerer 약·빠름
                    </li>
                    <li>
                      <strong className="text-tm-fg">1–0</strong> 무기 · Esc 일시정지 · Q/F10 종료
                    </li>
                  </ul>
                </div>
                <MidiPlayer
                  src={BGM.tactics1}
                  title="tactics1.mid — 로비 BGM"
                  loop
                />
              </section>
            </div>
          ) : (
            <div className="rounded-2xl border border-tm-border bg-tm-panel/60 p-6 text-center text-sm text-tm-muted">
              <p className="font-display text-tm-accent-fg">전투 중 · 전체화면</p>
              <p className="mt-2 text-xs">
                게임이 전체 화면으로 실행 중입니다. 종료하려면 상단{" "}
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
        />
      )}

      {tab === "archive" && (
        <div className="min-h-[min(70vh,720px)] flex-1 rounded-2xl border border-tm-border bg-tm-panel/50 p-3 sm:p-4">
          <p className="mb-3 text-sm text-tm-muted">
            웨이백 공식 사이트 · 클라이언트 추출물 · 오프닝 영상 등 확보 자료를 모두
            보관합니다. 카탈로그 {ARCHIVE_ITEM_COUNT}항목 · 디스크 전체{" "}
            <code className="text-tm-cyan">public/archive/</code>.
          </p>
          <div className="h-[min(65vh,680px)]">
            <ArchiveBrowser />
          </div>
        </div>
      )}

      {tab === "codex" && <CodexPanel />}
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
              <strong>{m.name}</strong> — {m.originalFiles.join(", ")}
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

function DocCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-tm-border bg-tm-panel/90 p-4 text-sm leading-relaxed text-tm-muted">
      <h3 className="font-display mb-2 text-base text-tm-accent-fg">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
