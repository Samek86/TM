/**
 * Shared camera math for render + mouse → world aim.
 * Must stay in sync with renderGame transforms.
 *
 * FOV is fixed in world units (see viewScale.ts) so craft size on screen
 * does not shrink when maps use a larger cellSize.
 */
import type { GameState } from "./engine";
import { getPlayer } from "./engine";
import { VIEW_WORLD_WIDTH } from "./viewScale";

export interface CameraView {
  camX: number;
  camY: number;
  viewScale: number;
  yScale: number;
  ox: number;
  oy: number;
}

export function getCameraView(
  state: GameState,
  cssW: number,
  cssH: number,
  shakeX = 0,
  shakeY = 0,
): CameraView {
  const player = getPlayer(state);
  const camX = player?.x ?? state.map.width / 2;
  const camY = player?.y ?? state.map.height / 2;
  // Fixed world window — not map.cellSize — so planes stay large & consistent
  const targetWorldW = Math.min(state.map.width, VIEW_WORLD_WIDTH);
  const viewScale = Math.min(cssW / targetWorldW, cssH / targetWorldW) * 1.02;
  // Orthographic 1:1 (no fake quarter-view stretch)
  const yScale = viewScale;
  const ox = cssW / 2 - camX * viewScale + shakeX;
  const oy = cssH / 2 - camY * yScale + shakeY;
  return { camX, camY, viewScale, yScale, ox, oy };
}

/** Convert canvas CSS pixel coords → world map coords. */
export function screenToWorld(
  state: GameState,
  cssX: number,
  cssY: number,
  cssW: number,
  cssH: number,
): { x: number; y: number } {
  const cam = getCameraView(state, cssW, cssH, 0, 0);
  return {
    x: (cssX - cam.ox) / cam.viewScale,
    y: (cssY - cam.oy) / cam.yScale,
  };
}
