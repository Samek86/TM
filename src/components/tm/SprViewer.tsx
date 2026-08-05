import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SPR_CATALOG,
  SPR_CATEGORIES,
  sprUrl,
  type SprCatalogEntry,
  type SprCategory,
  decodeSpr,
  frameToRgba,
  framesToSheet,
  getDefaultPalette,
  toImageData,
  type SprSprite,
  type RgbaPalette,
} from "@/lib/spr";
import { loadSharedClientPalette } from "@/lib/spr/tilPalette";

const SCALE_OPTIONS = [1, 2, 3, 4, 6] as const;

export function SprViewer() {
  const [cat, setCat] = useState<SprCategory | "all">("vulture");
  const [selectedId, setSelectedId] = useState("char1");
  const [sprite, setSprite] = useState<SprSprite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [scale, setScale] = useState<number>(3);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(12);
  const [showSheet, setShowSheet] = useState(false);
  const [checker, setChecker] = useState(true);
  const [palette, setPalette] = useState<RgbaPalette>(() => getDefaultPalette());
  const [palLabel, setPalLabel] = useState("임시");

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSharedClientPalette().then((p) => {
      if (!cancelled) {
        setPalette(p);
        setPalLabel("jungle.til DAC");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => (cat === "all" ? SPR_CATALOG : SPR_CATALOG.filter((e) => e.category === cat)),
    [cat],
  );

  const entry: SprCatalogEntry | undefined =
    SPR_CATALOG.find((e) => e.id === selectedId) ?? items[0];

  // Load SPR when selection changes
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSprite(null);
    setFrameIdx(0);

    (async () => {
      try {
        const res = await fetch(sprUrl(entry.file));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const decoded = decodeSpr(buf);
        if (cancelled) return;
        if (decoded.bytesConsumed !== buf.byteLength) {
          console.warn(
            `SPR ${entry.file}: consumed ${decoded.bytesConsumed} / ${buf.byteLength}`,
          );
        }
        setSprite(decoded);
        setFrameIdx(0);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [entry]);

  // Animation tick
  useEffect(() => {
    if (!playing || !sprite || showSheet || sprite.frames.length <= 1) return;
    const ms = Math.max(16, Math.round(1000 / fps));
    const id = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % sprite.frames.length);
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, sprite, fps, showSheet]);

  // Paint current frame / sheet
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (showSheet) {
      const sheet = framesToSheet(sprite.frames, 10, palette);
      canvas.width = sheet.width * scale;
      canvas.height = sheet.height * scale;
      const tmp = document.createElement("canvas");
      tmp.width = sheet.width;
      tmp.height = sheet.height;
      const tctx = tmp.getContext("2d")!;
      tctx.putImageData(toImageData(sheet.data, sheet.width, sheet.height), 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
      return;
    }

    const frame = sprite.frames[frameIdx];
    if (!frame) return;
    const { width, height, data } = frameToRgba(frame, palette);
    const tmp = document.createElement("canvas");
    tmp.width = width;
    tmp.height = height;
    tmp.getContext("2d")!.putImageData(toImageData(data, width, height), 0, 0);

    canvas.width = Math.max(1, width * scale);
    canvas.height = Math.max(1, height * scale);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  }, [sprite, frameIdx, scale, showSheet, palette]);

  useEffect(() => {
    paint();
  }, [paint]);

  const frame = sprite?.frames[frameIdx];

  return (
    <div className="flex h-full min-h-0 max-h-full flex-col gap-3 overflow-hidden lg:flex-row">
      {/* Sidebar — list scrolls inside viewport */}
      <aside className="flex max-h-[40vh] w-full shrink-0 flex-col gap-2 overflow-hidden lg:max-h-full lg:w-64">
        <div className="flex shrink-0 flex-wrap gap-1">
          {SPR_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCat(c.id);
                const first =
                  c.id === "all"
                    ? SPR_CATALOG[0]
                    : SPR_CATALOG.find((e) => e.category === c.id);
                if (first) setSelectedId(first.id);
              }}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                cat === c.id
                  ? "bg-tm-cyan/20 text-tm-cyan ring-1 ring-tm-cyan/40"
                  : "bg-tm-elevated text-tm-muted hover:text-tm-fg"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="shrink-0 text-[10px] text-tm-dim">
          {items.length}개 파일{cat === "all" ? " · 스크롤" : ""}
        </p>
        <ul className="tm-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain rounded-xl border border-tm-border bg-tm-panel/80 p-1.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                  entry?.id === item.id
                    ? "bg-tm-accent/20 text-tm-accent-fg ring-1 ring-tm-accent/40"
                    : "text-tm-muted hover:bg-tm-elevated hover:text-tm-fg"
                }`}
              >
                <div className="font-medium leading-tight">{item.label}</div>
                <div className="font-mono text-[10px] opacity-60">{item.file}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main stage — fixed within parent; canvas pane scrolls */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="font-display text-lg text-tm-fg">
              {entry?.label ?? "SPR"}
            </h2>
            <p className="mt-0.5 truncate font-mono text-xs text-tm-dim">
              {entry ? sprUrl(entry.file) : ""}
              {entry?.note ? ` · ${entry.note}` : ""}
            </p>
          </div>
          {sprite && (
            <div className="flex flex-wrap gap-2 text-[11px] font-mono text-tm-muted">
              <span className="rounded bg-tm-elevated px-2 py-1">
                type={sprite.type}
              </span>
              <span className="rounded bg-tm-elevated px-2 py-1">
                frames={sprite.frameCount}
              </span>
              {frame && (
                <span className="rounded bg-tm-elevated px-2 py-1">
                  {frame.width}×{frame.height}
                </span>
              )}
              <span className="rounded bg-tm-elevated px-2 py-1 text-tm-cyan">
                decode OK · {sprite.bytesConsumed}B
              </span>
            </div>
          )}
        </header>

        <div
          className={`relative flex min-h-0 flex-1 items-start justify-center overflow-auto overscroll-contain rounded-xl border border-tm-border p-4 ${
            checker
              ? "bg-[length:16px_16px] bg-[linear-gradient(45deg,#1a2332_25%,transparent_25%),linear-gradient(-45deg,#1a2332_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#1a2332_75%),linear-gradient(-45deg,transparent_75%,#1a2332_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-tm-void"
              : "bg-tm-void"
          }`}
        >
          {loading && (
            <p className="absolute inset-0 z-10 flex items-center justify-center bg-tm-void/70 text-sm text-tm-muted">
              디코딩 중…
            </p>
          )}
          {error && (
            <p className="m-auto text-sm text-tm-danger">오류: {error}</p>
          )}
          {!loading && !error && (
            <canvas
              ref={canvasRef}
              className="mx-auto my-auto block shrink-0"
              style={{ imageRendering: "pixelated" }}
            />
          )}
        </div>

        {/* Controls */}
        <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-tm-border bg-tm-panel/90 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              disabled={!sprite || showSheet}
              className="rounded-lg bg-tm-accent px-3 py-1.5 text-xs font-bold text-tm-void disabled:opacity-40"
            >
              {playing ? "일시정지" : "재생"}
            </button>
            <button
              type="button"
              onClick={() => setShowSheet((s) => !s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                showSheet
                  ? "bg-tm-cyan text-tm-void"
                  : "bg-tm-elevated text-tm-muted hover:text-tm-fg"
              }`}
            >
              {showSheet ? "시트 닫기" : "전체 시트"}
            </button>
            <button
              type="button"
              onClick={() => setChecker((c) => !c)}
              className="rounded-lg bg-tm-elevated px-3 py-1.5 text-xs text-tm-muted hover:text-tm-fg"
            >
              체크보드
            </button>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-tm-muted">
              배율
              <select
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="rounded border border-tm-border bg-tm-void px-2 py-1 text-tm-fg"
              >
                {SCALE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    ×{s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-tm-muted">
              FPS
              <input
                type="range"
                min={2}
                max={30}
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-20"
              />
              <span className="w-5 font-mono text-tm-fg">{fps}</span>
            </label>
          </div>

          {sprite && !showSheet && (
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 font-mono text-xs text-tm-dim">
                #{frameIdx}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0, sprite.frameCount - 1)}
                value={frameIdx}
                onChange={(e) => {
                  setPlaying(false);
                  setFrameIdx(Number(e.target.value));
                }}
                className="min-w-0 flex-1"
              />
              <span className="shrink-0 font-mono text-xs text-tm-dim">
                / {sprite.frameCount - 1}
              </span>
            </div>
          )}

          {frame && (
            <p className="font-mono text-[10px] leading-relaxed text-tm-dim">
              hotspot A[{frame.pointsA.join(",")}] · B[{frame.pointsB.join(",")}]
              {sprite?.globalPoints
                ? ` · global[${sprite.globalPoints.join(",")}]`
                : ""}
              {" · "}
              팔레트: {palLabel} (인덱스 형태 100% · 원본 DD 팔레트는 추가 리버싱)
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
