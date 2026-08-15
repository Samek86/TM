import type { MapDef } from "@/data/maps";

export function cliffHeight(cellSize: number): number {
  return 1.55 * cellSize;
}

export function cellSizeOf(map: MapDef): number {
  return map.cellSize ?? 30;
}

type RampDir = { dx: number; dy: number };

/** Cardinals: E, W, N, S. N is −cy because engine +y is south. */
const CARDINALS: readonly RampDir[] = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
];

function inGrid(map: MapDef, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < map.cols && cy < map.rows;
}

function cellIndex(map: MapDef, cx: number, cy: number): number {
  return cy * map.cols + cx;
}

function isHighCell(map: MapDef, cx: number, cy: number): boolean {
  return (map.elevation[cellIndex(map, cx, cy)] ?? 0) >= 0.5;
}

function dominantAxis(dx: number, dy: number): RampDir {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { dx: dx === 0 ? 0 : dx > 0 ? 1 : -1, dy: 0 };
  }
  return { dx: 0, dy: dy === 0 ? 0 : dy > 0 ? 1 : -1 };
}

function isRampCell(map: MapDef, cx: number, cy: number): boolean {
  return map.ramps[cellIndex(map, cx, cy)] ?? false;
}

function isFlatLowCell(map: MapDef, cx: number, cy: number): boolean {
  return !isHighCell(map, cx, cy) && !isRampCell(map, cx, cy);
}

/** Cardinal BFS to the first cell matching `pred`. */
function floodNearest(
  map: MapDef,
  sx: number,
  sy: number,
  pred: (cx: number, cy: number) => boolean,
): { cx: number; cy: number } | null {
  if (pred(sx, sy)) return { cx: sx, cy: sy };
  const cols = map.cols;
  const rows = map.rows;
  const seen = new Uint8Array(cols * rows);
  const qx = [sx];
  const qy = [sy];
  seen[sy * cols + sx] = 1;
  let head = 0;
  while (head < qx.length) {
    const x = qx[head]!;
    const y = qy[head]!;
    head += 1;
    for (const d of CARDINALS) {
      const nx = x + d.dx;
      const ny = y + d.dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const i = ny * cols + nx;
      if (seen[i]) continue;
      seen[i] = 1;
      if (pred(nx, ny)) return { cx: nx, cy: ny };
      qx.push(nx);
      qy.push(ny);
    }
  }
  return null;
}

export function rampDirection(map: MapDef, cx: number, cy: number): RampDir {
  if (!inGrid(map, cx, cy) || !isRampCell(map, cx, cy)) {
    return { dx: 0, dy: 0 };
  }

  // Adjacent high wins — climb toward the plateau, never a sideways flat.
  for (const d of CARDINALS) {
    const nx = cx + d.dx;
    const ny = cy + d.dy;
    if (inGrid(map, nx, ny) && isHighCell(map, nx, ny)) return d;
  }

  const high = floodNearest(map, cx, cy, (x, y) => isHighCell(map, x, y));
  if (high) {
    const vx = high.cx - cx;
    const vy = high.cy - cy;
    if (vx !== 0 || vy !== 0) return dominantAxis(vx, vy);
  }

  for (const d of CARDINALS) {
    const nx = cx + d.dx;
    const ny = cy + d.dy;
    if (inGrid(map, nx, ny) && isFlatLowCell(map, nx, ny)) {
      return { dx: -d.dx, dy: -d.dy };
    }
  }
  return { dx: 0, dy: 0 };
}

export function sampleTerrainY(map: MapDef, wx: number, wy: number): number {
  const cols = map.cols;
  const rows = map.rows;
  const cx =
    wx <= 0 ? 0 : wx >= map.width ? cols - 1 : ((wx / map.width) * cols) | 0;
  const cy =
    wy <= 0 ? 0 : wy >= map.height ? rows - 1 : ((wy / map.height) * rows) | 0;
  const i = cy * cols + cx;
  const H = cliffHeight(cellSizeOf(map));
  if (!(map.ramps[i] ?? false)) {
    return (map.elevation[i] ?? 0) >= 0.5 ? H : 0;
  }

  const dir = rampDirection(map, cx, cy);
  if (dir.dx === 0 && dir.dy === 0) {
    return (map.elevation[i] ?? 0) >= 0.5 ? H : 0;
  }

  const cellW = map.width / cols;
  const cellH = map.height / rows;
  const localX = (wx - cx * cellW) / cellW;
  const localY = (wy - cy * cellH) / cellH;
  let t =
    dir.dx === 1
      ? localX
      : dir.dx === -1
        ? 1 - localX
        : dir.dy === 1
          ? localY
          : 1 - localY;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return t * H;
}
