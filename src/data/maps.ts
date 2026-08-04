/**
 * Creative-phase map set — 3 polished strategic arenas.
 * StarCraft-style height: low / high plateaus; climb only via ramps; free descend.
 */

export interface MapDef {
  id: string;
  name: string;
  /** Short strategic pitch for UI */
  theme: string;
  /** Longer blurb */
  description: string;
  /** Optional original asset hints (til palette flavor) */
  originalFiles: string[];
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** 0 = low, 1 = high (binary plateaus) */
  elevation: number[];
  /** true = ramp cell (can climb low→high) */
  ramps: boolean[];
  ground: string;
  high: string;
  cliff: string;
  ramp: string;
  accent: string;
  fromOriginal?: boolean;
  cellSize?: number;
  heightMin?: number;
  heightMax?: number;
  waterLevel?: number;
  /** Suggested spawn band: low ground preferred */
  features: string[];
}

const CELL = 20;

type Grid = {
  cols: number;
  rows: number;
  elev: number[];
  ramps: boolean[];
};

function makeGrid(cols: number, rows: number): Grid {
  const n = cols * rows;
  return {
    cols,
    rows,
    elev: new Array(n).fill(0),
    ramps: new Array(n).fill(false),
  };
}

function idx(g: Grid, x: number, y: number): number {
  return y * g.cols + x;
}

function inG(g: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.cols && y < g.rows;
}

/** Fill axis-aligned rect with height level (0 or 1). */
function fillRect(
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  level: number,
): void {
  const xa = Math.max(0, Math.min(x0, x1));
  const xb = Math.min(g.cols - 1, Math.max(x0, x1));
  const ya = Math.max(0, Math.min(y0, y1));
  const yb = Math.min(g.rows - 1, Math.max(y0, y1));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      g.elev[idx(g, x, y)] = level;
    }
  }
}

/** Soft ellipse of high ground. */
function fillEllipse(
  g: Grid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  level: number,
): void {
  for (let y = 0; y < g.rows; y++) {
    for (let x = 0; x < g.cols; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) g.elev[idx(g, x, y)] = level;
    }
  }
}

/**
 * Paint a climb ramp: a short corridor where adjacent cells transition
 * low↔high. Marks both the path cells as ramps.
 */
function paintRamp(
  g: Grid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width = 2,
): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    for (let dy = -width; dy <= width; dy++) {
      for (let dx = -width; dx <= width; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (!inG(g, x, y)) continue;
        // Keep height: if endpoint is high zone nearby, blend — mark ramp only
        g.ramps[idx(g, x, y)] = true;
      }
    }
  }
  // Ensure ramp sits on the cliff edge: force a strip of mixed heights
  // Low side stays 0, high side 1 already from plateaus.
}

/** Auto-mark ramp cells that sit on low/high boundary (dilated). */
function sealCliffEdges(g: Grid): void {
  // Cliffs are implicit: any low next to high without ramp = unclimbable wall.
  // Expand existing ramp marks slightly for flyability.
  const next = g.ramps.slice();
  for (let y = 1; y < g.rows - 1; y++) {
    for (let x = 1; x < g.cols - 1; x++) {
      const i = idx(g, x, y);
      if (!g.ramps[i]) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const j = idx(g, x + dx, y + dy);
        next[j] = true;
      }
    }
  }
  g.ramps = next;
}

function toMapDef(
  partial: Omit<MapDef, "elevation" | "ramps" | "width" | "height" | "cols" | "rows"> & {
    grid: Grid;
  },
): MapDef {
  const { grid, ...rest } = partial;
  return {
    ...rest,
    cols: grid.cols,
    rows: grid.rows,
    width: grid.cols * CELL,
    height: grid.rows * CELL,
    elevation: grid.elev,
    ramps: grid.ramps,
    cellSize: CELL,
    waterLevel: 0.5,
    fromOriginal: false,
  };
}

// ─────────────────────────────────────────────────────────────
// MAP 1 — Jade Basin (jungle): ambush valleys, rim high ground
// ─────────────────────────────────────────────────────────────
function buildJadeBasin(): MapDef {
  const g = makeGrid(72, 56);
  // Outer high rim
  fillRect(g, 0, 0, g.cols - 1, g.rows - 1, 1);
  // Central low basin
  fillEllipse(g, 36, 28, 26, 20, 0);
  // Side pockets (hide / flank lows cutting into rim)
  fillEllipse(g, 12, 12, 7, 6, 0);
  fillEllipse(g, 60, 12, 7, 6, 0);
  fillEllipse(g, 12, 44, 7, 6, 0);
  fillEllipse(g, 60, 44, 7, 6, 0);
  // Interior high islands (control points)
  fillEllipse(g, 36, 28, 8, 6, 1);
  fillEllipse(g, 28, 18, 5, 4, 1);
  fillEllipse(g, 44, 38, 5, 4, 1);

  // Ramps: limited chokepoints onto rim & islands
  paintRamp(g, 36, 48, 36, 42, 2); // south entry to basin→rim
  paintRamp(g, 36, 8, 36, 14, 2); // north
  paintRamp(g, 10, 28, 18, 28, 2); // west
  paintRamp(g, 62, 28, 54, 28, 2); // east
  // Island ramps (only one side each — defendable)
  paintRamp(g, 36, 34, 36, 30, 1);
  paintRamp(g, 28, 22, 28, 18, 1);
  paintRamp(g, 44, 34, 44, 38, 1);
  // Pocket connections
  paintRamp(g, 12, 18, 18, 22, 1);
  paintRamp(g, 60, 18, 54, 22, 1);
  paintRamp(g, 12, 38, 18, 34, 1);
  paintRamp(g, 60, 38, 54, 34, 1);
  sealCliffEdges(g);

  return toMapDef({
    id: "jade_basin",
    name: "Jade Basin",
    theme: "정글 분지 · 매복 · 고지 링",
    description:
      "중앙 저지 분지를 높은 능선이 둘러싼다. 입구 오르막 4곳이 초크포인트. 분지 안 섬 고지는 소수 방어에 유리하고, 구석 포켓은 매복·재정비에 적합.",
    originalFiles: ["jungle.til"],
    ground: "#1a3d2e",
    high: "#2f6b4f",
    cliff: "#0f2419",
    ramp: "#c4a35a",
    accent: "#5eead4",
    features: ["링 고지", "중앙 섬 CP", "4초크 오르막", "코너 매복 포켓"],
    grid: g,
  });
}

// ─────────────────────────────────────────────────────────────
// MAP 2 — Scar Ridge (desert): diagonal spine, open sightlines
// ─────────────────────────────────────────────────────────────
function buildScarRidge(): MapDef {
  const g = makeGrid(80, 48);
  // All low flats
  fillRect(g, 0, 0, g.cols - 1, g.rows - 1, 0);
  // Diagonal high ridge (spine)
  for (let y = 0; y < g.rows; y++) {
    const cx = Math.floor(8 + (y / g.rows) * (g.cols - 16));
    fillRect(g, cx - 5, y, cx + 5, y, 1);
  }
  // Two mesa outposts
  fillEllipse(g, 18, 38, 8, 6, 1);
  fillEllipse(g, 62, 10, 8, 6, 1);
  // Broken ridge gap (mid fight zone on low)
  fillRect(g, 36, 20, 44, 28, 0);

  // Few ramps onto spine & mesas — power positions
  paintRamp(g, 20, 8, 20, 4, 2); // NW spine
  paintRamp(g, 58, 40, 58, 44, 2); // SE spine
  paintRamp(g, 34, 24, 38, 24, 2); // gap west
  paintRamp(g, 46, 24, 42, 24, 2); // gap east
  paintRamp(g, 18, 32, 18, 36, 2); // mesa SW
  paintRamp(g, 62, 16, 62, 12, 2); // mesa NE
  sealCliffEdges(g);

  return toMapDef({
    id: "scar_ridge",
    name: "Scar Ridge",
    theme: "사막 능선 · 시야 · 스나이프 고지",
    description:
      "대각선 고지 능선이 맵을 가른다. 저지는 넓고 노출되며, 능선·메사 고지가 화력 우위를 준다. 오르막이 적어 타이밍 점령이 핵심.",
    originalFiles: ["z-desert.til"],
    ground: "#c4a574",
    high: "#e8d4a8",
    cliff: "#6b5344",
    ramp: "#f0b429",
    accent: "#fbbf24",
    features: ["대각 스파인", "양 끝 메사", "중앙 갭", "소수 오르막"],
    grid: g,
  });
}

// ─────────────────────────────────────────────────────────────
// MAP 3 — Iron Ring (outpost): fortress high + lane chokes
// ─────────────────────────────────────────────────────────────
function buildIronRing(): MapDef {
  const g = makeGrid(64, 64);
  fillRect(g, 0, 0, g.cols - 1, g.rows - 1, 0);
  // Outer wall ring (high)
  fillRect(g, 6, 6, 57, 57, 1);
  fillRect(g, 12, 12, 51, 51, 0); // courtyard low
  // Corner bastions (high keeps)
  fillRect(g, 0, 0, 14, 14, 1);
  fillRect(g, 49, 0, 63, 14, 1);
  fillRect(g, 0, 49, 14, 63, 1);
  fillRect(g, 49, 49, 63, 63, 1);
  // Center keep
  fillEllipse(g, 32, 32, 7, 7, 1);
  // Cross corridors cut through ring (low lanes)
  fillRect(g, 28, 0, 35, 63, 0);
  fillRect(g, 0, 28, 63, 35, 0);
  // Restore center keep after cross cut
  fillEllipse(g, 32, 32, 7, 7, 1);
  // Side alcoves (hide)
  fillRect(g, 16, 18, 22, 24, 1);
  fillRect(g, 41, 18, 47, 24, 1);
  fillRect(g, 16, 39, 22, 45, 1);
  fillRect(g, 41, 39, 47, 45, 1);

  // Gate ramps — cardinal entries + keep
  paintRamp(g, 31, 10, 31, 14, 2); // N gate
  paintRamp(g, 31, 53, 31, 49, 2); // S
  paintRamp(g, 10, 31, 14, 31, 2); // W
  paintRamp(g, 53, 31, 49, 31, 2); // E
  paintRamp(g, 32, 39, 32, 35, 2); // keep S
  paintRamp(g, 32, 25, 32, 29, 1); // keep N (narrow)
  // Bastion access
  paintRamp(g, 12, 12, 16, 16, 2);
  paintRamp(g, 51, 12, 47, 16, 2);
  paintRamp(g, 12, 51, 16, 47, 2);
  paintRamp(g, 51, 51, 47, 47, 2);
  sealCliffEdges(g);

  return toMapDef({
    id: "iron_ring",
    name: "Iron Ring",
    theme: "요새 · 십자 레인 · 거점 쟁탈",
    description:
      "사각 요새 고지와 십자 저지 레인이 교차한다. 중앙 킵·사각 바스티온이 자리잡기 포인트. 게이트 오르막 쟁탈이 전황을 가른다.",
    originalFiles: ["VIL.TIL"],
    ground: "#3d4450",
    high: "#6b7280",
    cliff: "#1f2937",
    ramp: "#94a3b8",
    accent: "#38bdf8",
    features: ["중앙 킵", "4바스티온", "십자 레인", "게이트 초크"],
    grid: g,
  });
}

export const MAPS: MapDef[] = [
  buildJadeBasin(),
  buildScarRidge(),
  buildIronRing(),
];

export function getMap(id: string): MapDef {
  return MAPS.find((m) => m.id === id) ?? MAPS[0]!;
}

/** Flat cell index from world — zero allocation (hot path). */
export function worldToCellIndex(map: MapDef, wx: number, wy: number): number {
  const cols = map.cols;
  const rows = map.rows;
  const cx =
    wx <= 0 ? 0 : wx >= map.width ? cols - 1 : ((wx / map.width) * cols) | 0;
  const cy =
    wy <= 0 ? 0 : wy >= map.height ? rows - 1 : ((wy / map.height) * rows) | 0;
  return cy * cols + cx;
}

/** Fast cell indices from world (object form for rare callers). */
export function worldToCell(
  map: MapDef,
  wx: number,
  wy: number,
): { cx: number; cy: number } {
  const cols = map.cols;
  const i = worldToCellIndex(map, wx, wy);
  return { cx: i % cols, cy: (i / cols) | 0 };
}

export function sampleHeight(map: MapDef, wx: number, wy: number): number {
  return map.elevation[worldToCellIndex(map, wx, wy)] ?? 0;
}

export function sampleLevel(map: MapDef, wx: number, wy: number): 0 | 1 {
  return sampleHeight(map, wx, wy) >= 0.5 ? 1 : 0;
}

export function isRamp(map: MapDef, wx: number, wy: number): boolean {
  return map.ramps[worldToCellIndex(map, wx, wy)] ?? false;
}

/**
 * StarCraft-style: projectiles cannot climb cliffs (low→high without ramp).
 * Descending high→low is fine. Same level free.
 * Zero-alloc — critical for bullets + movement every frame.
 */
export function canTraverseHeight(
  map: MapDef,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  const cols = map.cols;
  const ia = worldToCellIndex(map, fromX, fromY);
  const ib = worldToCellIndex(map, toX, toY);
  if (ia === ib) return true;
  const elev = map.elevation;
  const fromL = elev[ia]! >= 0.5 ? 1 : 0;
  const toL = elev[ib]! >= 0.5 ? 1 : 0;
  if (fromL === toL || fromL > toL) return true;
  const ramps = map.ramps;
  if (ramps[ib] || ramps[ia]) return true;
  // Mid cell along the segment (handles diagonal climb)
  const acx = ia % cols;
  const acy = (ia / cols) | 0;
  const bcx = ib % cols;
  const bcy = (ib / cols) | 0;
  return !!ramps[(((acy + bcy) / 2) | 0) * cols + (((acx + bcx) / 2) | 0)];
}

/**
 * Bullet cliff check — single segment (frame step is small).
 * Extra mid sample only when crossing more than ~1 cell.
 */
export function canProjectilePath(
  map: MapDef,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  _steps = 1,
): boolean {
  if (!canTraverseHeight(map, x0, y0, x1, y1)) return false;
  const cell = map.cellSize ?? 20;
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (dx * dx + dy * dy > cell * cell) {
    return canTraverseHeight(map, x0, y0, x0 + dx * 0.5, y0 + dy * 0.5);
  }
  return true;
}

// Legacy stubs so old imports (mapDefFromOriginal*) don't break if referenced
export function mapDefFromOriginalFidelity(
  base: MapDef,
  _tm: unknown,
  _cellSize = 16,
): MapDef {
  return base;
}

export function mapDefFromOriginal(base: MapDef): MapDef {
  return base;
}
