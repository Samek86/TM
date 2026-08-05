import { sampleHeight, type MapDef } from "@/data/maps";
import { weaponById } from "./weaponLookup";
import type { Bullet, GameState, Pilot } from "./engine";
import { getPlayer } from "./engine";
import { angleToCraftFrame, type GameAssets } from "./assets";
import { getCameraView } from "./camera";
import { VIEW_WORLD_WIDTH } from "./viewScale";
import {
  buildStylizedTerrain,
  drawStylizedTerrain,
  worldElevLift,
  type StylizedTerrain,
} from "./terrainStyle";

function getWeapon(id: number) {
  return weaponById(id);
}

function getAssets(state: GameState): GameAssets | null {
  return (state.assets as GameAssets | undefined) ?? null;
}

const styleCache = new WeakMap<GameState["map"], StylizedTerrain>();
/** Static elevation preview for the radar / minimap (no pilots). */
const minimapBaseCache = new WeakMap<MapDef, HTMLCanvasElement>();

function hexToRgbLocal(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Build a small semi-readable terrain bitmap for the minimap (cached per map). */
function getMinimapBase(map: MapDef): HTMLCanvasElement {
  let canvas = minimapBaseCache.get(map);
  if (canvas) return canvas;

  const cols = map.cols;
  const rows = map.rows;
  // Cap resolution so large grids stay cheap
  const px = Math.min(220, Math.max(cols, rows) * 2);
  const cell = Math.max(1, Math.floor(px / Math.max(cols, rows)));
  canvas = document.createElement("canvas");
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(canvas.width, canvas.height);
  const data = img.data;

  const [lr, lg, lb] = hexToRgbLocal(map.ground);
  const [hr, hg, hb] = hexToRgbLocal(map.high);
  const [rr, rg, rb] = hexToRgbLocal(map.ramp);
  const [cr, cg, cb] = hexToRgbLocal(map.cliff);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = cy * cols + cx;
      const elev = map.elevation[i] ?? 0;
      const ramp = map.ramps[i] ?? false;
      let r: number;
      let green: number;
      let b: number;
      if (ramp) {
        r = rr;
        green = rg;
        b = rb;
      } else if (elev >= 0.5) {
        r = hr;
        green = hg;
        b = hb;
      } else {
        r = lr;
        green = lg;
        b = lb;
      }
      // Soft checker so plateaus still read at tiny scale
      const checker = ((cx ^ cy) & 1) === 0 ? 1 : 0.92;
      r = (r * checker) | 0;
      green = (green * checker) | 0;
      b = (b * checker) | 0;

      // Cliff edge hint: high cell next to low
      if (elev >= 0.5) {
        const n =
          (cx > 0 && (map.elevation[i - 1] ?? 0) < 0.5) ||
          (cx < cols - 1 && (map.elevation[i + 1] ?? 0) < 0.5) ||
          (cy > 0 && (map.elevation[i - cols] ?? 0) < 0.5) ||
          (cy < rows - 1 && (map.elevation[i + cols] ?? 0) < 0.5);
        if (n) {
          r = ((r * 2 + cr) / 3) | 0;
          green = ((green * 2 + cg) / 3) | 0;
          b = ((b * 2 + cb) / 3) | 0;
        }
      }

      const x0 = cx * cell;
      const y0 = cy * cell;
      for (let py = 0; py < cell; py++) {
        let p = ((y0 + py) * canvas.width + x0) * 4;
        for (let pxI = 0; pxI < cell; pxI++) {
          data[p] = r;
          data[p + 1] = green;
          data[p + 2] = b;
          data[p + 3] = 255;
          p += 4;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  minimapBaseCache.set(map, canvas);
  return canvas;
}

/**
 * Top-right radar: terrain + local pilot only (no enemies / no pickups).
 * Sits under the DOM control buttons.
 */
function drawMinimap(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  screenW: number,
  screenH: number,
): void {
  const map = state.map;
  const player = getPlayer(state);
  const base = getMinimapBase(map);

  // Fit under the top-right button row without crowding the scoreboard
  const maxSide = Math.min(168, Math.max(112, Math.floor(screenW * 0.15)));
  const aspect = map.width / Math.max(1, map.height);
  let mw: number;
  let mh: number;
  if (aspect >= 1) {
    mw = maxSide;
    mh = Math.max(72, Math.round(maxSide / aspect));
  } else {
    mh = maxSide;
    mw = Math.max(72, Math.round(maxSide * aspect));
  }

  const pad = 12;
  // DOM buttons: ~py-2 + button height ≈ 44–52px
  const top = 54;
  const x = screenW - pad - mw;
  const y = top;
  // Keep clear of bottom HUD
  if (y + mh > screenH - 84) return;

  const r = 10;
  ctx.save();

  // Soft drop shadow
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.beginPath();
  ctx.moveTo(x + r + 2, y + 3);
  ctx.arcTo(x + mw + 2, y + 3, x + mw + 2, y + mh + 3, r);
  ctx.arcTo(x + mw + 2, y + mh + 3, x + 2, y + mh + 3, r);
  ctx.arcTo(x + 2, y + mh + 3, x + 2, y + 3, r);
  ctx.arcTo(x + 2, y + 3, x + mw + 2, y + 3, r);
  ctx.closePath();
  ctx.fill();

  // Panel chrome
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + mw, y, x + mw, y + mh, r);
  ctx.arcTo(x + mw, y + mh, x, y + mh, r);
  ctx.arcTo(x, y + mh, x, y, r);
  ctx.arcTo(x, y, x + mw, y, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(8, 12, 20, 0.55)";
  ctx.fill();
  ctx.save();
  ctx.clip();

  // Terrain (semi-transparent)
  ctx.globalAlpha = 0.72;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(base, x, y, mw, mh);
  ctx.globalAlpha = 1;

  // Dim vignette so the player pip pops
  const vg = ctx.createRadialGradient(
    x + mw / 2,
    y + mh / 2,
    Math.min(mw, mh) * 0.2,
    x + mw / 2,
    y + mh / 2,
    Math.max(mw, mh) * 0.72,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, mw, mh);

  const sx = mw / map.width;
  const sy = mh / map.height;

  // Camera FOV frame (matches getCameraView world window)
  if (player && player.respawn <= 0) {
    const targetWorldW = Math.min(map.width, VIEW_WORLD_WIDTH);
    const viewScale =
      Math.min(screenW / targetWorldW, screenH / targetWorldW) * 1.02;
    const viewW = screenW / viewScale;
    const viewH = screenH / viewScale;
    const vx = x + (player.x - viewW / 2) * sx;
    const vy = y + (player.y - viewH / 2) * sy;
    const vw = viewW * sx;
    const vh = viewH * sy;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.fillStyle = "rgba(148, 163, 184, 0.06)";
    ctx.fillRect(vx, vy, vw, vh);
  }

  // Local pilot only — never draw other pilots
  if (player) {
    const px = x + player.x * sx;
    const py = y + player.y * sy;
    const alive = player.respawn <= 0;
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4.2);

    // Soft range halo
    ctx.beginPath();
    ctx.arc(px, py, 7 + pulse * 2, 0, Math.PI * 2);
    ctx.fillStyle = alive
      ? `rgba(56, 189, 248, ${0.18 + pulse * 0.12})`
      : "rgba(148, 163, 184, 0.15)";
    ctx.fill();

    // Heading chevron
    if (alive) {
      const ang = player.angle;
      const len = 8;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.75 + pulse * 0.2})`;
      ctx.fillStyle = `rgba(56, 189, 248, ${0.85 + pulse * 0.1})`;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(px + cos * len, py + sin * len);
      ctx.lineTo(px - cos * 4 + sin * 4.5, py - sin * 4 - cos * 4.5);
      ctx.lineTo(px - cos * 4 - sin * 4.5, py - sin * 4 + cos * 4.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Core pip
    ctx.fillStyle = alive ? "#f0f9ff" : "#94a3b8";
    ctx.beginPath();
    ctx.arc(px, py, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // clip

  // Border + corner accent
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + mw, y, x + mw, y + mh, r);
  ctx.arcTo(x + mw, y + mh, x, y + mh, r);
  ctx.arcTo(x, y + mh, x, y, r);
  ctx.arcTo(x, y, x + mw, y, r);
  ctx.closePath();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tiny label
  ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
  ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("MAP", x + 8, y + 12);

  ctx.restore();
}

function getTerrainStyle(state: GameState): StylizedTerrain {
  const assets = getAssets(state);
  if (assets?.style) return assets.style;
  if (assets?.terrain?.style) return assets.terrain.style;
  let s = styleCache.get(state.map);
  if (!s) {
    s = buildStylizedTerrain(state.map, state.mapId);
    styleCache.set(state.map, s);
  }
  return s;
}

/** Binary high plateau lift — uses cached style. */
function elevWorld(
  style: StylizedTerrain,
  state: GameState,
  x: number,
  y: number,
): number {
  return worldElevLift(style, state.map, x, y);
}

// Reused sort buffers (no per-frame alloc)
const pilotSortBuf: Pilot[] = [];
const leaderSortBuf: Pilot[] = [];

// Cached vignette (createRadialGradient is expensive every frame)
let vgW = -1;
let vgH = -1;
let vgGrad: CanvasGradient | null = null;
let vgCtx: CanvasRenderingContext2D | null = null;

// Reused camera view bounds (no object churn)
const viewBounds = { x: 0, y: 0, w: 0, h: 0 };

export function renderGame(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cssW: number,
  cssH: number,
  dpr: number,
): void {
  const w = cssW;
  const h = cssH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  const shake = state.shake;
  const sx = shake > 0.05 ? (Math.random() - 0.5) * shake : 0;
  const sy = shake > 0.05 ? (Math.random() - 0.5) * shake : 0;
  const cam = getCameraView(state, w, h, sx, sy);
  const style = getTerrainStyle(state);

  // World-space camera viewport for terrain cull
  const invS = 1 / cam.viewScale;
  const invSy = 1 / cam.yScale;
  viewBounds.x = -cam.ox * invS;
  viewBounds.y = -cam.oy * invSy;
  viewBounds.w = w * invS;
  viewBounds.h = h * invSy;

  ctx.save();
  ctx.translate(cam.ox, cam.oy);
  ctx.scale(cam.viewScale, cam.yScale);

  drawStylizedTerrain(ctx, state, style, state.time, viewBounds);
  drawPickups(ctx, state, style);
  drawBullets(ctx, state, style);

  pilotSortBuf.length = 0;
  for (let i = 0; i < state.pilots.length; i++) pilotSortBuf.push(state.pilots[i]!);
  pilotSortBuf.sort((a, b) => a.y - b.y);
  for (let i = 0; i < pilotSortBuf.length; i++) {
    const p = pilotSortBuf[i]!;
    if (p.respawn > 0) {
      ctx.globalAlpha = 0.25;
      drawPilot(ctx, p, state, style);
      ctx.globalAlpha = 1;
    } else {
      drawPilot(ctx, p, state, style);
    }
  }
  drawAimCue(ctx, state, style);
  drawParticles(ctx, state);

  ctx.restore();

  drawHud(ctx, state, w, h, style);
}

function drawAimCue(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  style: StylizedTerrain,
): void {
  const player = getPlayer(state);
  if (!player || player.respawn > 0 || state.phase !== "playing") return;
  const px = player.x;
  const py = player.y - elevWorld(style, state, player.x, player.y);
  const tx = state.pointer.x;
  const ty =
    state.pointer.y - elevWorld(style, state, state.pointer.x, state.pointer.y);
  ctx.save();
  ctx.strokeStyle = "rgba(56,189,248,0.35)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(251,191,36,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(tx, ty, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx - 10, ty);
  ctx.lineTo(tx + 10, ty);
  ctx.moveTo(tx, ty - 10);
  ctx.lineTo(tx, ty + 10);
  ctx.stroke();
  ctx.restore();
}

/**
 * Pickup halo for weapons the local pilot can stock.
 * Soft outer glow + crisp dual ring + slow rotating dashes.
 */
function drawPickupEligibleRing(
  ctx: CanvasRenderingContext2D,
  bob: number,
): void {
  const pulse = 0.55 + 0.45 * Math.sin(bob * 2);
  const r = 15 + pulse * 2.4;
  const spin = bob * 0.85;

  // Soft outer bloom (cyan — high contrast on dark terrain)
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.12 + pulse * 0.14})`;
  ctx.lineWidth = 5.5;
  ctx.beginPath();
  ctx.arc(0, 0, r + 1.5, 0, Math.PI * 2);
  ctx.stroke();

  // Main crisp ring
  ctx.strokeStyle = `rgba(103, 232, 249, ${0.55 + pulse * 0.35})`;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  // Inner thin counter-ring
  ctx.strokeStyle = `rgba(165, 243, 252, ${0.22 + pulse * 0.18})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r - 3.2, 0, Math.PI * 2);
  ctx.stroke();

  // Three rotating arc ticks — reads as "active / lootable"
  ctx.strokeStyle = `rgba(224, 255, 255, ${0.7 + pulse * 0.25})`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  const tickLen = Math.PI * 0.22;
  for (let i = 0; i < 3; i++) {
    const a0 = spin + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a0 + tickLen);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPickups(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  style: StylizedTerrain,
): void {
  const assets = getAssets(state);
  const player = getPlayer(state);
  for (const pk of state.pickups) {
    if (!pk.alive) continue;
    const w = getWeapon(pk.weaponId);
    // Field loadout only (slots 1–3 / keys 2–4) — same gate as engine pickup
    const eligible =
      !!player && player.weapons.indexOf(pk.weaponId) >= 1;
    const yo = elevWorld(style, state, pk.x, pk.y) + Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y - yo);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (eligible) {
      drawPickupEligibleRing(ctx, pk.bob);
    } else {
      // Unusable for this craft: faint neutral outline only
      ctx.strokeStyle = "rgba(148, 163, 184, 0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.55;
    }

    const body = assets?.weaponBodies?.[pk.weaponId];
    const item = assets?.items;
    if (body && body.frames.length > 0) {
      const fi = Math.floor(pk.bob * 2) % body.frameCount;
      const frame = body.frames[fi]!;
      const scale = Math.max(0.9, 22 / Math.max(frame.width, frame.height, 1));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        frame,
        (-frame.width * scale) / 2,
        (-frame.height * scale) / 2,
        frame.width * scale,
        frame.height * scale,
      );
    } else if (item && item.frames.length > 0) {
      const fi = (pk.weaponId + Math.floor(pk.bob)) % item.frameCount;
      const frame = item.frames[fi]!;
      const scale = Math.max(0.9, 20 / Math.max(frame.width, frame.height, 1));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        frame,
        (-frame.width * scale) / 2,
        (-frame.height * scale) / 2,
        frame.width * scale,
        frame.height * scale,
      );
    } else {
      ctx.fillStyle = w.color;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0b0f16";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(w.id), 0, 3);
    }
    ctx.restore();
  }
}

function drawPilot(
  ctx: CanvasRenderingContext2D,
  p: Pilot,
  state: GameState,
  style: StylizedTerrain,
): void {
  const yo = elevWorld(style, state, p.x, p.y);
  const assets = getAssets(state);
  const spr = assets?.vultures?.[p.vultureId];

  // Idle hover: soft bob + sway when still (fades out while moving)
  const still = p.stillness ?? 0;
  const phase = p.hoverPhase ?? 0;
  const bob =
    still *
    (Math.sin(state.time * 4.2 + phase) * 2.6 +
      Math.sin(state.time * 7.1 + phase * 1.3) * 0.9);
  const sway = still * Math.sin(state.time * 2.7 + phase * 0.7) * 1.35;
  // Shadow breathes opposite to lift so craft feels airborne
  const shadowScale = 1 - still * 0.12 + bob * 0.015;

  ctx.save();
  ctx.translate(p.x + sway, p.y - yo);

  // Ground shadow (fixed oval — not rotated with craft)
  ctx.fillStyle = "rgba(0,0,0,0.42)";
  ctx.beginPath();
  ctx.ellipse(
    0,
    11 - bob * 0.35,
    p.radius * 0.95 * shadowScale,
    p.radius * 0.32 * shadowScale,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();

  ctx.translate(0, bob);

  if (spr && spr.frames.length > 0) {
    // Hotspot LUT maps aim angle → frame so nose matches missiles/mouse
    const fi = angleToCraftFrame(p.angle, spr.frameCount, spr.angleLut);
    const frame = spr.frames[fi]!;
    const scale = Math.max(
      1.05,
      (p.radius * 2.55) / Math.max(frame.width, frame.height),
    );
    const dw = frame.width * scale;
    const dh = frame.height * scale;
    const piv = spr.pivot ?? {
      x: frame.width / 2,
      y: frame.height / 2,
    };
    const pivotX = piv.x * scale;
    const pivotY = piv.y * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, -pivotX, -pivotY, dw, dh);
  } else {
    // Procedural fallback craft facing +X then rotate
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.radius + 6, 0);
    ctx.lineTo(-p.radius * 0.7, p.radius * 0.75);
    ctx.lineTo(-p.radius * 0.35, 0);
    ctx.lineTo(-p.radius * 0.7, -p.radius * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(2, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.translate(p.x + sway, p.y - yo + bob - p.radius - 14);
  ctx.fillStyle = p.isPlayer ? "#f8fafc" : "#94a3b8";
  ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(p.name, 0, 0);
  const hw = 28;
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(-hw, 4, hw * 2, 4);
  ctx.fillStyle = p.hp / p.maxHp > 0.3 ? "#22c55e" : "#ef4444";
  ctx.fillRect(-hw, 4, hw * 2 * (p.hp / p.maxHp), 4);
  if (p.catchTimer > 0) {
    ctx.fillStyle = "#34d399";
    ctx.font = "9px monospace";
    ctx.fillText("CAUGHT", 0, -12);
  }
  ctx.restore();
}

/** Soft contact shadow under flying ordnance. */
function drawProjShadow(
  ctx: CanvasRenderingContext2D,
  L: number,
  W: number,
  alpha = 0.28,
): void {
  ctx.save();
  ctx.translate(0, W * 0.85 + 2);
  ctx.scale(1, 0.28);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.42, W * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Realistic missile / rocket silhouette:
 * exhaust plume → nozzle → metallic tube body → bands → cruciform fins → warhead cone.
 */
function drawRealisticMissile(
  ctx: CanvasRenderingContext2D,
  opts: {
    L: number;
    W: number;
    accent: string;
    lifeT: number;
    time: number;
    kind: "dart" | "scatter" | "cruise" | "standard";
  },
): void {
  const { L, W, accent, lifeT, time, kind } = opts;
  const nose = L * (kind === "cruise" ? 0.52 : kind === "dart" ? 0.48 : 0.46);
  const tail = -L * (kind === "cruise" ? 0.48 : 0.42);
  const bodyR = W * (kind === "cruise" ? 1.05 : kind === "dart" ? 0.72 : kind === "scatter" ? 0.82 : 0.92);
  const flicker = 0.82 + 0.18 * Math.sin(time * 48 + L);

  // Ground contact shadow
  drawProjShadow(ctx, L, bodyR, kind === "cruise" ? 0.34 : 0.24);

  // ---- Exhaust plume (layered, soft) ----
  const plumeLen =
    L *
    (kind === "cruise" ? 1.15 : kind === "dart" ? 0.85 : kind === "scatter" ? 0.7 : 0.95) *
    (0.9 + 0.1 * flicker);
  const plume = ctx.createLinearGradient(tail, 0, tail - plumeLen, 0);
  plume.addColorStop(0, `rgba(255,255,255,${0.75 * lifeT * flicker})`);
  plume.addColorStop(0.12, `rgba(254,240,138,${0.7 * lifeT})`);
  plume.addColorStop(0.35, `rgba(251,146,60,${0.45 * lifeT})`);
  plume.addColorStop(0.65, `rgba(239,68,68,${0.22 * lifeT})`);
  plume.addColorStop(1, "rgba(100,100,120,0)");
  ctx.fillStyle = plume;
  ctx.beginPath();
  ctx.moveTo(tail + 1, 0);
  ctx.quadraticCurveTo(
    tail - plumeLen * 0.35,
    -bodyR * (1.1 + 0.25 * flicker),
    tail - plumeLen,
    0,
  );
  ctx.quadraticCurveTo(
    tail - plumeLen * 0.35,
    bodyR * (1.1 + 0.25 * flicker),
    tail + 1,
    0,
  );
  ctx.fill();
  // Hot core
  ctx.globalAlpha = 0.55 * lifeT * flicker;
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.ellipse(tail - plumeLen * 0.18, 0, plumeLen * 0.22, bodyR * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ---- Nozzle ring ----
  const noz = ctx.createLinearGradient(tail - 1, -bodyR, tail - 1, bodyR);
  noz.addColorStop(0, "#64748b");
  noz.addColorStop(0.5, "#0f172a");
  noz.addColorStop(1, "#475569");
  ctx.fillStyle = noz;
  ctx.beginPath();
  ctx.roundRect(tail - 2.5, -bodyR * 0.95, 4.5, bodyR * 1.9, 1.2);
  ctx.fill();
  // Nozzle interior glow
  ctx.fillStyle = `rgba(251,191,36,${0.55 * flicker})`;
  ctx.beginPath();
  ctx.ellipse(tail - 0.5, 0, 1.6, bodyR * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  // ---- Cruciform fins (rear) ----
  if (kind !== "dart") {
    const finX0 = tail + L * 0.08;
    const finX1 = tail + L * 0.22;
    const finOut = bodyR * (kind === "cruise" ? 2.35 : 1.95);
    const finGrad = ctx.createLinearGradient(finX0, 0, finX1, 0);
    finGrad.addColorStop(0, "#1e293b");
    finGrad.addColorStop(1, accent);
    ctx.fillStyle = finGrad;
    // top / bottom
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(finX1, s * bodyR * 0.85);
      ctx.lineTo(finX0 - 1, s * finOut);
      ctx.lineTo(finX0 + L * 0.06, s * bodyR * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }
    // side fins (flattened “X” in 2D: short mid wings)
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.moveTo(finX1, 0);
    ctx.lineTo(finX0, -bodyR * 0.15);
    ctx.lineTo(finX0 - 2, 0);
    ctx.lineTo(finX0, bodyR * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // Tiny canards for dart AAM look
    ctx.fillStyle = "#475569";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(nose * 0.15, s * bodyR * 0.9);
      ctx.lineTo(nose * -0.05, s * bodyR * 1.55);
      ctx.lineTo(nose * -0.18, s * bodyR * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---- Main tube body (metal cylinder with side light) ----
  const bodyX0 = tail + 2;
  const bodyX1 = nose * 0.55;
  const metal = ctx.createLinearGradient(0, -bodyR, 0, bodyR);
  metal.addColorStop(0, "#f1f5f9");
  metal.addColorStop(0.18, "#cbd5e1");
  metal.addColorStop(0.42, accent);
  metal.addColorStop(0.55, "#1e293b");
  metal.addColorStop(0.78, accent);
  metal.addColorStop(1, "#0f172a");
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.moveTo(bodyX0, -bodyR);
  ctx.lineTo(bodyX1, -bodyR);
  ctx.quadraticCurveTo(bodyX1 + bodyR * 0.15, 0, bodyX1, bodyR);
  ctx.lineTo(bodyX0, bodyR);
  ctx.closePath();
  ctx.fill();
  // Specular ridge
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = Math.max(0.8, bodyR * 0.22);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(bodyX0 + 2, -bodyR * 0.45);
  ctx.lineTo(bodyX1 - 2, -bodyR * 0.42);
  ctx.stroke();
  ctx.lineCap = "butt";

  // Panel seams
  ctx.strokeStyle = "rgba(15,23,42,0.35)";
  ctx.lineWidth = 0.8;
  for (const t of [0.22, 0.48, 0.72]) {
    const x = bodyX0 + (bodyX1 - bodyX0) * t;
    ctx.beginPath();
    ctx.moveTo(x, -bodyR * 0.92);
    ctx.lineTo(x, bodyR * 0.92);
    ctx.stroke();
  }

  // Accent band (unit marking)
  const bandX = bodyX0 + (bodyX1 - bodyX0) * (kind === "cruise" ? 0.38 : 0.55);
  const bandW = kind === "cruise" ? L * 0.1 : L * 0.055;
  const band = ctx.createLinearGradient(bandX, -bodyR, bandX, bodyR);
  band.addColorStop(0, "#fef9c3");
  band.addColorStop(0.5, kind === "cruise" ? "#facc15" : accent);
  band.addColorStop(1, "#713f12");
  ctx.fillStyle = band;
  ctx.fillRect(bandX - bandW * 0.5, -bodyR * 0.95, bandW, bodyR * 1.9);

  // Forward canards on cruise (Tomahawk-ish)
  if (kind === "cruise") {
    ctx.fillStyle = "#334155";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(nose * 0.05, s * bodyR * 0.9);
      ctx.lineTo(nose * -0.12, s * bodyR * 1.85);
      ctx.lineTo(nose * -0.28, s * bodyR * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  // ---- Warhead / nose cone ----
  const tip = L * (kind === "dart" ? 0.58 : 0.55);
  const noseMetal = ctx.createLinearGradient(bodyX1, -bodyR, tip, 0);
  noseMetal.addColorStop(0, "#e2e8f0");
  noseMetal.addColorStop(0.35, "#94a3b8");
  noseMetal.addColorStop(0.7, "#475569");
  noseMetal.addColorStop(1, "#0f172a");
  ctx.fillStyle = noseMetal;
  ctx.beginPath();
  ctx.moveTo(bodyX1, -bodyR * 0.98);
  ctx.quadraticCurveTo(bodyX1 + (tip - bodyX1) * 0.45, -bodyR * 0.55, tip, 0);
  ctx.quadraticCurveTo(bodyX1 + (tip - bodyX1) * 0.45, bodyR * 0.55, bodyX1, bodyR * 0.98);
  ctx.closePath();
  ctx.fill();
  // Nose highlight
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bodyX1 + 1, -bodyR * 0.35);
  ctx.quadraticCurveTo((bodyX1 + tip) * 0.55, -bodyR * 0.2, tip - 2, -1);
  ctx.stroke();
  // Seeker window / tip
  ctx.fillStyle = kind === "dart" ? "rgba(56,189,248,0.85)" : "rgba(248,250,252,0.9)";
  ctx.beginPath();
  ctx.ellipse(tip - bodyR * 0.35, 0, bodyR * 0.45, bodyR * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "dart") {
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.arc(tip - bodyR * 0.45, -bodyR * 0.12, bodyR * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Realistic free-fall / lofted bomb body. */
function drawRealisticBomb(
  ctx: CanvasRenderingContext2D,
  opts: {
    r: number;
    accent: string;
    lifeT: number;
    time: number;
    nuke: boolean;
  },
): void {
  const { r, accent, lifeT, time, nuke } = opts;
  const L = r * (nuke ? 2.6 : 2.2);
  const W = r * (nuke ? 0.95 : 0.78);

  drawProjShadow(ctx, L * 0.9, W, 0.3);

  // Tail fins (box empennage)
  ctx.fillStyle = "#1e293b";
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-L * 0.35, s * W * 0.7);
    ctx.lineTo(-L * 0.62, s * W * 1.85);
    ctx.lineTo(-L * 0.42, s * W * 0.75);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = "#334155";
  ctx.fillRect(-L * 0.55, -W * 0.35, L * 0.18, W * 0.7);

  // Cylindrical casing
  const casing = ctx.createLinearGradient(0, -W, 0, W);
  casing.addColorStop(0, "#f8fafc");
  casing.addColorStop(0.2, "#cbd5e1");
  casing.addColorStop(0.45, nuke ? "#fecaca" : accent);
  casing.addColorStop(0.55, "#1e293b");
  casing.addColorStop(0.8, accent);
  casing.addColorStop(1, "#0f172a");
  ctx.fillStyle = casing;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
  ctx.fill();
  // Olive drab / olive band
  ctx.fillStyle = nuke ? "#7f1d1d" : "#3f6212";
  ctx.fillRect(-L * 0.12, -W * 0.95, L * 0.14, W * 1.9);
  // Highlight
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, -W * 0.35, L * 0.28, W * 0.25, 0, 0, Math.PI);
  ctx.stroke();

  // Nose fuse
  const fuse = ctx.createLinearGradient(L * 0.25, 0, L * 0.55, 0);
  fuse.addColorStop(0, "#94a3b8");
  fuse.addColorStop(1, "#0f172a");
  ctx.fillStyle = fuse;
  ctx.beginPath();
  ctx.moveTo(L * 0.28, -W * 0.55);
  ctx.lineTo(L * 0.58, 0);
  ctx.lineTo(L * 0.28, W * 0.55);
  ctx.closePath();
  ctx.fill();
  // Armed blink on fuse tip
  const blink = Math.sin(time * (nuke ? 14 : 9)) > 0;
  ctx.fillStyle = blink ? "#fef08a" : "#ef4444";
  ctx.globalAlpha = 0.7 + 0.3 * lifeT;
  ctx.beginPath();
  ctx.arc(L * 0.52, 0, nuke ? 2.2 : 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (nuke) {
    // Hazard stripes
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.42, W, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = "rgba(250,204,21,0.55)";
    ctx.lineWidth = 2.5;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 5 - 8, -W);
      ctx.lineTo(i * 5 + 8, W);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Polished procedural projectile art — always drawn along locked fire angle. */
function drawProjectileArt(
  ctx: CanvasRenderingContext2D,
  b: Bullet,
  bx: number,
  by: number,
  time = 0,
): void {
  const ang = b.angle;
  const lifeT = b.maxLife > 0 ? Math.max(0, b.life / b.maxLife) : 1;
  ctx.save();
  ctx.translate(bx, by);
  ctx.imageSmoothingEnabled = true;
  // High quality scaling for soft gradients
  try {
    ctx.imageSmoothingQuality = "high";
  } catch {
    /* ignore */
  }

  // ---- Stationary air mine ----
  if (b.ammo === "mine") {
    const pulse = 0.9 + 0.1 * Math.sin(time * 5 + b.x * 0.04);
    const armT = b.maxLife > 0 ? Math.min(1, (b.maxLife - b.life) / 0.35) : 1;
    const r = b.radius * pulse;
    drawProjShadow(ctx, r * 1.2, r * 0.8, 0.3);
    ctx.globalAlpha = 0.18 + 0.2 * armT;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const shell = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 0, 0, 0, r);
    shell.addColorStop(0, "#f7fee7");
    shell.addColorStop(0.4, b.color);
    shell.addColorStop(1, "#14532d");
    ctx.fillStyle = shell;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Rivet ring
    ctx.fillStyle = "#052e16";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (armT >= 1) {
      ctx.fillStyle = Math.sin(time * 10) > 0 ? "#fef08a" : "#ef4444";
      ctx.beginPath();
      ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // ---- Cloud AoE (soft volumetric, less cartoon) ----
  if (b.ammo === "cloud") {
    const R = Math.max(10, b.radius);
    const fade = Math.min(1, lifeT * 1.35);
    const frost = b.style === "frost";
    const bob = Math.sin(time * (frost ? 1.2 : 2.0)) * 0.03;
    ctx.rotate(ang);
    ctx.scale(1.08 + bob, frost ? 1.0 : 0.92);
    // Outer haze
    const haze = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
    haze.addColorStop(0, hexToRgba(frost ? "#f0f9ff" : "#ecfeff", 0.35 * fade));
    haze.addColorStop(0.45, hexToRgba(b.color, 0.28 * fade));
    haze.addColorStop(1, hexToRgba(b.color, 0));
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    if (frost) {
      ctx.globalAlpha = 0.28 * fade;
      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.9, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Soft lobes
    const lobes = frost ? 6 : 5;
    for (let i = 0; i < lobes; i++) {
      const a = (i / lobes) * Math.PI * 2 + time * (frost ? 0.2 : 0.4);
      const d = R * 0.36;
      const rr = R * (0.3 + 0.08 * Math.sin(time * 1.6 + i));
      const lg = ctx.createRadialGradient(
        Math.cos(a) * d,
        Math.sin(a) * d,
        0,
        Math.cos(a) * d,
        Math.sin(a) * d,
        rr,
      );
      lg.addColorStop(0, hexToRgba(frost ? "#f8fafc" : "#ffffff", 0.4 * fade));
      lg.addColorStop(0.55, hexToRgba(b.color, 0.32 * fade));
      lg.addColorStop(1, hexToRgba(b.color, 0));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  ctx.rotate(ang);
  const ds = b.drawScale > 0 ? b.drawScale : 1;

  if (b.ammo === "missile") {
    const kind =
      b.style === "dart"
        ? "dart"
        : b.style === "cruise"
          ? "cruise"
          : b.style === "scatter"
            ? "scatter"
            : "standard";
    const lenMul =
      kind === "dart" ? 5.4 : kind === "cruise" ? 7.2 : kind === "scatter" ? 4.4 : 5.8;
    const widMul =
      kind === "dart" ? 0.48 : kind === "cruise" ? 1.35 : kind === "scatter" ? 0.7 : 1.0;
    const L = Math.max(16, b.radius * lenMul * Math.max(0.75, ds));
    const W = Math.max(2.4, b.radius * widMul);
    drawRealisticMissile(ctx, {
      L,
      W,
      accent: b.color,
      lifeT,
      time,
      kind,
    });
  } else if (b.ammo === "beam") {
    // Coherent laser: outer bloom + hard core + slight glow
    const L = 18 + b.radius * 4.5;
    const bloom = ctx.createLinearGradient(-L, 0, L, 0);
    bloom.addColorStop(0, "rgba(255,255,255,0)");
    bloom.addColorStop(0.2, hexToRgba(b.color, 0.15 * lifeT));
    bloom.addColorStop(0.5, hexToRgba(b.color, 0.55 * lifeT));
    bloom.addColorStop(0.8, hexToRgba(b.color, 0.15 * lifeT));
    bloom.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = bloom;
    ctx.lineWidth = Math.max(4, b.radius * 2.4);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-L, 0);
    ctx.lineTo(L, 0);
    ctx.stroke();
    ctx.strokeStyle = hexToRgba(b.color, 0.85 * lifeT);
    ctx.lineWidth = Math.max(2, b.radius * 1.1);
    ctx.beginPath();
    ctx.moveTo(-L * 0.95, 0);
    ctx.lineTo(L * 0.95, 0);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * lifeT})`;
    ctx.lineWidth = Math.max(1, b.radius * 0.45);
    ctx.beginPath();
    ctx.moveTo(-L * 0.7, 0);
    ctx.lineTo(L * 0.7, 0);
    ctx.stroke();
    ctx.lineCap = "butt";
  } else if (b.ammo === "explosive") {
    drawRealisticBomb(ctx, {
      r: Math.max(5, b.radius * (b.style === "nuke" ? 1.15 : 1)),
      accent: b.color,
      lifeT,
      time,
      nuke: b.style === "nuke",
    });
  } else {
    // Precision AP round / heavy slug / plazma bolt
    const isPierce = b.style === "pierce";
    const isHeavy = b.style === "heavy";
    const isPoke = b.style === "poke";
    const L =
      Math.max(10, b.radius * 3.6) *
      (isPierce ? 1.55 : isHeavy ? 1.45 : isPoke ? 0.85 : 1);
    const W =
      Math.max(2.2, b.radius * 0.9) *
      (isPierce ? 0.42 : isHeavy ? 1.55 : isPoke ? 0.7 : 1);

    drawProjShadow(ctx, L * 0.7, W, 0.2);

    if (isPoke) {
      // Glowing plasma bolt
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.7);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, b.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.65, W * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(L * 0.05, 0, L * 0.22, W * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Metal kinetic round
      const shell = ctx.createLinearGradient(0, -W, 0, W);
      shell.addColorStop(0, "#f8fafc");
      shell.addColorStop(0.25, "#cbd5e1");
      shell.addColorStop(0.5, b.color);
      shell.addColorStop(0.75, "#334155");
      shell.addColorStop(1, "#0f172a");
      ctx.fillStyle = shell;
      ctx.beginPath();
      if (isPierce) {
        // APDS-like long rod
        ctx.moveTo(L * 0.55, 0);
        ctx.lineTo(L * 0.15, -W);
        ctx.lineTo(-L * 0.45, -W * 0.75);
        ctx.lineTo(-L * 0.55, 0);
        ctx.lineTo(-L * 0.45, W * 0.75);
        ctx.lineTo(L * 0.15, W);
        ctx.closePath();
      } else {
        ctx.moveTo(L * 0.5, 0);
        ctx.quadraticCurveTo(L * 0.15, -W, -L * 0.35, -W * 0.9);
        ctx.lineTo(-L * 0.5, -W * 0.5);
        ctx.lineTo(-L * 0.5, W * 0.5);
        ctx.lineTo(-L * 0.35, W * 0.9);
        ctx.quadraticCurveTo(L * 0.15, W, L * 0.5, 0);
        ctx.closePath();
      }
      ctx.fill();
      // Sabot ring / driving band
      ctx.fillStyle = isHeavy ? "#fbbf24" : "#64748b";
      ctx.fillRect(-L * 0.12, -W * 0.95, L * 0.1, W * 1.9);
      // Specular
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-L * 0.3, -W * 0.4);
      ctx.lineTo(L * 0.25, -W * 0.35);
      ctx.stroke();
      if (isHeavy) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return `rgba(148,163,184,${a})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

function drawBullets(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  style: StylizedTerrain,
): void {
  for (const b of state.bullets) {
    if (!b.alive) continue;
    const yo = elevWorld(style, state, b.x, b.y);
    // Mines gently bob in mid-air
    const mineBob =
      b.ammo === "mine" ? Math.sin(state.time * 3.8 + b.x * 0.03) * 2.4 : 0;
    drawProjectileArt(ctx, b, b.x, b.y - yo + mineBob, state.time);
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, state: GameState): void {
  const assets = getAssets(state);
  const explode = assets?.explode;
  const debris = assets?.debris;
  // Avoid save/restore for simple particles — biggest particle-path win
  ctx.imageSmoothingEnabled = false;
  for (const p of state.particles) {
    if (!p.alive) continue;
    const t = p.maxLife > 0 ? p.life / p.maxLife : 0;
    const alpha = t < 0 ? 0 : t > 1 ? 1 : t;

    if (p.kind === "explode" && explode && explode.frames.length) {
      const fi = Math.min(
        explode.frameCount - 1,
        ((1 - t) * explode.frameCount) | 0,
      );
      const frame = explode.frames[(fi + p.frame) % explode.frameCount]!;
      const scale =
        (p.size / Math.max(frame.width, frame.height, 1)) * (0.7 + (1 - t));
      const dw = frame.width * scale;
      const dh = frame.height * scale;
      ctx.globalAlpha = alpha;
      ctx.drawImage(frame, p.x - dw / 2, p.y - dh / 2, dw, dh);
    } else if (p.kind === "debris" && debris && debris.frames.length) {
      const frame = debris.frames[p.frame % debris.frameCount]!;
      const scale = p.size / Math.max(frame.width, frame.height, 1);
      const dw = frame.width * scale;
      const dh = frame.height * scale;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = alpha;
      ctx.drawImage(frame, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else if (p.kind === "smoke") {
      const r = p.size * (1.1 + (1 - t) * 0.5);
      ctx.globalAlpha = alpha * 0.32;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === "muzzle") {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + t), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

const RANK_COLORS = ["#fbbf24", "#cbd5e1", "#d97706", "#94a3b8", "#64748b", "#64748b"];

/** Top-left translucent scoreboard — ranks every pilot at a glance. */
function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  originY: number,
): void {
  leaderSortBuf.length = 0;
  for (let i = 0; i < state.pilots.length; i++) {
    leaderSortBuf.push(state.pilots[i]!);
  }
  leaderSortBuf.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const rows = leaderSortBuf.length;
  const rowH = 26;
  const padX = 12;
  const padY = 10;
  const panelW = 210;
  const panelH = padY * 2 + 18 + rows * rowH;
  const x = 12;
  const y = originY;

  ctx.fillStyle = "rgba(8, 12, 20, 0.72)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
  ctx.lineWidth = 1;
  // rounded rect
  const r = 8;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + panelW, y, x + panelW, y + panelH, r);
  ctx.arcTo(x + panelW, y + panelH, x, y + panelH, r);
  ctx.arcTo(x, y + panelH, x, y, r);
  ctx.arcTo(x, y, x + panelW, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = "bold 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("SCOREBOARD", x + padX, y + padY + 11);
  ctx.textAlign = "right";
  ctx.font = "10px monospace";
  ctx.fillStyle = "#64748b";
  ctx.fillText(`K/${state.killLimit}`, x + panelW - padX, y + padY + 11);

  for (let i = 0; i < rows; i++) {
    const p = leaderSortBuf[i]!;
    const ry = y + padY + 18 + i * rowH;
    const rank = i + 1;
    const isLead = rank === 1;
    const isYou = p.isPlayer;

    // Row highlight for player / leader
    if (isYou) {
      ctx.fillStyle = "rgba(56, 189, 248, 0.14)";
      ctx.fillRect(x + 4, ry, panelW - 8, rowH - 2);
    } else if (isLead) {
      ctx.fillStyle = "rgba(251, 191, 36, 0.1)";
      ctx.fillRect(x + 4, ry, panelW - 8, rowH - 2);
    }

    // Rank badge
    const bx = x + padX;
    const by = ry + 4;
    ctx.fillStyle = RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)]!;
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(bx, by, 22, 16, 4);
      ctx.fill();
    } else {
      ctx.fillRect(bx, by, 22, 16);
    }
    ctx.fillStyle = rank <= 3 ? "#0f172a" : "#e2e8f0";
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(rank), bx + 11, by + 12);

    // Name + accent dot
    ctx.textAlign = "left";
    ctx.fillStyle = p.accent;
    ctx.beginPath();
    ctx.arc(bx + 32, by + 8, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isYou ? "#f8fafc" : "#cbd5e1";
    ctx.font = isYou
      ? "bold 12px ui-sans-serif, system-ui"
      : "600 12px ui-sans-serif, system-ui";
    const label = isYou ? `${p.name} (YOU)` : p.name;
    ctx.fillText(label, bx + 40, by + 12);

    // Score
    ctx.textAlign = "right";
    ctx.font = isLead ? "bold 14px monospace" : "bold 13px monospace";
    ctx.fillStyle = isLead ? "#fbbf24" : "#e2e8f0";
    ctx.fillText(String(p.score), x + panelW - padX, by + 12);
  }
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  w: number,
  h: number,
  style: StylizedTerrain,
): void {
  const player = getPlayer(state);
  // Cache radial vignette — createRadialGradient is costly every frame
  if (vgCtx !== ctx || vgW !== w || vgH !== h || !vgGrad) {
    vgCtx = ctx;
    vgW = w;
    vgH = h;
    vgGrad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      h * 0.25,
      w / 2,
      h / 2,
      h * 0.8,
    );
    vgGrad.addColorStop(0, "rgba(0,0,0,0)");
    vgGrad.addColorStop(1, "rgba(0,0,0,0.4)");
  }
  ctx.fillStyle = vgGrad;
  ctx.fillRect(0, 0, w, h);

  // Top bar — left title only.
  // Right side is reserved for DOM controls (pause / fullscreen / quit);
  // do not draw help text there or it stacks under the buttons.
  ctx.fillStyle = "rgba(8,12,20,0.72)";
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 13px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`TM  ·  ${state.map.name}`, 14, 28);

  // Left scoreboard under top bar
  drawScoreboard(ctx, state, 52);
  // Top-right radar under DOM buttons — player only, no enemies
  drawMinimap(ctx, state, w, h);

  if (player) {
    ctx.fillStyle = "rgba(8,12,20,0.78)";
    ctx.fillRect(0, h - 72, w, 72);
    ctx.fillStyle = "#64748b";
    ctx.font = "11px monospace";
    ctx.textAlign = "left";
    ctx.fillText("HP", 16, h - 48);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(40, h - 56, 160, 10);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(40, h - 56, 160 * (player.hp / player.maxHp), 10);
    const elev = sampleHeight(state.map, player.x, player.y);
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(
      `SPEED ${Math.round(player.speedStat)}  ${elev >= 0.5 ? "HIGH" : "LOW"}`,
      16,
      h - 28,
    );
    // Controls tip in bottom bar — top-right is reserved for DOM buttons
    ctx.fillStyle = "#64748b";
    ctx.font = "10px ui-sans-serif, system-ui";
    ctx.fillText("WASD · 마우스 조준/발사 · 1–4 무기", 16, h - 12);
    let sx = 220;
    // Keys 1–4: index 0 default (∞), 1–3 field loadout (×ammo)
    for (let slot = 0; slot < player.weapons.length; slot++) {
      const wid = player.weapons[slot]!;
      const ww = getWeapon(wid);
      const keyN = slot + 1;
      const isDefault = slot === 0;
      const am = player.ammo[wid];
      const empty = !isDefault && (am ?? 0) <= 0;
      const active = slot === player.weaponIndex && !empty;
      const boxW = isDefault ? 56 : 52;
      ctx.globalAlpha = empty ? 0.45 : 1;
      ctx.fillStyle = active
        ? ww.color
        : empty
          ? "#0f172a"
          : isDefault
            ? "#1e293b"
            : "#1e293b";
      ctx.strokeStyle = active
        ? "#f8fafc"
        : empty
          ? "#1e293b"
          : isDefault
            ? "#475569"
            : "#334155";
      ctx.lineWidth = 2;
      ctx.fillRect(sx, h - 58, boxW, 40);
      ctx.strokeRect(sx, h - 58, boxW, 40);
      ctx.fillStyle = active ? "#0f172a" : empty ? "#64748b" : "#cbd5e1";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(keyN), sx + boxW / 2, h - 44);
      ctx.font = "8px sans-serif";
      ctx.fillText(ww.name.slice(0, 6), sx + boxW / 2, h - 32);
      ctx.font = "bold 9px monospace";
      ctx.fillText(
        isDefault ? "∞" : `×${Math.max(0, am ?? 0)}`,
        sx + boxW / 2,
        h - 20,
      );
      ctx.globalAlpha = 1;
      sx += boxW + 4;
    }
    ctx.textAlign = "right";
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 14px monospace";
    ctx.fillText(`GOAL ${state.killLimit}`, w - 16, h - 32);
  }

  if (state.messageT > 0 && state.message) {
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    const tw = Math.min(w - 40, 480);
    ctx.fillRect(w / 2 - tw / 2, h * 0.18, tw, 40);
    ctx.strokeStyle = "rgba(251,191,36,0.5)";
    ctx.strokeRect(w / 2 - tw / 2, h * 0.18, tw, 40);
    ctx.fillStyle = "#fde68a";
    ctx.font = "600 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.message, w / 2, h * 0.18 + 26);
  }

  if (state.phase === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, w, h);
  }
  if (state.phase === "over") {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 32px ui-sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.message || "MATCH OVER", w / 2, h / 2 - 10);
    ctx.fillStyle = "#cbd5e1";
    ctx.font = "14px ui-sans-serif";
    ctx.fillText("R 재시작 · Q / Esc 메뉴로 종료", w / 2, h / 2 + 24);
  }

  void style;
}
