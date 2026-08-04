import { sampleHeight } from "@/data/maps";
import { weaponById } from "./weaponLookup";
import type { Bullet, GameState, Pilot } from "./engine";
import { getPlayer } from "./engine";
import { angleToSprFrame, type GameAssets } from "./assets";
import { getCameraView } from "./camera";
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

function drawPickups(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  style: StylizedTerrain,
): void {
  const assets = getAssets(state);
  for (const pk of state.pickups) {
    if (!pk.alive) continue;
    const w = getWeapon(pk.weaponId);
    const yo = elevWorld(style, state, pk.x, pk.y) + Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y - yo);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const pulse = 0.55 + 0.45 * Math.sin(pk.bob * 2);
    ctx.strokeStyle = `rgba(251,191,36,${0.35 + pulse * 0.4})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();

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
    // Rebaked sheet: frame 0 = east, index = angle. No canvas.rotate → no skew.
    const fi = angleToSprFrame(p.angle, spr.frameCount);
    const frame = spr.frames[fi]!;
    const scale = Math.max(
      1.05,
      (p.radius * 2.55) / Math.max(frame.width, frame.height),
    );
    const dw = frame.width * scale;
    const dh = frame.height * scale;
    // Slight smooth for rebaked supersampled craft
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(frame, -dw / 2, -dh / 2, dw, dh);
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

/** Polished projectile art — always drawn along locked fire angle. */
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

  // ---- Stationary air mine (no rotate — floats in place) ----
  if (b.ammo === "mine") {
    const pulse = 0.85 + 0.15 * Math.sin(time * 6 + b.x * 0.05);
    const armT = b.maxLife > 0 ? Math.min(1, (b.maxLife - b.life) / 0.35) : 1;
    const r = b.radius * pulse;
    // Soft halo
    ctx.globalAlpha = 0.2 + 0.25 * armT;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Body
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, "#ecfccb");
    g.addColorStop(0.45, b.color);
    g.addColorStop(1, "#14532d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Spikes
    ctx.strokeStyle = "#052e16";
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + time * 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      ctx.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
      ctx.stroke();
    }
    // Armed blink
    if (armT >= 1) {
      ctx.fillStyle = Math.sin(time * 10) > 0 ? "#fef08a" : "#ef4444";
      ctx.beginPath();
      ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  // ---- Expanding storm cloud ----
  if (b.ammo === "cloud") {
    const R = Math.max(10, b.radius);
    const fade = Math.min(1, lifeT * 1.4);
    // Outer haze
    const haze = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
    haze.addColorStop(0, `rgba(255,255,255,${0.22 * fade})`);
    haze.addColorStop(0.35, hexToRgba(b.color, 0.38 * fade));
    haze.addColorStop(0.75, hexToRgba(b.color, 0.16 * fade));
    haze.addColorStop(1, hexToRgba(b.color, 0));
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();
    // Lobes (puffy cloud silhouette)
    ctx.globalAlpha = 0.45 * fade;
    ctx.fillStyle = b.color;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + time * 0.6;
      const d = R * (0.35 + 0.12 * Math.sin(time * 2 + i));
      const rr = R * (0.28 + 0.08 * Math.sin(time * 3 + i * 1.7));
      ctx.beginPath();
      ctx.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.arc(
      Math.sin(time * 1.4) * R * 0.12,
      Math.cos(time * 1.1) * R * 0.1,
      R * 0.22,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Danger ring
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(time * 5);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  ctx.rotate(ang);

  if (b.ammo === "missile") {
    const L = Math.max(14, b.radius * 5.2);
    const W = Math.max(3.2, b.radius * 1.15);
    // Exhaust plume
    const plume = ctx.createLinearGradient(-L * 0.9, 0, -L * 0.15, 0);
    plume.addColorStop(0, "rgba(251,146,60,0)");
    plume.addColorStop(0.45, `rgba(251,191,36,${0.35 * lifeT})`);
    plume.addColorStop(1, `rgba(254,243,199,${0.85 * lifeT})`);
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(-L * 0.15, 0);
    ctx.lineTo(-L * 0.95, W * 1.1);
    ctx.lineTo(-L * 0.95, -W * 1.1);
    ctx.closePath();
    ctx.fill();
    // Body
    const body = ctx.createLinearGradient(-L * 0.35, 0, L * 0.55, 0);
    body.addColorStop(0, "#1e293b");
    body.addColorStop(0.35, b.color);
    body.addColorStop(1, "#fff7ed");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(L * 0.55, 0);
    ctx.quadraticCurveTo(L * 0.2, -W, -L * 0.25, -W * 0.85);
    ctx.lineTo(-L * 0.35, -W * 0.55);
    ctx.lineTo(-L * 0.35, W * 0.55);
    ctx.lineTo(-L * 0.25, W * 0.85);
    ctx.quadraticCurveTo(L * 0.2, W, L * 0.55, 0);
    ctx.closePath();
    ctx.fill();
    // Nose tip
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(L * 0.55, 0);
    ctx.lineTo(L * 0.28, -W * 0.45);
    ctx.lineTo(L * 0.28, W * 0.45);
    ctx.closePath();
    ctx.fill();
    // Fins
    ctx.fillStyle = b.color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(-L * 0.12, -W * 0.7);
    ctx.lineTo(-L * 0.38, -W * 1.65);
    ctx.lineTo(-L * 0.22, -W * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-L * 0.12, W * 0.7);
    ctx.lineTo(-L * 0.38, W * 1.65);
    ctx.lineTo(-L * 0.22, W * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    // Center stripe
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-L * 0.2, 0);
    ctx.lineTo(L * 0.35, 0);
    ctx.stroke();
  } else if (b.ammo === "beam") {
    const L = 16 + b.radius * 4;
    const core = ctx.createLinearGradient(-L, 0, L, 0);
    core.addColorStop(0, "rgba(255,255,255,0)");
    core.addColorStop(0.35, b.color);
    core.addColorStop(0.5, "#ffffff");
    core.addColorStop(0.65, b.color);
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = core;
    ctx.lineWidth = Math.max(2, b.radius * 1.6);
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.35 + 0.55 * lifeT;
    ctx.beginPath();
    ctx.moveTo(-L, 0);
    ctx.lineTo(L, 0);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, b.radius * 0.7);
    ctx.strokeStyle = "#ffffff";
    ctx.globalAlpha = 0.85 * lifeT;
    ctx.beginPath();
    ctx.moveTo(-L * 0.7, 0);
    ctx.lineTo(L * 0.7, 0);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
  } else if (b.ammo === "explosive") {
    const r = b.radius * 1.5;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(0, 3, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, 0, 0, 0, r * 1.2);
    g.addColorStop(0, "#fef3c7");
    g.addColorStop(0.45, b.color);
    g.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Fuse spark
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.arc(r * 0.55, -r * 0.55, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Shell / energy bolt
    const L = Math.max(8, b.radius * 3.2);
    const W = Math.max(2, b.radius * 0.85);
    const g = ctx.createLinearGradient(-L, 0, L, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.35, b.color);
    g.addColorStop(0.7, "#ffffff");
    g.addColorStop(1, b.color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.55, W, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.ellipse(L * 0.1, 0, L * 0.22, W * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
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
      const r = p.size * (1.2 + (1 - t));
      ctx.globalAlpha = alpha * 0.35;
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

  // Top bar (right-aligned info only — left reserved for scoreboard)
  ctx.fillStyle = "rgba(8,12,20,0.72)";
  ctx.fillRect(0, 0, w, 44);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 13px ui-sans-serif, system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`TM  ·  ${state.map.name}`, 14, 28);
  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    "WASD · 마우스 조준/발사 · Esc 일시정지 · Q 종료",
    w - 14,
    28,
  );

  // Left scoreboard under top bar
  drawScoreboard(ctx, state, 52);

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
    let sx = 220;
    const weapons = player.weapons;
    for (let i = 0; i < weapons.length; i++) {
      const wid = weapons[i]!;
      const ww = getWeapon(wid);
      const active = i === player.weaponIndex;
      const am = player.ammo[wid];
      ctx.fillStyle = active ? ww.color : "#1e293b";
      ctx.strokeStyle = active ? "#f8fafc" : "#334155";
      ctx.lineWidth = 2;
      ctx.fillRect(sx, h - 58, 52, 40);
      ctx.strokeRect(sx, h - 58, 52, 40);
      ctx.fillStyle = active ? "#0f172a" : "#cbd5e1";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String((i + 1) % 10), sx + 26, h - 44);
      ctx.font = "8px sans-serif";
      ctx.fillText(ww.name.slice(0, 6), sx + 26, h - 32);
      ctx.font = "bold 9px monospace";
      ctx.fillText(am === -1 || am == null ? "∞" : `×${am}`, sx + 26, h - 20);
      sx += 56;
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
