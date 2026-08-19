import { useCallback, useEffect, useRef, useState } from "react";
import {
  bindSfxModule,
  createGame,
  getPlayer,
  setAimStick,
  setKey,
  setMoveStick,
  setPointerWorld,
  setSfxMuted,
  startMatch,
  update,
  type GameState,
} from "@/game/engine";
import { getMap } from "@/data/maps";
import { createPlayView, type PlayView } from "@/game/view3d";
import { loadCraftArt } from "@/game/view3d/craftAssets";
import { CRAFT_IDS, loadCraftModels } from "@/game/view3d/craftModels";
import { detectQuality } from "@/game/view3d/quality";
import { loadOrdnanceArt } from "@/game/view3d/ordnanceArt";
import { loadTerrainKit } from "@/game/view3d/terrainTextures";
import { sculptedHeight } from "@/game/heightfield";
import type { VultureId } from "@/data/weapons";
import { PlayHud } from "./PlayHud";
import { TouchSticks } from "./TouchSticks";

interface Props {
  mapId: string;
  vultureId: VultureId;
  active: boolean;
  onExit?: () => void;
  /** Browser Fullscreen API on match start. False = stay in the tab (창 모드). */
  startFullscreen?: boolean;
}

function readQuality() {
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
  };
  return detectQuality({
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    innerWidth: window.innerWidth,
    hardwareConcurrency: navigator.hardwareConcurrency,
    saveData: nav.connection?.saveData,
  });
}

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

export function GameCanvas({
  mapId,
  vultureId,
  active,
  onExit,
  startFullscreen = true,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const startFullscreenRef = useRef(startFullscreen);
  startFullscreenRef.current = startFullscreen;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const viewRef = useRef<PlayView | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const [showTouch, setShowTouch] = useState(false);
  const [pausedUi, setPausedUi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState("준비 중…");
  const [loadPct, setLoadPct] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [hudTick, setHudTick] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const showTouchRef = useRef(false);
  showTouchRef.current = showTouch;

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

  const exitToMenu = useCallback(() => {
    void leaveBrowserFullscreen();
    void import("@/lib/audio/bgm").then(({ stopBgm }) => stopBgm());
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

  // Main game loop + staged 3D view load (deps: only active/map/vulture)
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;

    let raf = 0;
    let last = performance.now();
    let running = true;
    let cancelled = false;
    /** Block gameplay input until settle finishes (keys still allow Q exit). */
    let acceptInput = false;
    let view: PlayView | null = null;
    setLoading(true);
    setLoadMsg("전투 준비 중…");
    setLoadPct(0);
    setLoadError(null);
    setFatal(null);
    setPausedUi(false);
    setHudTick(0);
    setSfxMuted(true);
    const quality = readQuality();

    // Cache layout metrics — never read clientWidth/getBoundingClientRect in the hot path
    let cssW = shell.clientWidth || window.innerWidth;
    let cssH = shell.clientHeight || window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
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

    const resize = () => {
      const nextW = shell.clientWidth || window.innerWidth;
      const nextH = shell.clientHeight || window.innerHeight;
      const nextDpr = Math.min(window.devicePixelRatio || 1, quality.maxDpr);
      cssW = nextW;
      cssH = nextH;
      dpr = nextDpr;
      setViewport((previous) =>
        previous.width === cssW && previous.height === cssH
          ? previous
          : { width: cssW, height: cssH },
      );
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      view?.resize(cssW, cssH, dpr, showTouchRef.current || cssW < 768);
      const r = canvas.getBoundingClientRect();
      rectLeft = r.left;
      rectTop = r.top;
      rectW = r.width || cssW;
      rectH = r.height || cssH;
    };
    const onWindowResize = () => resize();
    resize();
    window.addEventListener("resize", onWindowResize);
    // Catch fullscreen / flex layout changes that don't fire window.resize
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => resize())
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

      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      ) {
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
      if (!state) return;
      state.keys = {};
      state.moveStick = null;
      state.aimStick = null;
    };
    const syncPointer = (clientX: number, clientY: number) => {
      const state = stateRef.current;
      if (!state || !view) return;
      const aim = view.pickAim(
        clientX - rectLeft,
        clientY - rectTop,
        rectW,
        rectH,
      );
      if (!aim) return;
      setPointerWorld(state, aim.x, aim.y, true);
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
      if (showTouchRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      syncPointer(t.clientX, t.clientY);
    };
    const blockNativeTouch = (e: TouchEvent) => {
      if (showTouchRef.current) e.preventDefault();
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
    canvas.addEventListener("touchstart", blockNativeTouch, { passive: false });
    canvas.addEventListener("touchmove", blockNativeTouch, { passive: false });

    const loop = (now: number) => {
      if (!running) return;
      const state = stateRef.current;
      const play = viewRef.current;
      if (!state || !play) {
        raf = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (dt > 0) update(state, dt);
      play.renderFrame(state, dt);
      if (((now / 100) | 0) !== (((now - dt * 1000) / 100) | 0)) {
        setHudTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };

    (async () => {
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

      // --- Phase 0: optional fullscreen + layout settle ---
      report("화면 준비…", 2);
      if (startFullscreenRef.current) {
        await enterBrowserFullscreen(shell);
      }
      resize();
      await waitFrames(8);
      resize();
      if (cancelled) return;

      // --- Phase A: audio + BGM as early as possible ---
      report("오디오 준비…", 8);
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
          report("배경음악…", 12);
          void mod.startZoneBgm(mapId).catch((e) => {
            console.warn("[game] BGM skip", e);
          });
          report("전투 SFX 프리로드…", 16);
          try {
            await withTimeout(mod.preloadCombatSfx(), 15000, "SFX");
          } catch (e) {
            console.warn("[game] SFX preload skip", e);
          }
        })
        .catch(() => {});

      report("오디오 마무리…", 20);
      try {
        await withTimeout(audioP, 12000, "오디오 대기");
      } catch {
        /* continue */
      }
      if (cancelled) return;

      // --- Phase B: play map + 3D view (terrain, craft art, weapon SPR) ---
      report("전장 준비…", 40);
      const map = getMap(mapId);
      const state = createGame(mapId, vultureId);
      state.selectedVulture = vultureId;
      state.mapId = mapId;
      state.map = map;
      startMatch(state);
      stateRef.current = state;
      if (import.meta.env.DEV) {
        (window as unknown as { __tmState?: GameState }).__tmState = state;
      }

      report("지형 텍스처…", 50);
      const kit = await loadTerrainKit(mapId);
      if (cancelled) return;
      report("기체 에셋…", 62);
      const craftModels = await loadCraftModels();
      if (cancelled) return;
      const spriteIds = CRAFT_IDS.filter((id) => !craftModels[id]);
      const craftArt = await loadCraftArt(spriteIds);
      if (cancelled) return;
      report("무기 페인팅…", 66);
      const ordnance = await loadOrdnanceArt();
      if (cancelled) return;

      report("3D 뷰 시작…", 70);
      let playView: PlayView;
      try {
        playView = createPlayView(
          canvas,
          map,
          kit,
          craftArt,
          ordnance,
          craftModels,
          quality,
        );
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error ? err.message : "WebGL을 시작할 수 없습니다";
          setFatal(msg);
          setLoadError(msg);
          setLoading(false);
        }
        return;
      }
      if (cancelled) {
        playView.dispose();
        return;
      }

      view = playView;
      viewRef.current = playView;
      playView.resize(cssW, cssH, dpr, showTouchRef.current || cssW < 768);

      report("프레임 안정화…", 90);
      for (let i = 0; i < 8; i++) {
        if (cancelled) return;
        update(state, 1 / 60);
        playView.renderFrame(state, 1 / 60);
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (cancelled) return;

      // --- Phase C: reveal ---
      report("전투 시작!", 100);
      setLoadError(null);
      setFatal(null);
      setLoadPct(100);
      setSfxMuted(false);
      acceptInput = true;
      last = performance.now();
      setLoading(false);
      setLoadMsg("완료");
      canvas.focus();
      raf = requestAnimationFrame(loop);

      if (sfxModule) {
        void import("@/lib/audio/bgm")
          .then(({ isBgmPlaying }) => {
            if (cancelled || isBgmPlaying()) return;
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
      viewRef.current?.dispose();
      viewRef.current = null;
      view = null;
      stateRef.current = null;
      void import("@/lib/audio/bgm").then(({ stopBgm }) => stopBgm());
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
      canvas.removeEventListener("touchstart", blockNativeTouch);
      canvas.removeEventListener("touchmove", blockNativeTouch);
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
      {!loading && !fatal && (
        <div
          className={`pointer-events-auto absolute z-20 flex items-center gap-2 ${
            showTouch
              ? "right-2 top-[max(0.5rem,env(safe-area-inset-top))]"
              : "left-0 right-0 top-0 justify-between bg-gradient-to-b from-black/80 to-transparent px-3 py-2 sm:px-4"
          }`}
        >
          {!showTouch && (
            <div className="min-w-0 truncate font-mono text-[11px] text-slate-300 sm:text-xs">
              {vultureId} · {mapId}
              {isFs ? " · FULLSCREEN" : " · WINDOW"}
            </div>
          )}
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={togglePause}
              className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
            >
              일시정지
            </button>
            {!showTouch && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-white/20"
              >
                {isFs ? "창 모드" : "전체화면"}
              </button>
            )}
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
            loading || fatal ? "cursor-wait" : "cursor-none"
          }`}
          tabIndex={0}
          aria-hidden={loading || !!fatal}
        />

        {!loading && !fatal && (
          <PlayHud
            state={stateRef.current}
            tick={hudTick}
            mobile={showTouch}
            viewportWidth={viewport.width}
            viewportHeight={viewport.height}
            projectWorld={(x, y, height) =>
              viewRef.current?.projectWorld(x, y, height) ?? null
            }
            heightOf={(x, y) =>
              sculptedHeight(stateRef.current!.map, x, y) + 18
            }
            onSelectWeapon={(slot) => {
              const player = stateRef.current && getPlayer(stateRef.current);
              if (player && player.weapons[slot] !== undefined) {
                player.weaponIndex = slot;
              }
            }}
          />
        )}

        {(loading || fatal) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-[#05070c]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.08),transparent_65%)]" />
            <div className="relative flex flex-col items-center gap-4 px-6">
              {!fatal && (
                <div className="h-12 w-12 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              )}
              <div className="text-center">
                <p className="font-display text-base tracking-[0.28em] text-amber-200">
                  {fatal ? "ZONE FAILED" : "ZONE LOADING"}
                </p>
                {!fatal && (
                  <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                    {loadPct}%
                  </p>
                )}
              </div>
              {!fatal && (
                <div className="h-2 w-[min(72vw,320px)] overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-200 ease-out"
                    style={{ width: `${loadPct}%` }}
                  />
                </div>
              )}
              {!fatal && (
                <p className="max-w-sm text-center text-xs text-slate-400">
                  {loadMsg}
                </p>
              )}
              {!fatal && (
                <p className="max-w-xs text-center text-[10px] leading-relaxed text-slate-600">
                  3D 전장과 오디오를 준비한 뒤 시작합니다.
                </p>
              )}
              {(fatal || loadError) && (
                <p className="max-w-md text-center text-xs text-rose-300">
                  {fatal ?? loadError}
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
              <h2 className="font-display text-center text-2xl text-white">
                PAUSED
              </h2>
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

        {showTouch && !loading && !fatal && (
          <TouchSticks
            onMove={(vec) => {
              const state = stateRef.current;
              if (state) setMoveStick(state, vec);
            }}
            onAim={(vec) => {
              const state = stateRef.current;
              if (state) setAimStick(state, vec);
            }}
            onAimHeld={(down) => {
              const state = stateRef.current;
              if (state) setKey(state, "Mouse0", down);
            }}
          />
        )}
      </div>

      {!showTouch && (
        <p className="pointer-events-none absolute bottom-1 left-1/2 z-20 -translate-x-1/2 text-[10px] text-white/40 sm:bottom-2">
          Esc 일시정지 · Q/F10 종료 · F11 전체화면
        </p>
      )}
    </div>
  );
}
