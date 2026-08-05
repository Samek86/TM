import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAP_CATALOG,
  ORIGINAL_MAP_CATALOG,
  CREATIVE_MAP_CATALOG,
  mapUrl,
  loadMap,
  loadTil,
  decodeBob,
  decodeAttr,
  renderMapRgba,
  renderTilSheetRgba,
  renderMapComposedRgba,
  pickComposeTileSize,
  drawRgbaToCanvas,
  type TmMap,
  type TmTil,
  type MapViewMode,
} from "@/lib/map";
import { getMap, type MapDef } from "@/data/maps";

type Pane = "composed" | "composed3d" | "heightmap" | "attr" | "flags" | "tiles";

/** Synthetic TmMap from creative MapDef so heightmap pane always works. */
function mapDefToTmMap(def: MapDef): TmMap {
  const n = def.cols * def.rows;
  const heightmap = new Uint16Array(n);
  const attrs = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const elev = def.elevation[i] ?? 0;
    const ramp = def.ramps[i] ?? false;
    heightmap[i] = elev >= 0.5 ? 200 : 40;
    // Fake attr: high plateau vs low; ramps marked
    attrs[i] = ramp ? 0x60000020 : elev >= 0.5 ? 0x40000000 : 0x20000000;
  }
  return {
    version: 2,
    flags: 0,
    width: def.cols,
    height: def.rows,
    sizeField: 0,
    nameTil: def.originalFiles[0]?.replace(/\.til$/i, "") ?? def.id,
    nameBob: "",
    heightmap,
    attrs,
    heightMin: 40,
    heightMax: 200,
  };
}

export function MapViewer() {
  // Default to first original client map (has real MAP binary)
  const [mapId, setMapId] = useState(
    ORIGINAL_MAP_CATALOG[0]?.id ?? MAP_CATALOG[0]!.id,
  );
  // heightmap first so UI never freezes on open; user can switch to compose
  const [pane, setPane] = useState<Pane>("heightmap");
  const [map, setMap] = useState<TmMap | null>(null);
  const [til, setTil] = useState<TmTil | null>(null);
  const [bobInfo, setBobInfo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [painting, setPainting] = useState(false);
  const [scale, setScale] = useState(2);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [composeNote, setComposeNote] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintGen = useRef(0);

  const entry = useMemo(
    () => MAP_CATALOG.find((m) => m.id === mapId) ?? MAP_CATALOG[0]!,
    [mapId],
  );

  // Load map + til (never paint here — keep UI responsive)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMap(null);
    setTil(null);
    setBobInfo("");
    setCursor(null);
    setComposeNote("");

    (async () => {
      try {
        if (entry.mapFile) {
          const m = await loadMap(mapUrl(entry.mapFile));
          if (cancelled) return;
          setMap(m);
        } else {
          // Creative arena — no .MAP file; build height grid from MapDef
          const def = getMap(entry.id);
          if (cancelled) return;
          setMap(mapDefToTmMap(def));
          setBobInfo("창작 맵 · 높이/램프 합성 (원본 MAP 없음)");
        }

        // Yield so heightmap can paint before heavy TIL parse
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;

        if (entry.tilFile) {
          const t = await loadTil(mapUrl(entry.tilFile));
          if (!cancelled) setTil(t);
        }

        if (entry.bobFile) {
          try {
            const res = await fetch(mapUrl(entry.bobFile));
            if (res.ok) {
              const bob = decodeBob(await res.arrayBuffer());
              if (!cancelled) {
                setBobInfo(
                  `BOB ${bob.count} objs · placed ${bob.placed.length}` +
                    (bob.hasEmbeddedSpr
                      ? ` · SPR×${bob.embeddedSprCount}`
                      : "") +
                    ` · trail ${bob.trailing.byteLength}B`,
                );
              }
            }
          } catch {
            /* optional */
          }
        }
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

  // Paint (async, cancellable — heavy compose never blocks click handlers)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const gen = ++paintGen.current;
    let cancelled = false;

    const run = () => {
      if (cancelled || gen !== paintGen.current) return;
      const c = canvasRef.current;
      if (!c) return;

      try {
        if (pane === "tiles") {
          if (!til) {
            setPainting(false);
            return;
          }
          setPainting(true);
          const sheet = renderTilSheetRgba(til, 256, 16);
          if (cancelled || gen !== paintGen.current) return;
          drawRgbaToCanvas(c, sheet.width, sheet.height, sheet.data, Math.max(1, scale));
          setComposeNote(`TIL sheet 256 tiles · ${scale}×`);
          setPainting(false);
          return;
        }

        if (pane === "composed" || pane === "composed3d") {
          if (!til) {
            // Fallback height until TIL ready
            const img = renderMapRgba(map, "height");
            drawRgbaToCanvas(c, img.width, img.height, img.data, fitCellScale(map, scale));
            setComposeNote("TIL 로딩 중… 높이맵 임시 표시");
            setPainting(false);
            return;
          }
          setPainting(true);
          const outTile = pickComposeTileSize(map.width, map.height, 4, 900);
          const heightScale =
            pane === "composed3d" ? Math.max(8, outTile * 6) : 0;
          const composed = renderMapComposedRgba(map, til, {
            outTileSize: outTile,
            heightScale,
            maxPixels: 1_000_000,
          });
          if (cancelled || gen !== paintGen.current) return;

          // Display scale: fit ~1100px wide
          let useScale = scale;
          if (composed.width * useScale > 1100) {
            useScale = 1100 / composed.width;
          }
          if (composed.height * useScale > 720) {
            useScale = Math.min(useScale, 720 / composed.height);
          }
          drawRgbaToCanvas(
            c,
            composed.width,
            composed.height,
            composed.data,
            useScale,
          );
          setComposeNote(
            `합성 ${composed.width}×${composed.height}px · cell ${composed.tileSize}px` +
              (composed.tileSize < 16 ? " (미리보기 해상도)" : " (1:1)"),
          );
          setPainting(false);
          return;
        }

        // height / attr / flags — cheap
        const mode: MapViewMode =
          pane === "heightmap" ? "height" : pane === "attr" ? "attr" : "flags";
        const img = renderMapRgba(map, mode);
        if (cancelled || gen !== paintGen.current) return;
        drawRgbaToCanvas(c, img.width, img.height, img.data, fitCellScale(map, scale));
        setComposeNote(`${map.width}×${map.height} cells · ${pane}`);
        setPainting(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setPainting(false);
        }
      }
    };

    // Defer so React can process map-list / pane clicks first
    setPainting(pane === "composed" || pane === "composed3d" || pane === "tiles");
    const t0 = window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      clearTimeout(t0);
    };
  }, [map, til, pane, scale]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!map || pane === "tiles") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const x = Math.max(
      0,
      Math.min(map.width - 1, Math.floor((px / canvas.width) * map.width)),
    );
    const y = Math.max(
      0,
      Math.min(map.height - 1, Math.floor((py / canvas.height) * map.height)),
    );
    setCursor({ x, y });
  };

  const cellInfo = useMemo(() => {
    if (!map || !cursor) return null;
    const i = cursor.y * map.width + cursor.x;
    const h = map.heightmap[i]!;
    const a = map.attrs[i]!;
    const dec = decodeAttr(a);
    return {
      h,
      a,
      material: dec.material,
      flags: dec.flags,
      variant: dec.variant,
      tileIndex: dec.tileIndex,
    };
  }, [map, cursor]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-tm-dim">
            원본 MAP ({ORIGINAL_MAP_CATALOG.length})
          </p>
          <ul className="tm-scroll max-h-40 space-y-1 overflow-y-auto rounded-xl border border-tm-border bg-tm-panel/80 p-1.5 lg:max-h-[36vh]">
            {ORIGINAL_MAP_CATALOG.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMapId(m.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    mapId === m.id
                      ? "bg-tm-accent/20 text-tm-accent-fg ring-1 ring-tm-accent/40"
                      : "text-tm-muted hover:bg-tm-elevated hover:text-tm-fg"
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="font-mono text-[10px] opacity-70">
                    {m.mapFile}
                    {m.tilFile ? ` · ${m.tilFile}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-tm-dim">
            창작 맵 ({CREATIVE_MAP_CATALOG.length})
          </p>
          <ul className="tm-scroll max-h-32 space-y-1 overflow-y-auto rounded-xl border border-tm-border bg-tm-panel/80 p-1.5">
            {CREATIVE_MAP_CATALOG.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setMapId(m.id)}
                  className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    mapId === m.id
                      ? "bg-tm-accent/20 text-tm-accent-fg ring-1 ring-tm-accent/40"
                      : "text-tm-muted hover:bg-tm-elevated hover:text-tm-fg"
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="font-mono text-[10px] opacity-70">
                    {m.width}×{m.height} · 높이맵
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-1">
          {(
            [
              ["heightmap", "높이맵"],
              ["composed", "타일 합성"],
              ["composed3d", "합성+높이"],
              ["attr", "속성"],
              ["flags", "플래그"],
              ["tiles", "TIL 뱅크"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPane(id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                pane === id
                  ? "bg-tm-cyan/20 text-tm-cyan ring-1 ring-tm-cyan/40"
                  : "bg-tm-elevated text-tm-muted hover:text-tm-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-tm-muted">
          배율
          <input
            type="range"
            min={1}
            max={6}
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="flex-1 accent-tm-accent"
          />
          <span className="font-mono text-tm-fg">{scale}×</span>
        </label>

        {map && (
          <div className="rounded-xl border border-tm-border bg-tm-elevated/40 p-3 font-mono text-[11px] leading-relaxed text-tm-muted">
            <div className="text-tm-fg">
              {map.width}×{map.height} · h {map.heightMin}–{map.heightMax}
            </div>
            <div>
              til key: <span className="text-tm-cyan">{map.nameTil || "—"}</span>
            </div>
            <div>
              bob key: <span className="text-tm-cyan">{map.nameBob || "—"}</span>
            </div>
            {til && (
              <div>
                TIL tiles: <span className="text-tm-fg">{til.tileCount}</span> × 16×16
              </div>
            )}
            {bobInfo && <div>{bobInfo}</div>}
            {composeNote && (
              <div className="mt-1 text-tm-dim">{composeNote}</div>
            )}
            {cellInfo && cursor && (
              <div className="mt-2 border-t border-tm-border pt-2 text-tm-accent-fg">
                cell ({cursor.x},{cursor.y})
                <br />
                height={cellInfo.h}
                <br />
                attr=0x{cellInfo.a.toString(16).padStart(8, "0")}
                <br />
                mat={cellInfo.material} var={cellInfo.variant} fl=0x
                {cellInfo.flags.toString(16)}
                <br />
                tileIndex={cellInfo.tileIndex}{" "}
                <span className="text-tm-dim">(= mat×16 + var&15)</span>
              </div>
            )}
          </div>
        )}
      </aside>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-tm-border bg-tm-void/80">
        <div className="flex items-center justify-between border-b border-tm-border px-3 py-2">
          <div>
            <h2 className="font-display text-sm text-tm-fg">{entry.label}</h2>
            <p className="text-xs text-tm-muted">{entry.theme}</p>
          </div>
          <span className="font-mono text-[10px] text-tm-dim">
            {loading
              ? "로딩…"
              : painting
                ? "렌더 중…"
                : entry.mapFile ?? "creative"}
          </span>
        </div>

        <div className="tm-scroll relative flex min-h-[280px] flex-1 items-center justify-center overflow-auto p-3">
          {error && (
            <p className="max-w-md text-center text-sm text-tm-danger">{error}</p>
          )}
          {/* Keep canvas mounted so paint can run; overlay status */}
          {!error && (
            <>
              {(loading || painting) && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-tm-void/40">
                  <p className="rounded-lg border border-tm-border bg-tm-panel px-3 py-2 text-sm text-tm-muted">
                    {loading ? "맵 디코딩 중…" : "타일 합성 중… (UI는 계속 동작)"}
                  </p>
                </div>
              )}
              <canvas
                ref={canvasRef}
                onClick={onCanvasClick}
                className="max-w-full cursor-crosshair rounded border border-tm-border bg-black shadow-lg"
                style={{ imageRendering: "pixelated" }}
              />
            </>
          )}
        </div>

        <p className="border-t border-tm-border px-3 py-2 text-[11px] text-tm-dim">
          높이맵이 기본(즉시 표시) · 타일 합성은 미리보기 해상도로 비동기 렌더 · attr →
          tile = material×16+(variant&amp;0xF)
        </p>
      </section>
    </div>
  );
}

function fitCellScale(map: TmMap, scale: number): number {
  let useScale = Math.max(1, scale);
  if (map.width * useScale > 1200) {
    useScale = Math.max(1, Math.floor(1200 / map.width));
  }
  if (map.height * useScale > 800) {
    useScale = Math.min(useScale, Math.max(1, Math.floor(800 / map.height)));
  }
  if (map.width * scale <= 1200 && map.height * scale <= 800) {
    useScale = scale;
  }
  return useScale;
}
