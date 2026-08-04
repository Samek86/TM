/**
 * Shared camera math for render + mouse → world aim.
 * Must stay in sync with renderGame transforms.
 */
import type { GameState } from "./engine";
import { getPlayer } from "./engine";

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
  const cell = state.map.cellSize ?? 16;
  // Show ~40–48 original tiles across — closer to 640×480 era framing
  const targetWorldW = Math.min(state.map.width, cell * 42);
  const viewScale = Math.min(cssW / targetWorldW, cssH / targetWorldW) * 1.02;
  // Original is orthographic top-down (quarter-view was mild). Keep 1:1 so
  // MAP+TIL tiles are not stretched into a “modern” look.
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
