import { isRamp, worldToCell, type MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { cellSizeOf, cliffHeight, cornerHeight } from "@/game/heightfield";

export const BANK_CAP_DEG: Record<VultureId, number> = {
  born_armor: 18,
  killers_pot: 10,
  sorcerer: 28,
};

export const PITCH_BLEND = 0.1;
export const VISUAL_LENGTH_MUL = 2.2;

/** Visual heading lag. Shots keep using the raw pilot angle. */
export const YAW_SMOOTH_TIME = 0.06;
/** rad/s ceiling so a mouse flick sweeps instead of teleporting. */
export const YAW_MAX_TURN_RATE = 16;

const STILL_SPEED = 1e-3;
const TAU = Math.PI * 2;

export function targetBankRad(
  vx: number,
  vy: number,
  aimAngle: number,
  capDeg: number,
): number {
  const rightX = -Math.sin(aimAngle);
  const rightY = Math.cos(aimAngle);
  const lat = vx * rightX + vy * rightY;
  const speed = Math.hypot(vx, vy);
  const cruiseProxy = speed || 1;
  const denom = speed < 1 ? 200 : Math.max(cruiseProxy, 1);
  const t = Math.max(-1, Math.min(1, lat / denom));
  return t * ((capDeg * Math.PI) / 180);
}

export function targetPitchRad(
  map: MapDef,
  x: number,
  y: number,
  vx: number,
  vy: number,
): number {
  if (!isRamp(map, x, y)) return 0;
  const speed = Math.hypot(vx, vy);
  if (speed < STILL_SPEED) return 0;
  const { cx, cy } = worldToCell(map, x, y);
  const y00 = cornerHeight(map, cx, cy);
  const y10 = cornerHeight(map, cx + 1, cy);
  const y01 = cornerHeight(map, cx, cy + 1);
  const y11 = cornerHeight(map, cx + 1, cy + 1);
  const dhx = (y10 + y11 - y00 - y01) * 0.5;
  const dhy = (y01 + y11 - y00 - y10) * 0.5;
  const uphill = vx * dhx + vy * dhy;
  if (Math.abs(uphill) < STILL_SPEED) return 0;
  const cell = cellSizeOf(map);
  const rise = Math.hypot(dhx, dhy);
  const slope = Math.atan2(rise, cell);
  return Math.sign(uphill) * Math.min(slope, Math.atan2(cliffHeight(cell), cell));
}

export function blendAngle(
  current: number,
  target: number,
  dt: number,
  blendTime: number,
): number {
  const delta = target - current;
  if (blendTime <= 0) return target;
  const t = Math.min(1, Math.max(0, dt / blendTime));
  return current + delta * t;
}

/** Normalize to (-PI, PI]. */
export function wrapAngle(angle: number): number {
  const w = ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return w === -Math.PI ? Math.PI : w;
}

/**
 * Wrap-aware, frame-rate independent heading follow with a turn-rate ceiling.
 * The raw aim angle arrives in mouse-event sized jumps; easing it here keeps
 * the yaw sprite walking through frames instead of skipping several at once.
 */
export function smoothYaw(
  current: number,
  target: number,
  dt: number,
  blendTime = YAW_SMOOTH_TIME,
  maxRate = YAW_MAX_TURN_RATE,
): number {
  if (!(dt > 0)) return wrapAngle(current);
  if (blendTime <= 0) return wrapAngle(target);
  const delta = wrapAngle(target - current);
  const eased = delta * (1 - Math.exp(-dt / blendTime));
  const cap = maxRate * dt;
  const step = Math.max(-cap, Math.min(cap, eased));
  return wrapAngle(current + step);
}
