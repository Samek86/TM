import { isRamp, worldToCell, type MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { cellSizeOf, cliffHeight, rampDirection } from "@/game/heightfield";

export const BANK_CAP_DEG: Record<VultureId, number> = {
  born_armor: 18,
  killers_pot: 10,
  sorcerer: 28,
};

export const PITCH_BLEND = 0.1;
export const VISUAL_LENGTH_MUL = 2.2;

const STILL_SPEED = 1e-3;

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
  const dir = rampDirection(map, cx, cy);
  const uphill = vx * dir.dx + vy * dir.dy;
  if (Math.abs(uphill) < STILL_SPEED) return 0;
  const cell = cellSizeOf(map);
  const slope = Math.atan2(cliffHeight(cell), cell);
  return Math.sign(uphill) * slope;
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
