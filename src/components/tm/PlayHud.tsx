import { useEffect, useRef, type JSX } from "react";
import { sampleLevel, type MapDef } from "@/data/maps";
import { getWeaponById } from "@/data/weapons";
import { getPlayer, type GameState, type Pilot } from "@/game/engine";

const MINI_W = 120;
const MINI_H = 90;

type Pip = { x: number; y: number; r: number; g: number; b: number; a: number };

function paintElevation(ctx: CanvasRenderingContext2D, map: MapDef): void {
  const { cols, rows } = map;
  ctx.clearRect(0, 0, MINI_W, MINI_H);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      const ramp = map.ramps[i] ?? false;
      const elev = map.elevation[i] ?? 0;
      ctx.fillStyle = ramp ? map.ramp : elev >= 0.5 ? map.high : map.ground;
      const x0 = Math.floor((cx / cols) * MINI_W);
      const y0 = Math.floor((cy / rows) * MINI_H);
      const x1 = Math.floor(((cx + 1) / cols) * MINI_W);
      const y1 = Math.floor(((cy + 1) / rows) * MINI_H);
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    }
  }
}

function rankedPilots(pilots: Pilot[]): Pilot[] {
  return [...pilots].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function PlayHud(props: { state: GameState | null; tick: number }): JSX.Element {
  const { state, tick } = props;
  const miniRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MapDef | null>(null);
  const pipRef = useRef<Pip | null>(null);

  useEffect(() => {
    if (!state) return;
    const canvas = miniRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (mapRef.current !== state.map) {
      mapRef.current = state.map;
      pipRef.current = null;
      paintElevation(ctx, state.map);
    }

    const prev = pipRef.current;
    if (prev) {
      ctx.fillStyle = `rgba(${prev.r},${prev.g},${prev.b},${prev.a / 255})`;
      ctx.fillRect(prev.x, prev.y, 1, 1);
    }

    const player = getPlayer(state);
    if (!player) {
      pipRef.current = null;
      return;
    }
    const x = Math.max(
      0,
      Math.min(MINI_W - 1, Math.floor((player.x / Math.max(1, state.map.width)) * MINI_W)),
    );
    const y = Math.max(
      0,
      Math.min(MINI_H - 1, Math.floor((player.y / Math.max(1, state.map.height)) * MINI_H)),
    );
    const pix = ctx.getImageData(x, y, 1, 1).data;
    pipRef.current = { x, y, r: pix[0]!, g: pix[1]!, b: pix[2]!, a: pix[3]! };
    ctx.fillStyle = "#facc15";
    ctx.fillRect(x, y, 1, 1);
  }, [state, tick]);

  if (!state) return <></>;

  const player = getPlayer(state);
  const leaders = rankedPilots(state.pilots);
  const elev = player ? sampleLevel(state.map, player.x, player.y) : 0;
  const speed = player ? Math.round(Math.hypot(player.vx, player.vy)) : 0;
  const hpFrac = player ? player.hp / Math.max(1, player.maxHp) : 0;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-white">
      <div className="absolute left-3 top-14 w-[210px] rounded-lg border border-white/15 bg-black/70 px-3 py-2">
        <p className="truncate font-mono text-[11px] text-slate-300">{state.map.name}</p>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[10px] font-bold tracking-wide text-slate-400">SCOREBOARD</span>
          <span className="font-mono text-[10px] text-slate-500">K/{state.killLimit}</span>
        </div>
        <ul className="mt-1 space-y-0.5">
          {leaders.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 text-xs ${
                p.isPlayer ? "bg-sky-400/15" : i === 0 ? "bg-amber-400/10" : ""
              }`}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: p.accent }}
              />
              <span className={`min-w-0 flex-1 truncate ${p.isPlayer ? "font-bold" : "text-slate-200"}`}>
                {p.isPlayer ? `${p.name} (YOU)` : p.name}
              </span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  i === 0 ? "text-amber-300" : "text-white"
                }`}
              >
                {p.score}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <canvas
        ref={miniRef}
        width={MINI_W}
        height={MINI_H}
        className="absolute right-3 top-14 rounded-md border border-white/15 bg-black/70"
        aria-hidden
      />

      {player && (
        <div className="absolute inset-x-0 bottom-6 flex items-end gap-3 bg-black/70 px-3 py-2 sm:px-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-slate-400">HP</span>
              <div className="h-2.5 w-40 overflow-hidden rounded-sm bg-slate-800">
                <div
                  className={`h-full ${hpFrac > 0.3 ? "bg-emerald-500" : "bg-rose-500"}`}
                  style={{ width: `${Math.max(0, Math.min(100, hpFrac * 100))}%` }}
                />
              </div>
            </div>
            <p className="mt-1 font-mono text-[11px] text-slate-300">
              SPEED {speed} {elev >= 1 ? "HIGH" : "LOW"}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-1">
            {player.weapons.map((wid, slot) => {
              const ww = getWeaponById(wid);
              const isDefault = slot === 0;
              const am = player.ammo[wid];
              const empty = !isDefault && (am ?? 0) <= 0;
              const active = slot === player.weaponIndex && !empty;
              return (
                <div
                  key={`${slot}-${wid}`}
                  className={`flex h-10 w-14 flex-col items-center justify-center rounded border-2 font-mono ${
                    empty ? "opacity-45" : ""
                  }`}
                  style={{
                    backgroundColor: active ? ww.color : empty ? "#0f172a" : "#1e293b",
                    borderColor: active ? "#f8fafc" : empty ? "#1e293b" : isDefault ? "#475569" : "#334155",
                    color: active ? "#0f172a" : empty ? "#64748b" : "#cbd5e1",
                  }}
                >
                  <span className="text-[10px] font-bold">{slot + 1}</span>
                  <span className="text-[8px] leading-none">{ww.name.slice(0, 6)}</span>
                  <span className="text-[9px] font-bold">
                    {isDefault ? "∞" : `×${Math.max(0, am ?? 0)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state.messageT > 0 && state.message && (
        <div className="absolute left-1/2 top-[18%] w-[min(calc(100%-2.5rem),480px)] -translate-x-1/2 rounded border border-amber-400/50 bg-black/70 px-4 py-2 text-center text-sm font-semibold text-amber-200">
          {state.message}
        </div>
      )}
    </div>
  );
}
