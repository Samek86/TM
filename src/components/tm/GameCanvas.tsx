import { useCallback, useEffect, useRef, useState } from "react";
import {
  bindSfxModule,
  createGame,
  setKey,
  setPointerWorld,
  setSfxMuted,
  startMatch,
  update,
  warmupCombat,
  type GameState,
} from "@/game/engine";
import { renderGame } from "@/game/render";
import {
  loadGameAssets,
  warmGpuTextures,
  type GameAssets,
} from "@/game/assets";
import { screenToWorld } from "@/game/camera";
import type { VultureId } from "@/data/weapons";

interface Props {
  mapId: string;
  vultureId: VultureId;
  active: boolean;
  onExit?: () => void;
}

const TOUCH_DIRS = [
  { code: "KeyW", label: "▲", className: "col-start-2 row-start-1" },
  { code: "KeyA", label: "◀", className: "col-start-1 row-start-2" },
  { code: "KeyS", label: "▼", className: "col-start-2 row-start-2" },
  { code: "KeyD", label: "▶", className: "col-start-3 row-start-2" },
] as const;

async function enterBrowserFullscreen(el: HTMLElement): Promise<void> {
  try {
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    }
  } catch {
    /* CSS fullscreen still covers viewport */
  }
}

async function leaveBrowserFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(new Error(`${label} 시간 초과 (${ms}ms)`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function GameCanvas({ mapId, vultureId, active, onExit }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [showTouch, setShowTouch] = useState(false);
  const [pausedUi, setPausedUi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("준비 중…");
  const [loadPct, setLoadPct] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 768px)");
    const apply = () => setShowTouch(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    onFs();
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const holdKey = useCallback((code: string, down: boolean) => {
    const state = stateRef.current;
    if (!state) return;
    setKey(state, code, down);
  }, []);

  const exitToMenu = useCallback(() => {
    void leaveBrowserFullscreen();
    void import("@/lib/audio/midiPlayer").then(({ stopMidi }) => stopMidi());
    onExitRef.current?.();
  }, []);

  const resumeGame = useCallback(() => {
    const state = stateRef.current;
    if (state && state.phase === "paused") {
      state.phase = "playing";
    }
    setPausedUi(false);
  }, []);

  const togglePause = useCallback(() => {
    const state = stateRef.current;
    if (!state) return;
    if (state.phase === "playing") {
      state.phase = "paused";
      setPausedUi(true);
    } else if (state.phase === "paused") {
      state.phase = "playing";
      setPausedUi(false);
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) {
      void leaveBrowserFullscreen();
    } else {
      void enterBrowserFullscreen(shell);
    }
  }, []);

  // Main game loop + staged asset load (deps: only active/map/vulture)
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    // alpha:false = opaque buffer (faster composite); desync = lower input latency
    const ctx =
      canvas.getContext("2d", { alpha: false, desynchronized: true }) ??
      canvas.getContext("2d", { alpha: false }) ??
      canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let running = true;
    let cancelled = false;
    /** Block gameplay input until settle finishes (keys still allow Q exit). */
    let acceptInput = false;
    /** After reveal, skip canvas buffer realloc for a bit (header mount thrash). */
    let freezeCanvasAllocUntil = 0;
    setLoading(true);
    setLoadMsg("전투 준비 중…");
    setLoadPct(0);
    setLoadError(null);
    setPausedUi(false);
    setSfxMuted(true);

    // Cache layout metrics — never read clientWidth/getBoundingClientRect in the hot path
    let cssW = shell.clientWidth || window.innerWidth;
    let cssH = shell.clientHeight || window.innerHeight;
    // Cap DPR slightly — full 2× on large retina is a common first-seconds hitch
    let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    let rectLeft = 0;
    let rectTop = 0;
    let rectW = cssW;
    let rectH = cssH;
    // Cached audio module — avoid dynamic import on every key/mouse event
    let sfxResume: (() => Promise<void>) | null = null;
    let sfxModule: typeof import("@/lib/audio/sfx") | null = null;
    void import("@/lib/audio/sfx").then((mod) => {
      sfxModule = mod;
      bindSfxModule(mod);
      sfxResume = () => mod.resumeAudio();
      void mod.resumeAudio().catch(() => {});
    });
    const ensureAudio = () => {
      if (sfxResume) void sfxResume().catch(() => {});
    };

    const resize = (forceAlloc = false) => {
      const nextW = shell.clientWidth || window.innerWidth;
      const nextH = shell.clientHeight || window.innerHeight;
      const nextDpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const frozen =
        !forceAlloc && performance.now() < freezeCanvasAllocUntil;
      // Only reallocate backing store when size actually changes (and not frozen)
      if (
        !frozen &&
        (nextW !== cssW ||
          nextH !== cssH ||
          nextDpr !== dpr ||
          canvas.width !== Math.floor(nextW * nextDpr) ||
          canvas.height !== Math.floor(nextH * nextDpr))
      ) {
        cssW = nextW;
        cssH = nextH;
        dpr = nextDpr;
        canvas.width = Math.floor(cssW * dpr);
        canvas.height = Math.floor(cssH * dpr);
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
      } else if (frozen) {
        // Keep mouse mapping in sync even if buffer size is frozen
        cssW = nextW || cssW;
        cssH = nextH || cssH;
      }
      const r = canvas.getBoundingClientRect();
      rectLeft = r.left;
      rectTop = r.top;
      rectW = r.width || cssW;
      rectH = r.height || cssH;
    };
    const onWindowResize = () => resize(false);
    resize(true);
    window.addEventListener("resize", onWindowResize);
    // Catch fullscreen / flex layout changes that don't fire window.resize
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resize(false))
        : null;
    ro?.observe(shell);

    const onKeyDown = (e: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state) return;

      if (e.code === "KeyQ" || e.code === "F10") {
        e.preventDefault();
        exitToMenu();
        return;
      }
      if (!acceptInput) {
        // Still allow leave during settle; ignore gameplay keys
        return;
      }
      if (e.code === "F11") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (e.code === "Escape") {
        e.preventDefault();
        if (state.phase === "over") {
          exitToMenu();
          return;
        }
        if (state.phase === "playing") {
          state.phase = "paused";
          setPausedUi(true);
        } else if (state.phase === "paused") {
          state.phase = "playing";
          setPausedUi(false);
        }
        return;
      }

      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
        e.preventDefault();
      }
      ensureAudio();

      if (state.phase === "paused") {
        if (e.code === "Enter" || e.code === "KeyP") resumeGame();
        return;
      }

      setKey(state, e.code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const state = stateRef.current;
      if (!state || !acceptInput) return;
      setKey(state, e.code, false);
    };
    const onBlur = () => {
      const state = stateRef.current;
      if (state) state.keys = {};
    };
    const syncPointer = (clientX: number, clientY: number) => {
      const state = stateRef.current;
      if (!state) return;
      // Use cached rect + css size (no layout thrash on mousemove)
      const world = screenToWorld(
        state,
        clientX - rectLeft,
        clientY - rectTop,
        rectW,
        rectH,
      );
      setPointerWorld(state, world.x, world.y, true);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const state = stateRef.current;
      if (!state || !acceptInput || state.phase === "paused") return;
      ensureAudio();
      syncPointer(e.clientX, e.clientY);
      setKey(state, "Mouse0", true);
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const state = stateRef.current;
      if (state && acceptInput) setKey(state, "Mouse0", false);
    };
    const onMouseMove = (e: MouseEvent) => {
      const state = stateRef.current;
      if (!state || !acceptInput || state.phase === "paused") return;
      syncPointer(e.clientX, e.clientY);
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      syncPointer(t.clientX, t.clientY);
    };
    const onScroll = () => {
      // Rare: scroll offset can move rect without resize
      const r = canvas.getBoundingClientRect();
      rectLeft = r.left;
      rectTop = r.top;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("scroll", onScroll, true);
    canvas.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });

    const loop = (now: number) => {
      if (!running) return;
      const state = stateRef.current;
      if (!state) {
        raf = requestAnimationFrame(loop);
        return;
      }
      // Cap dt; skip multi-update spiral when tab was backgrounded
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (dt > 0) update(state, dt);
      renderGame(ctx, state, cssW, cssH, dpr);
      raf = requestAnimationFrame(loop);
    };

    (async () => {
      const state = createGame(mapId, vultureId);
      state.selectedVulture = vultureId;
      state.mapId = mapId;

      const report = (msg: string, pct: number) => {
        if (cancelled) return;
        setLoadMsg(msg);
        setLoadPct(Math.max(0, Math.min(100, Math.round(pct))));
      };

      const waitFrames = async (n: number) => {
        for (let i = 0; i < n; i++) {
          if (cancelled) return;
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }
      };

      // --- Phase 0: fullscreen + layout settle (prevents mid-game resize hitch) ---
      report("화면 준비…", 2);
      await enterBrowserFullscreen(shell);
      resize(true);
      await waitFrames(8);
      resize(true);
      if (cancelled) return;

      // --- Phase A: audio + BGM as early as possible (while assets still load) ---
      report("오디오 준비…", 4);
      const audioP = import("@/lib/audio/sfx")
        .then(async (mod) => {
          sfxModule = mod;
          bindSfxModule(mod);
          sfxResume = () => mod.resumeAudio();
          try {
            await withTimeout(mod.resumeAudio(), 2000, "오디오");
          } catch {
            /* ignore */
          }
          // Keep / resume zone BGM (usually already started on Play click; no restart)
          report("배경음악…", 5);
          void mod.startZoneBgm(mapId).catch((e) => {
            console.warn("[game] BGM skip", e);
          });
          report("전투 SFX 프리로드…", 7);
          try {
            await withTimeout(mod.preloadCombatSfx(), 15000, "SFX");
          } catch (e) {
            console.warn("[game] SFX preload skip", e);
          }
        })
        .catch(() => {});

      // --- Phase B: full visual assets ---
      let assets: GameAssets | null = null;
      try {
        report("맵·기체 로딩…", 10);
        assets = await withTimeout(
          loadGameAssets(mapId, vultureId, ({ msg, pct }) => {
            report(msg, Math.min(88, Math.max(10, pct)));
          }),
          90000,
          "에셋",
        );
        if (cancelled) return;
        state.map = assets.mapDef;
        state.assets = assets;
      } catch (err) {
        console.error("[game] asset load failed", err);
        if (!cancelled) {
          setLoadError(
            err instanceof Error
              ? err.message
              : "에셋 로드 실패 — 프로시저럴 맵으로 시도",
          );
        }
      }

      if (cancelled) return;

      report("오디오 마무리…", 89);
      try {
        await withTimeout(audioP, 12000, "오디오 대기");
      } catch {
        /* continue */
      }
      if (cancelled) return;

      // --- Phase C: GPU texture upload (all craft angles / FX) ---
      if (assets) {
        report("텍스처 업로드…", 90);
        resize(true);
        try {
          await warmGpuTextures(ctx, assets, (done, total) => {
            if (total <= 0) return;
            const p = 90 + Math.round((done / total) * 4);
            report(`텍스처 업로드… ${done}/${total}`, Math.min(94, p));
          });
        } catch (e) {
          console.warn("[game] GPU warm skip", e);
        }
      }
      if (cancelled) return;

      // --- Phase D: combat path warm-up under overlay ---
      report("엔진 워밍업…", 95);
      setSfxMuted(true);
      startMatch(state);
      resize(true);
      warmupCombat(state);
      for (let i = 0; i < 24; i++) {
        if (cancelled) return;
        update(state, 1 / 60);
        renderGame(ctx, state, cssW, cssH, dpr);
        if (i % 8 === 0) {
          report(`엔진 워밍업… ${i + 1}/24`, 95 + Math.round((i / 24) * 2));
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (cancelled) return;
      warmupCombat(state);
      for (let i = 0; i < 12; i++) {
        if (cancelled) return;
        update(state, 1 / 60);
        renderGame(ctx, state, cssW, cssH, dpr);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (cancelled) return;

      // --- Phase E: clean match + real-time settle (~2.5s) under overlay ---
      // GC / driver / JIT finish while user still sees loading — not mid-fight.
      report("프레임 안정화…", 98);
      startMatch(state);
      stateRef.current = state;
      acceptInput = false;
      setLoadPct(99);

      const settleMs = 2500;
      const settleStart = performance.now();
      last = settleStart;
      await new Promise<void>((resolve) => {
        const settleLoop = (now: number) => {
          if (cancelled) {
            resolve();
            return;
          }
          const dt = Math.min(0.033, (now - last) / 1000);
          last = now;
          if (dt > 0) update(state, dt);
          renderGame(ctx, state, cssW, cssH, dpr);
          const elapsed = now - settleStart;
          if (elapsed < settleMs) {
            // Re-warm weapons mid-settle once so late paths stay hot
            if (elapsed > 900 && elapsed < 950) warmupCombat(state);
            const left = Math.max(0, Math.ceil((settleMs - elapsed) / 1000));
            report(`프레임 안정화… ${left}s`, 99);
            raf = requestAnimationFrame(settleLoop);
          } else {
            resolve();
          }
        };
        raf = requestAnimationFrame(settleLoop);
      });
      if (cancelled) return;

      // Fresh match after settle (no warm-up damage / leftover bullets)
      startMatch(state);
      for (let i = 0; i < 6; i++) {
        if (cancelled) return;
        update(state, 1 / 60);
        renderGame(ctx, state, cssW, cssH, dpr);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (cancelled) return;

      // --- Phase F: reveal ---
      report("전투 시작!", 100);
      setLoadError(null);
      setLoadPct(100);
      setSfxMuted(false);
      freezeCanvasAllocUntil = performance.now() + 3000;
      acceptInput = true;
      last = performance.now();
      // Drop overlay first paint, then keep loop going
      setLoading(false);
      setLoadMsg("완료");
      canvas.focus();
      raf = requestAnimationFrame(loop);

      // Safety: if BGM failed to start under overlay, start immediately on reveal
      if (sfxModule) {
        void import("@/lib/audio/midiPlayer")
          .then(({ isMidiPlaying }) => {
            if (cancelled || isMidiPlaying()) return;
            return sfxModule!.startZoneBgm(mapId);
          })
          .catch((e) => console.warn("[game] BGM skip", e));
      }
    })();

    return () => {
      cancelled = true;
      running = false;
      acceptInput = false;
      setSfxMuted(false);
      cancelAnimationFrame(raf);
      stateRef.current = null;
      void import("@/lib/audio/midiPlayer").then(({ stopMidi }) => stopMidi());
      void leaveBrowserFullscreen();
      ro?.disconnect();
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("scroll", onScroll, true);
      canvas.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("touchmove", onTouchMove);
    };
  }, [active, mapId, vultureId, exitToMenu, resumeGame, toggleFullscreen]);

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);

  if (!active) return null;

  return (
    <div
      ref={shellRef}
      className="tm-game-shell fixed inset-0 z-[100] flex flex-col bg-black"
      role="application"
      aria-label="Tactics Mercenary 전체화면 전투"
    >
      {!loading && (
        <div className="pointer-events-auto absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-2 bg-gradient-to-b from-black/80 to-transparent px-3 py-2 sm:px-4">
          <div className="min-w-0 truncate font-mono text-[11px] text-slate-300 sm:text-xs">
            {vultureId} · {mapId}
            {isFs ? " · FULLSCREEN" : " · WINDOW"}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={togglePause}
              className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
            >
              일시정지
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
            >
              {isFs ? "창 모드" : "전체화면"}
            </button>
            <button
              type="button"
              onClick={exitToMenu}
              className="rounded-md border border-rose-400/40 bg-rose-600/90 px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-rose-500"
            >
              게임 종료
            </button>
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className={`h-full w-full touch-none bg-black outline-none ${
            loading ? "cursor-wait" : "cursor-crosshair"
          }`}
          tabIndex={0}
          aria-hidden={loading}
        />

        {loading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#05070c]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.08),transparent_65%)]" />
            <div className="relative flex flex-col items-center gap-4 px-6">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <div className="text-center">
                <p className="font-display text-base tracking-[0.28em] text-amber-200">
                  ZONE LOADING
                </p>
                <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                  {loadPct}%
                </p>
              </div>
              <div className="h-2 w-[min(72vw,320px)] overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-200 ease-out"
                  style={{ width: `${loadPct}%` }}
                />
              </div>
              <p className="max-w-sm text-center text-xs text-slate-400">
                {loadMsg}
              </p>
              <p className="max-w-xs text-center text-[10px] leading-relaxed text-slate-600">
                맵 · 기체 · 텍스처 · 전투 경로를 예열한 뒤 시작합니다.
                <br />
                마지막 &quot;프레임 안정화&quot;까지 기다리면 초반 버벅임이 줄어듭니다.
              </p>
              {loadError && (
                <p className="max-w-md text-center text-xs text-rose-300">
                  {loadError}
                </p>
              )}
              <button
                type="button"
                onClick={exitToMenu}
                className="mt-1 rounded-lg border border-white/20 px-4 py-2 text-xs text-white hover:bg-white/10"
              >
                취소 · 메뉴로
              </button>
            </div>
          </div>
        )}

        {pausedUi && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="w-[min(92vw,360px)] rounded-2xl border border-white/15 bg-slate-950/95 p-6 shadow-2xl">
              <h2 className="font-display text-center text-2xl text-white">PAUSED</h2>
              <p className="mt-2 text-center text-xs text-slate-400">
                Esc / Enter 계속 · Q / F10 종료
              </p>
              <div className="mt-6 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={resumeGame}
                  className="rounded-xl bg-amber-400 py-3 text-sm font-bold text-slate-900 hover:brightness-110"
                >
                  계속하기
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {isFs ? "전체화면 해제" : "전체화면"}
                </button>
                <button
                  type="button"
                  onClick={exitToMenu}
                  className="rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-500"
                >
                  게임 종료 · 메뉴로
                </button>
              </div>
            </div>
          </div>
        )}

        {showTouch && !loading && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-3 p-3 pb-24">
            <div className="pointer-events-auto grid grid-cols-3 grid-rows-2 gap-1.5">
              {TOUCH_DIRS.map((d) => (
                <button
                  key={d.code}
                  type="button"
                  className={`${d.className} flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-black/60 text-lg text-white backdrop-blur-sm active:bg-amber-400 active:text-black`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.target as HTMLButtonElement).setPointerCapture(e.pointerId);
                    holdKey(d.code, true);
                  }}
                  onPointerUp={() => holdKey(d.code, false)}
                  onPointerCancel={() => holdKey(d.code, false)}
                  onPointerLeave={() => holdKey(d.code, false)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="pointer-events-auto flex flex-col gap-2">
              <button
                type="button"
                className="rounded-lg border border-rose-400/40 bg-rose-600/90 px-3 py-2 text-xs font-bold text-white"
                onClick={exitToMenu}
              >
                종료
              </button>
              <button
                type="button"
                className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-400/50 bg-amber-400/90 font-display text-sm font-bold text-slate-900 shadow-lg active:scale-95"
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLButtonElement).setPointerCapture(e.pointerId);
                  holdKey("ControlLeft", true);
                }}
                onPointerUp={() => holdKey("ControlLeft", false)}
                onPointerCancel={() => holdKey("ControlLeft", false)}
                onPointerLeave={() => holdKey("ControlLeft", false)}
              >
                FIRE
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 text-[10px] text-white/40 sm:bottom-2">
        Esc 일시정지 · Q/F10 종료 · F11 전체화면
      </p>
    </div>
  );
}
