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

const cornerCache = new WeakMap<MapDef, Float32Array>();

function isHighNotRamp(map: MapDef, cx: number, cy: number): boolean {
  return isHighCell(map, cx, cy) && !isRampCell(map, cx, cy);
}

function isLowNotRamp(map: MapDef, cx: number, cy: number): boolean {
  return !isHighCell(map, cx, cy) && !isRampCell(map, cx, cy);
}

/** Multi-source BFS distance to every cell matching `pred`. */
function distField(
  map: MapDef,
  pred: (cx: number, cy: number) => boolean,
): Int16Array {
  const cols = map.cols;
  const rows = map.rows;
  const n = cols * rows;
  const dist = new Int16Array(n);
  dist.fill(32767);
  const qx: number[] = [];
  const qy: number[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (!pred(cx, cy)) continue;
      const i = cy * cols + cx;
      dist[i] = 0;
      qx.push(cx);
      qy.push(cy);
    }
  }
  let head = 0;
  while (head < qx.length) {
    const x = qx[head]!;
    const y = qy[head]!;
    const d = dist[y * cols + x]!;
    head += 1;
    for (const dir of CARDINALS) {
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (!inGrid(map, nx, ny)) continue;
      const i = ny * cols + nx;
      if (dist[i]! <= d + 1) continue;
      dist[i] = d + 1;
      qx.push(nx);
      qy.push(ny);
    }
  }
  return dist;
}

function computeCornerHeights(map: MapDef): Float32Array {
  const cols = map.cols;
  const rows = map.rows;
  const H = cliffHeight(cellSizeOf(map));
  const dHigh = distField(map, (x, y) => isHighNotRamp(map, x, y));
  const dLow = distField(map, (x, y) => isLowNotRamp(map, x, y));
  const rampH = new Float32Array(cols * rows);
  for (let i = 0; i < rampH.length; i++) {
    if (!(map.ramps[i] ?? false)) {
      rampH[i] = (map.elevation[i] ?? 0) >= 0.5 ? H : 0;
      continue;
    }
    const dh = dHigh[i]!;
    const dl = dLow[i]!;
    if (dh >= 32767 && dl >= 32767) rampH[i] = H * 0.5;
    else if (dh >= 32767) rampH[i] = 0;
    else if (dl >= 32767) rampH[i] = H;
    else rampH[i] = (dl / (dl + dh)) * H;
  }

  const w = cols + 1;
  const field = new Float32Array(w * (rows + 1));
  for (let iy = 0; iy <= rows; iy++) {
    for (let ix = 0; ix <= cols; ix++) {
      let high = 0;
      let low = 0;
      let sum = 0;
      let n = 0;
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ] as const) {
        const cx = ix + dx;
        const cy = iy + dy;
        if (!inGrid(map, cx, cy)) {
          low += 1;
          n += 1;
          continue;
        }
        const i = cy * cols + cx;
        if (isRampCell(map, cx, cy)) {
          sum += rampH[i]!;
          n += 1;
        } else if (isHighCell(map, cx, cy)) {
          high += 1;
          sum += H;
          n += 1;
        } else {
          low += 1;
          n += 1;
        }
      }
      let h: number;
      if (high > 0 && low === 0) h = H;
      else if (low > 0 && high === 0) h = 0;
      else h = n > 0 ? sum / n : 0;
      field[iy * w + ix] = h;
    }
  }
  return field;
}

export function cornerHeightsOf(map: MapDef): Float32Array {
  let field = cornerCache.get(map);
  if (!field) {
    field = computeCornerHeights(map);
    cornerCache.set(map, field);
  }
  return field;
}

/** Shared grid-vertex height so adjacent ramps form one slope, not a herringbone. */
export function cornerHeight(map: MapDef, ix: number, iy: number): number {
  const field = cornerHeightsOf(map);
  const w = map.cols + 1;
  const x = ix < 0 ? 0 : ix > map.cols ? map.cols : ix;
  const y = iy < 0 ? 0 : iy > map.rows ? map.rows : iy;
  return field[y * w + x]!;
}

export function sampleTerrainY(map: MapDef, wx: number, wy: number): number {
  const cols = map.cols;
  const rows = map.rows;
  const H = cliffHeight(cellSizeOf(map));
  const cellW = map.width / cols;
  const cellH = map.height / rows;
  const fx = wx <= 0 ? 0 : wx >= map.width ? cols : wx / cellW;
  const fy = wy <= 0 ? 0 : wy >= map.height ? rows : wy / cellH;
  const cx = Math.min(cols - 1, Math.max(0, fx | 0));
  const cy = Math.min(rows - 1, Math.max(0, fy | 0));
  const i = cy * cols + cx;
  if (!(map.ramps[i] ?? false)) {
    return (map.elevation[i] ?? 0) >= 0.5 ? H : 0;
  }
  const lx = Math.min(1, Math.max(0, fx - cx));
  const ly = Math.min(1, Math.max(0, fy - cy));
  const y00 = cornerHeight(map, cx, cy);
  const y10 = cornerHeight(map, cx + 1, cy);
  const y01 = cornerHeight(map, cx, cy + 1);
  const y11 = cornerHeight(map, cx + 1, cy + 1);
  const y0 = y00 * (1 - lx) + y10 * lx;
  const y1 = y01 * (1 - lx) + y11 * lx;
  return y0 * (1 - ly) + y1 * ly;
}

/** Visual bank width — drop is sculpted inside the high cell, gameplay stays binary. */
export function bankWidthOf(map: MapDef): number {
  return cellSizeOf(map) * 0.62;
}

function distToLowNotRamp(map: MapDef, wx: number, wy: number): number {
  const cols = map.cols;
  const rows = map.rows;
  const cellW = map.width / cols;
  const cellH = map.height / rows;
  const cx = Math.min(cols - 1, Math.max(0, (wx / cellW) | 0));
  const cy = Math.min(rows - 1, Math.max(0, (wy / cellH) | 0));
  // The bank is narrower than one cell, so only touching cells can ever win.
  let minD = Infinity;
  for (let ny = cy - 1; ny <= cy + 1; ny++) {
    for (let nx = cx - 1; nx <= cx + 1; nx++) {
      if (!inGrid(map, nx, ny) || !isLowNotRamp(map, nx, ny)) continue;
      const rx0 = nx * cellW;
      const ry0 = ny * cellH;
      const rx1 = rx0 + cellW;
      const ry1 = ry0 + cellH;
      const qx = wx < rx0 ? rx0 : wx > rx1 ? rx1 : wx;
      const qy = wy < ry0 ? ry0 : wy > ry1 ? ry1 : wy;
      const d = Math.hypot(wx - qx, wy - qy);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

/**
 * Visual heightfield: ramps stay climbable slopes; high/low flats stay
 * plateaus; high→low without a ramp becomes a rounded earth bank.
 */
export function sculptedHeight(map: MapDef, wx: number, wy: number): number {
  const cols = map.cols;
  const rows = map.rows;
  const H = cliffHeight(cellSizeOf(map));
  const cellW = map.width / cols;
  const cellH = map.height / rows;
  const fx = wx <= 0 ? 0 : wx >= map.width ? cols - 1e-6 : wx / cellW;
  const fy = wy <= 0 ? 0 : wy >= map.height ? rows - 1e-6 : wy / cellH;
  const cx = Math.min(cols - 1, Math.max(0, fx | 0));
  const cy = Math.min(rows - 1, Math.max(0, fy | 0));

  if (isRampCell(map, cx, cy)) {
    return sampleTerrainY(map, wx, wy);
  }
  if (!isHighCell(map, cx, cy)) {
    return 0;
  }

  const bank = bankWidthOf(map);
  const d = distToLowNotRamp(map, wx, wy);
  if (d >= bank) return H;
  if (d <= 0) return 0;
  const t = d / bank;
  const s = t * t * (3 - 2 * t);
  let h = s * H;
  if (s > 0.12 && s < 0.88) {
    h +=
      Math.sin(wx * 0.073) * Math.sin(wy * 0.061) * 1.35 +
      Math.sin(wx * 0.19 + wy * 0.14) * 0.55;
    if (h < 0) h = 0;
    if (h > H) h = H;
  }
  return h;
}
