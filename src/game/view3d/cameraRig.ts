import { engineToThree } from "./coords";

export const CAMERA_PITCH_RAD = Math.PI / 6;
export const MAX_SHAKE = 6;
export const MAX_DPR = 1.5;

export function computeOrthoHalfExtents(
  cssW: number,
  cssH: number,
  worldWidth: number,
): { halfW: number; halfH: number } {
  const halfW = worldWidth / 2;
  const halfH = halfW * (cssH / cssW);
  return { halfW, halfH };
}

export function shakeOffset(shake: number, time: number): { x: number; z: number } {
  const amp = Math.min(MAX_SHAKE, Math.max(0, shake));
  const x = Math.sin(time * 31.7) * amp;
  const z = Math.cos(time * 27.3) * amp;
  const mag = Math.hypot(x, z);
  if (mag <= amp || mag < 1e-12) return { x, z };
  const k = amp / mag;
  return { x: x * k, z: z * k };
}

export function followTarget(
  playerX: number,
  playerY: number,
  terrainY: number,
  shake: number,
  time: number,
): { x: number; y: number; z: number } {
  const pos = engineToThree(playerX, playerY, terrainY);
  const offset = shakeOffset(shake, time);
  return { x: pos.x + offset.x, y: pos.y, z: pos.z + offset.z };
}
