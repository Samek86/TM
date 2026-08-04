/**
 * Modern polished strategic terrain renderer.
 * Clean plateaus, hard cliffs, clear ramps — SC-style readability.
 */
import type { MapDef } from "@/data/maps";
import type { TmMap, TmTil, TmLfx } from "@/lib/map";
import type { GameState } from "./engine";

export type BiomeId = "jungle" | "desert" | "outpost" | "default";

export interface BiomeTheme {
  id: BiomeId;
  fog: [number, number, number];
  accent: [number, number, number];
  trail: [number, number, number];
  waterLevel: number;
}

export function biomeForMapId(mapId: string): BiomeTheme {
  if (mapId.includes("scar") || mapId.includes("desert")) {
    return {
      id: "desert",
      fog: [40, 30, 20],
      accent: [251, 191, 36],
      trail: [240, 180, 41],
      waterLevel: 0.5,
    };
  }
  if (mapId.includes("iron") || mapId.includes("vil")) {
    return {
      id: "outpost",
      fog: [16, 18, 24],
      accent: [56, 189, 248],
      trail: [148, 163, 184],
      waterLevel: 0.5,
    };
  }
  if (mapId.includes("jade") || mapId.includes("jungle")) {
    return {
      id: "jungle",
      fog: [10, 22, 18],
      accent: [45, 212, 191],
      trail: [196, 163, 90],
      waterLevel: 0.5,
    };
  }
  return {
    id: "default",
    fog: [16, 22, 30],
    accent: [56, 189, 248],
    trail: [196, 163, 90],
    waterLevel: 0.5,
  };
}

export interface StylizedTerrain {
  theme: BiomeTheme;
  canvas: HTMLCanvasElement;
  worldW: number;
  worldH: number;
  cols: number;
  rows: number;
  cell: number;
  waterLevel: number;
  fromOriginalTiles: boolean;
  outTile: number;
  maxLift: number;
  heightScale: number;
  usedLfx: boolean;
}

export function worldElevLift(
  style: StylizedTerrain | null | undefined,
  map: MapDef,
  wx: number,
  wy: number,
): number {
  // Binary plateaus: strong visual step (same look, faster index math)
  const cols = map.cols;
  const rows = map.rows;
  const cx =
    wx <= 0 ? 0 : wx >= map.width ? cols - 1 : ((wx / map.width) * cols) | 0;
  const cy =
    wy <= 0 ? 0 : wy >= map.height ? rows - 1 : ((wy / map.height) * rows) | 0;
  const e = map.elevation[cy * cols + cx] ?? 0;
  const step = (map.cellSize ?? 20) * 0.55;
  return e >= 0.5 ? step : 0;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function noise2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Bake a clean modern strategic map from MapDef levels + ramps.
 * Does not depend on original TIL (optional args ignored for craft maps).
 */
export function buildStylizedTerrain(
  map: MapDef,
  mapId: string,
  _opts?: { tm?: TmMap; til?: TmTil | null; lfx?: TmLfx | null },
): StylizedTerrain {
  const theme = biomeForMapId(mapId);
  const cell = map.cellSize ?? 20;
  const worldW = map.width;
  const worldH = map.height;
  // High-res bake: ~12–16 px per cell
  const outTile = 14;
  const cliffH = 10; // visual cliff face height in bake px
  const bw = map.cols * outTile;
  const bh = map.rows * outTile + cliffH;

  const canvas = document.createElement("canvas");
  canvas.width = bw;
  canvas.height = bh;
  const ctx = canvas.getContext("2d");
  const empty: StylizedTerrain = {
    theme,
    canvas,
    worldW,
    worldH,
    cols: map.cols,
    rows: map.rows,
    cell,
    waterLevel: 0.5,
    fromOriginalTiles: false,
    outTile,
    maxLift: cliffH,
    heightScale: cliffH,
    usedLfx: false,
  };
  if (!ctx) return empty;

  const [gr, gg, gb] = hexToRgb(map.ground);
  const [hr, hg, hb] = hexToRgb(map.high);
  const [cr, cg, cb] = hexToRgb(map.cliff);
  const [rr, rg, rb] = hexToRgb(map.ramp);
  const [ar, ag, ab] = hexToRgb(map.accent);

  const img = ctx.createImageData(bw, bh);
  const data = img.data;
  // Clear to void
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 8;
    data[i + 1] = 10;
    data[i + 2] = 14;
    data[i + 3] = 255;
  }

  const elev = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return 0;
    return map.elevation[y * map.cols + x] ?? 0;
  };
  const rampAt = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false;
    return map.ramps[y * map.cols + x] ?? false;
  };

  // Draw north→south so southern cells cover cliff faces
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const level = elev(cx, cy);
      const isHigh = level >= 0.5;
      const isRamp = rampAt(cx, cy);
      const lift = isHigh ? cliffH : 0;
      const baseX = cx * outTile;
      const baseY = cy * outTile + cliffH - lift;

      // Micro variation (subtle, not muddy)
      const n = noise2(cx * 1.7, cy * 2.3) * 0.06;
      let r: number;
      let g: number;
      let b: number;
      if (isRamp) {
        r = rr * (0.92 + n);
        g = rg * (0.92 + n);
        b = rb * (0.92 + n);
      } else if (isHigh) {
        r = hr * (0.95 + n);
        g = hg * (0.95 + n);
        b = hb * (0.95 + n);
      } else {
        r = gr * (0.95 + n);
        g = gg * (0.95 + n);
        b = gb * (0.95 + n);
      }

      // Soft AO near cliffs
      const southLow = elev(cx, cy + 1) < 0.5 && isHigh;
      const northHigh = elev(cx, cy - 1) >= 0.5 && !isHigh;

      for (let py = 0; py < outTile; py++) {
        for (let px = 0; px < outTile; px++) {
          const dx = baseX + px;
          const dy = baseY + py;
          if (dx < 0 || dy < 0 || dx >= bw || dy >= bh) continue;
          let pr = r;
          let pg = g;
          let pb = b;
          // Edge bevel
          const edge =
            px === 0 || py === 0 || px === outTile - 1 || py === outTile - 1;
          if (edge) {
            pr *= 0.88;
            pg *= 0.88;
            pb *= 0.88;
          }
          // Top highlight on high ground
          if (isHigh && py < 2) {
            pr = Math.min(255, pr + 18);
            pg = Math.min(255, pg + 16);
            pb = Math.min(255, pb + 10);
          }
          // Ramp chevron stripe
          if (isRamp && (px + py + cx + cy) % 5 === 0) {
            pr = Math.min(255, pr * 0.5 + ar * 0.5);
            pg = Math.min(255, pg * 0.5 + ag * 0.5);
            pb = Math.min(255, pb * 0.5 + ab * 0.5);
          }
          if (southLow && py > outTile - 3) {
            pr *= 0.75;
            pg *= 0.75;
            pb *= 0.75;
          }
          if (northHigh && py < 2) {
            pr *= 0.85;
            pg *= 0.85;
            pb *= 0.85;
          }
          const o = (dy * bw + dx) * 4;
          data[o] = pr;
          data[o + 1] = pg;
          data[o + 2] = pb;
          data[o + 3] = 255;
        }
      }

      // Cliff face: high cell with low neighbor to the south
      if (isHigh && elev(cx, cy + 1) < 0.5 && !isRamp) {
        for (let fy = 0; fy < cliffH; fy++) {
          const dy = baseY + outTile + fy;
          if (dy >= bh) break;
          const shade = 0.45 + (fy / cliffH) * 0.35;
          for (let px = 0; px < outTile; px++) {
            const dx = baseX + px;
            const o = (dy * bw + dx) * 4;
            // Don't overwrite if already painted by lower cell later — paint cliff under
            data[o] = cr * shade;
            data[o + 1] = cg * shade;
            data[o + 2] = cb * shade;
            data[o + 3] = 255;
          }
        }
      }
      // East/west cliff hints
      if (isHigh && elev(cx + 1, cy) < 0.5 && !rampAt(cx + 1, cy)) {
        for (let py = 0; py < outTile; py++) {
          const dx = baseX + outTile - 1;
          const dy = baseY + py;
          if (dy < 0 || dy >= bh) continue;
          const o = (dy * bw + dx) * 4;
          data[o] = cr * 0.55;
          data[o + 1] = cg * 0.55;
          data[o + 2] = cb * 0.55;
        }
      }
    }
  }

  ctx.putImageData(img, 0, 0);

  // Crisp grid (very subtle) for modern tactical readability
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= map.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * outTile + 0.5, cliffH);
    ctx.lineTo(x * outTile + 0.5, bh);
    ctx.stroke();
  }
  for (let y = 0; y <= map.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, cliffH + y * outTile + 0.5);
    ctx.lineTo(bw, cliffH + y * outTile + 0.5);
    ctx.stroke();
  }

  // Outer frame
  ctx.strokeStyle = `rgba(${ar},${ag},${ab},0.35)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, cliffH + 1, bw - 2, map.rows * outTile - 2);

  return {
    theme,
    canvas,
    worldW,
    worldH,
    cols: map.cols,
    rows: map.rows,
    cell,
    waterLevel: 0.5,
    fromOriginalTiles: false,
    outTile,
    maxLift: cliffH,
    heightScale: cliffH,
    usedLfx: false,
  };
}

/**
 * Draw terrain. Optional view bounds (world) for source-rect culling —
 * same visual quality, less GPU fill outside the camera.
 */
export function drawStylizedTerrain(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  style: StylizedTerrain,
  _time: number,
  view?: { x: number; y: number; w: number; h: number },
): void {
  const map = state.map;
  const lift = style.maxLift > 0 ? style.cell * 0.55 : 0;

  ctx.fillStyle = "#05070c";
  if (view) {
    ctx.fillRect(view.x - 2, view.y - 2, view.w + 4, view.h + 4);
  } else {
    ctx.fillRect(-4, -4, map.width + 8, map.height + 8);
  }

  // High-quality scale once at bake; runtime uses linear (smoother than none, cheaper than 'high')
  ctx.imageSmoothingEnabled = true;
  // Avoid imageSmoothingQuality='high' every frame (very expensive on some GPUs)

  const cw = style.canvas.width;
  const ch = style.canvas.height;
  const destY = -lift;
  const destH = style.worldH + lift;

  if (view && style.worldW > 0 && destH > 0) {
    // Map world view → canvas source rect
    const pad = 40;
    const vx0 = view.x - pad;
    const vy0 = view.y - pad;
    const vx1 = view.x + view.w + pad;
    const vy1 = view.y + view.h + pad;
    const sx = (vx0 / style.worldW) * cw;
    const sy = ((vy0 - destY) / destH) * ch;
    const sw = ((vx1 - vx0) / style.worldW) * cw;
    const sh = ((vy1 - vy0) / destH) * ch;
    // Clamp source
    const csx = Math.max(0, sx);
    const csy = Math.max(0, sy);
    const csx2 = Math.min(cw, sx + sw);
    const csy2 = Math.min(ch, sy + sh);
    if (csx2 > csx && csy2 > csy) {
      const dx = (csx / cw) * style.worldW;
      const dy = destY + (csy / ch) * destH;
      const dw = ((csx2 - csx) / cw) * style.worldW;
      const dh = ((csy2 - csy) / ch) * destH;
      ctx.drawImage(
        style.canvas,
        csx,
        csy,
        csx2 - csx,
        csy2 - csy,
        dx,
        dy,
        dw,
        dh,
      );
    }
  } else {
    ctx.drawImage(style.canvas, 0, 0, cw, ch, 0, destY, style.worldW, destH);
  }
}
