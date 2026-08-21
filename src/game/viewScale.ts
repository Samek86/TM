/**
 * Screen-space craft size & camera FOV — independent of map.cellSize.
 *
 * Large maps only expand the playable world; they must not shrink the
 * plane on screen. Zoom is fixed so craft always looks the same size.
 */

/** Reference world units per "visual tile" for craft + FOV. */
export const VIEW_REF_CELL = 30;

/**
 * Horizontal world span in view (smaller → closer camera → larger craft).
 * Classic ~24 ref tiles (pre quality-pass / pre hi-res craft experiments).
 */
export const VIEW_TILES_ACROSS = 24;

/** World width the camera tries to show (capped by map bounds in camera). */
export const VIEW_WORLD_WIDTH = VIEW_REF_CELL * VIEW_TILES_ACROSS;
/** Phone FOV vs desktop. 1 = same world span as PC so enemies stay in view. */
export const MOBILE_VIEW_WORLD_MULTIPLIER = 1;

/** Phone play matches desktop world span (HUD still uses phone insets). */
export function playWorldWidth(
  cssWidth: number,
  coarsePointer = false,
): number {
  const phoneLike = coarsePointer || cssWidth < 768;
  return VIEW_WORLD_WIDTH * (phoneLike ? MOBILE_VIEW_WORLD_MULTIPLIER : 1);
}

/**
 * Hitbox / draw radius in world units from vulture radiusTiles.
 * Uses VIEW_REF_CELL so map scale never changes on-screen craft size.
 */
export function craftWorldRadius(radiusTiles: number): number {
  return Math.max(8, radiusTiles * VIEW_REF_CELL);
}

/**
 * Global combat tempo: craft cruise + projectile speeds (bullets use planeSpd × ratio).
 * 0.7 ≈ 30% slower than the previous baseline.
 */
export const GAME_SPEED_SCALE = 0.7;

/** Cruise speed in world units/sec — map-independent for consistent feel. */
export function craftWorldSpeed(tilesPerSec: number): number {
  return tilesPerSec * VIEW_REF_CELL * GAME_SPEED_SCALE;
}
