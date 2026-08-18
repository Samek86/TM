/** Virtual thumb-stick math. Screen Y-down matches the engine's Y-down. */

export const STICK_DEADZONE = 0.18;
/** World units from the craft to the aim point the right stick writes. */
export const AIM_LEAD = 160;

export type StickVec = { x: number; y: number };

export function stickFromPointer(
  originX: number,
  originY: number,
  pointerX: number,
  pointerY: number,
  radius: number,
): StickVec {
  const dx = pointerX - originX;
  const dy = pointerY - originY;
  const reach = Math.max(1, radius);
  const len = Math.hypot(dx, dy);
  if (len < reach * STICK_DEADZONE) return { x: 0, y: 0 };
  const mag = Math.min(1, len / reach);
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

export function aimPointFromStick(
  playerX: number,
  playerY: number,
  stick: StickVec,
  lead = AIM_LEAD,
): StickVec {
  const len = Math.hypot(stick.x, stick.y);
  if (len < 1e-6) return { x: playerX + lead, y: playerY };
  return {
    x: playerX + (stick.x / len) * lead,
    y: playerY + (stick.y / len) * lead,
  };
}
