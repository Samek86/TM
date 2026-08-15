/**
 * Play-tab previews: original craft SPR + map thumbnail.
 */
import { useEffect, useRef, useState } from "react";
import { getVulture, type VultureDef } from "@/data/vultures";
import type { VultureId } from "@/data/weapons";
import { loadSpr, frameToRgba, loadSharedClientPalette } from "@/lib/spr";
import { sprUrl } from "@/lib/spr/catalog";
import { formatMapSize, getMap } from "@/data/maps";
import { buildStylizedTerrain } from "@/game/terrainStyle";

const SPR_FILE: Record<VultureId, string> = {
  born_armor: "char1.spr",
  killers_pot: "char2.spr",
  sorcerer: "char3.spr",
};

export function CraftPreview({ vultureId }: { vultureId: VultureId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const v = getVulture(vultureId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pal = await loadSharedClientPalette();
        const spr = await loadSpr(sprUrl(SPR_FILE[vultureId]));
        if (cancelled || !spr.frames.length) return;
        const c = canvasRef.current;
        if (!c) return;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        const n = spr.frames.length;
        const face = Math.floor(n * 0.0) % n;
        const fr = spr.frames[face]!;
        const { data, width, height } = frameToRgba(fr, pal);
        const scale = Math.min(4, Math.floor(140 / Math.max(width, height)));
        c.width = width * scale;
        c.height = height * scale;
        ctx.imageSmoothingEnabled = false;
        const img = new ImageData(new Uint8ClampedArray(data), width, height);
        const tmp = document.createElement("canvas");
        tmp.width = width;
        tmp.height = height;
        tmp.getContext("2d")!.putImageData(img, 0, 0);
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(tmp, 0, 0, c.width, c.height);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "SPR load fail");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vultureId]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-tm-border bg-black/60 p-3">
      <canvas ref={canvasRef} className="max-h-36 max-w-full" />
      {err && <p className="text-[10px] text-rose-300">{err}</p>}
      <p className="text-center text-xs text-tm-muted">
        <span className="font-semibold text-tm-fg">{v.name}</span>
        <br />
        {v.blurb}
      </p>
    </div>
  );
}

export function MapPreview({ mapId }: { mapId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [label, setLabel] = useState("맵 로딩…");

  useEffect(() => {
    let cancelled = false;
    setLabel("맵 로딩…");
    try {
      const map = getMap(mapId);
      const style = buildStylizedTerrain(map, mapId);
      if (cancelled) return;
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      c.width = style.canvas.width;
      c.height = style.canvas.height;
      ctx.drawImage(style.canvas, 0, 0);
      setLabel(
        `${map.name} · ${formatMapSize(map)} · ${map.features.slice(0, 2).join(" · ")}`,
      );
    } catch {
      if (!cancelled) setLabel("미리보기 실패");
    }
    return () => {
      cancelled = true;
    };
  }, [mapId]);

  return (
    <div className="overflow-hidden rounded-xl border border-tm-border bg-black">
      <div className="flex max-h-52 items-center justify-center overflow-hidden bg-black p-1">
        <canvas
          ref={canvasRef}
          className="max-h-48 w-full object-contain"
          style={{ imageRendering: "auto" }}
        />
      </div>
      <p className="border-t border-tm-border px-3 py-1.5 text-center text-[11px] text-tm-muted">
        {label}
      </p>
    </div>
  );
}

export function CraftCardArt({
  v,
  selected,
  onSelect,
}: {
  v: VultureDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left transition ${
        selected
          ? "border-tm-accent bg-tm-accent/10"
          : "border-tm-border bg-tm-elevated/50 hover:border-tm-muted"
      }`}
    >
      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-lg bg-black/70">
        <img
          src={`/assets/crafts/${v.id}/hero.jpg`}
          alt={v.name}
          className="h-full w-full object-contain"
        />
      </div>
      <div
        className="mb-1 h-1.5 w-full rounded-full"
        style={{ background: v.accent }}
      />
      <div className="font-semibold text-tm-fg">{v.name}</div>
      <p className="mt-1 text-xs leading-relaxed text-tm-muted">{v.blurb}</p>
      <p className="mt-1 font-mono text-[10px] text-tm-dim">
        HP {v.maxHp} · SPD {v.tilesPerSec.toFixed(0)} · ATK ×
        {v.damageMul.toFixed(2)}
      </p>
    </button>
  );
}
