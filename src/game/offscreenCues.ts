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
  edge: boolean;
};

export type ProjectWorld = (
  engineX: number,
  engineY: number,
  height: number,
) => { x: number; y: number } | null;

export function offscreenCues(
  pilots: readonly OffscreenCuePilot[],
  viewportWidth: number,
  viewportHeight: number,
  mobile: boolean,
  project?: ProjectWorld,
  heightOf: (engineX: number, engineY: number) => number = () => 0,
): OffscreenCue[] {
  const player = pilots.find((pilot) => pilot.isPlayer);
  if (!player || viewportWidth <= 0 || viewportHeight <= 0) return [];
  const worldWidth = playWorldWidth(viewportWidth, mobile);
  const halfW = worldWidth / 2;
  const halfH = halfW * (viewportHeight / viewportWidth);
  const centerX = viewportWidth / 2;
  const centerY = viewportHeight / 2;
  const playerScreen = project?.(
    player.x,
    player.y,
    heightOf(player.x, player.y),
  ) ?? { x: centerX, y: centerY };
  const landscapePhone = mobile && viewportWidth > viewportHeight;
  const sideInset = 10;
  // Portrait reserves room for the score panel and bottom controls. In phone
  // landscape the controls sit along the bottom, so reserving the portrait
  // rail's 176px pushes all cues into the middle of the short viewport.
  const topInset = landscapePhone ? 10 : mobile ? 58 : 52;
  const bottomInset = landscapePhone ? 12 : mobile ? 176 : 42;
  const right = viewportWidth - sideInset;
  const bottom = viewportHeight - bottomInset;
  const cues: OffscreenCue[] = [];

  for (const pilot of pilots) {
    if (
      pilot.isPlayer ||
      pilot.hp <= 0 ||
      pilot.respawn > 0 ||
      cues.length >= 12
    ) {
      continue;
    }
    const dx = pilot.x - player.x;
    const dy = pilot.y - player.y;
    const distance = Math.hypot(dx, dy);
    const projected = project?.(pilot.x, pilot.y, heightOf(pilot.x, pilot.y));
    const screenX = projected?.x ?? centerX + (dx / halfW) * centerX;
    const screenY = projected?.y ?? centerY + (dy / halfH) * centerY;
    const offscreen =
      screenX < viewportWidth * 0.075 ||
      screenX > viewportWidth * 0.925 ||
      screenY < viewportHeight * 0.075 ||
      screenY > viewportHeight * 0.925;
    if (distance < 1e-4 || (offscreen && distance >= worldWidth * 5)) {
      continue;
    }
    const nx = dx / distance;
    const ny = dy / distance;
    let left: number;
    let top: number;
    if (offscreen) {
      const edgeX = nx >= 0 ? right - centerX : centerX - sideInset;
      const edgeY = ny >= 0 ? bottom - centerY : centerY - topInset;
      const travel = Math.min(
        Math.abs(nx) > 1e-5 ? Math.abs(edgeX / nx) : Infinity,
        Math.abs(ny) > 1e-5 ? Math.abs(edgeY / ny) : Infinity,
      );
      left = centerX + nx * travel;
      top = centerY + ny * travel;
    } else {
      left = screenX;
      top = screenY - 18;
    }
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
      angle: Math.atan2(screenY - playerScreen.y, screenX - playerScreen.x),
      edge: offscreen,
    });
  }
  return cues;
}
