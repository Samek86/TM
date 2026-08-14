export const ACCEL_TIME = 0.2;
export const DECEL_TIME = 0.12;

export function approachVelocity(
  vx: number,
  vy: number,
  wishX: number,
  wishY: number,
  cruise: number,
  dt: number,
): { vx: number; vy: number } {
  const wishLen = Math.hypot(wishX, wishY);
  const time = wishLen < 1e-6 ? DECEL_TIME : ACCEL_TIME;
  const maxDelta = (Math.max(cruise, 1e-6) / time) * dt;
  const dx = wishX - vx;
  const dy = wishY - vy;
  const dist = Math.hypot(dx, dy);
  if (dist <= maxDelta || dist < 1e-9) return { vx: wishX, vy: wishY };
  const k = maxDelta / dist;
  return { vx: vx + dx * k, vy: vy + dy * k };
}

export function tryStep(
  ox: number,
  oy: number,
  vx: number,
  vy: number,
  dt: number,
  canFly: (x0: number, y0: number, x1: number, y1: number) => boolean,
): { x: number; y: number; vx: number; vy: number; moved: boolean } {
  const nx = ox + vx * dt;
  const ny = oy + vy * dt;
  if (canFly(ox, oy, nx, ny)) {
    return { x: nx, y: ny, vx, vy, moved: true };
  }
  const x1 = ox + vx * dt;
  if (canFly(ox, oy, x1, oy)) {
    return { x: x1, y: oy, vx, vy: 0, moved: true };
  }
  const y1 = oy + vy * dt;
  if (canFly(ox, oy, ox, y1)) {
    return { x: ox, y: y1, vx: 0, vy, moved: true };
  }
  return { x: ox, y: oy, vx: 0, vy: 0, moved: false };
}
