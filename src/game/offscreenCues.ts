import { playWorldWidth } from "./viewScale";

export type OffscreenCuePilot = {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  respawn: number;
  isPlayer: boolean;
  accent: string;
};

export type OffscreenCue = {
  id: string;
  name: string;
  accent: string;
  left: number;
  top: number;
  angle: number;
};

export function offscreenCues(
  pilots: readonly OffscreenCuePilot[],
  viewportWidth: number,
  viewportHeight: number,
  mobile: boolean,
): OffscreenCue[] {
  const player = pilots.find((pilot) => pilot.isPlayer);
  if (!player || viewportWidth <= 0 || viewportHeight <= 0) return [];
  const worldWidth = playWorldWidth(viewportWidth, mobile);
  const halfW = worldWidth / 2;
  const halfH = halfW * (viewportHeight / viewportWidth);
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const sideInset = 10;
  const topInset = mobile ? 58 : 52;
  const bottomInset = mobile ? 176 : 42;
  const right = viewportWidth - sideInset;
  const bottom = viewportHeight - bottomInset;
  const cues: OffscreenCue[] = [];

  for (const pilot of pilots) {
    if (
      pilot.isPlayer ||
      pilot.hp <= 0 ||
      pilot.respawn > 0 ||
      cues.length >= 8
    ) {
      continue;
    }
    const dx = pilot.x - player.x;
    const dy = pilot.y - player.y;
    const distance = Math.hypot(dx, dy);
    const offscreen =
      Math.abs(dx) > halfW * 0.85 || Math.abs(dy) > halfH * 0.85;
    if (!offscreen || distance >= worldWidth * 5 || distance < 1e-4) {
      continue;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    const edgeX = nx >= 0 ? right - centerX : centerX - sideInset;
    const edgeY = ny >= 0 ? bottom - centerY : centerY - topInset;
    const travel = Math.min(
      Math.abs(nx) > 1e-5 ? Math.abs(edgeX / nx) : Infinity,
      Math.abs(ny) > 1e-5 ? Math.abs(edgeY / ny) : Infinity,
    );
    let left = centerX + nx * travel;
    let top = centerY + ny * travel;
    for (const other of cues) {
      if (Math.hypot(left - other.left, top - other.top) < 54) {
        left = Math.min(right, Math.max(sideInset, left - ny * 30));
        top = Math.min(bottom, Math.max(topInset, top + nx * 30));
      }
    }
    cues.push({
      id: pilot.id,
      name: pilot.name,
      accent: pilot.accent,
      left,
      top,
      angle: Math.atan2(ny, nx),
    });
  }
  return cues;
}
