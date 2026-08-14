import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { cellSizeOf, cliffHeight, rampDirection } from "@/game/heightfield";
import { engineToThree } from "./coords";

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return [0, 0, 0];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function inGrid(map: MapDef, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < map.cols && cy < map.rows;
}

function cellIndex(map: MapDef, cx: number, cy: number): number {
  return cy * map.cols + cx;
}

function isHighCell(map: MapDef, cx: number, cy: number): boolean {
  return (map.elevation[cellIndex(map, cx, cy)] ?? 0) >= 0.5;
}

function isRampCell(map: MapDef, cx: number, cy: number): boolean {
  return map.ramps[cellIndex(map, cx, cy)] ?? false;
}

/** Missing, or a non-ramp low cell — high plateaus drop a cliff here. */
function needsCliffWall(map: MapDef, nx: number, ny: number): boolean {
  if (!inGrid(map, nx, ny)) return true;
  return !isHighCell(map, nx, ny) && !isRampCell(map, nx, ny);
}

/** Ramp side neighbor is missing or a flat low cell. */
function sideNeighborLower(map: MapDef, nx: number, ny: number): boolean {
  if (!inGrid(map, nx, ny)) return true;
  if (isRampCell(map, nx, ny)) return false;
  return !isHighCell(map, nx, ny);
}

export function buildTerrainGeometry(map: MapDef): THREE.BufferGeometry {
  const cols = map.cols;
  const rows = map.rows;
  const H = cliffHeight(cellSizeOf(map));
  const positions: number[] = [];
  const colors: number[] = [];
  const ground = hexToRgb(map.ground);
  const highCol = hexToRgb(map.high);
  const cliffCol = hexToRgb(map.cliff);
  const rampCol = hexToRgb(map.ramp);

  function push(ex: number, ey: number, h: number, rgb: Rgb): void {
    const p = engineToThree(ex, ey, h);
    positions.push(p.x, p.y, p.z);
    colors.push(rgb[0], rgb[1], rgb[2]);
  }

  function addTri(
    ax: number,
    ay: number,
    ah: number,
    bx: number,
    by: number,
    bh: number,
    cx: number,
    cy: number,
    ch: number,
    rgb: Rgb,
  ): void {
    push(ax, ay, ah, rgb);
    push(bx, by, bh, rgb);
    push(cx, cy, ch, rgb);
  }

  /** Top quad. Corner heights: y00=(x0,z0), y10=(x1,z0), y11=(x1,z1), y01=(x0,z1). */
  function addTop(
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y00: number,
    y10: number,
    y11: number,
    y01: number,
    rgb: Rgb,
  ): void {
    addTri(x0, z0, y00, x0, z1, y01, x1, z1, y11, rgb);
    addTri(x0, z0, y00, x1, z1, y11, x1, z0, y10, rgb);
  }

  function addWallEast(
    x: number,
    z0: number,
    z1: number,
    top: number,
    bot: number,
    rgb: Rgb,
  ): void {
    addTri(x, z0, top, x, z1, top, x, z1, bot, rgb);
    addTri(x, z0, top, x, z1, bot, x, z0, bot, rgb);
  }

  function addWallWest(
    x: number,
    z0: number,
    z1: number,
    top: number,
    bot: number,
    rgb: Rgb,
  ): void {
    addTri(x, z0, top, x, z0, bot, x, z1, bot, rgb);
    addTri(x, z0, top, x, z1, bot, x, z1, top, rgb);
  }

  function addWallSouth(
    z: number,
    x0: number,
    x1: number,
    top: number,
    bot: number,
    rgb: Rgb,
  ): void {
    addTri(x0, z, top, x0, z, bot, x1, z, bot, rgb);
    addTri(x0, z, top, x1, z, bot, x1, z, top, rgb);
  }

  function addWallNorth(
    z: number,
    x0: number,
    x1: number,
    top: number,
    bot: number,
    rgb: Rgb,
  ): void {
    addTri(x0, z, top, x1, z, top, x1, z, bot, rgb);
    addTri(x0, z, top, x1, z, bot, x0, z, bot, rgb);
  }

  /** Vertical skirt on a sloped north edge (z fixed, heights yL at x0 / yR at x1). */
  function addSkirtNorth(
    z: number,
    x0: number,
    x1: number,
    yL: number,
    yR: number,
    rgb: Rgb,
  ): void {
    if (yL > 0 && yR > 0) {
      addTri(x0, z, yL, x1, z, yR, x1, z, 0, rgb);
      addTri(x0, z, yL, x1, z, 0, x0, z, 0, rgb);
    } else if (yL > 0) {
      addTri(x0, z, yL, x1, z, 0, x0, z, 0, rgb);
    } else if (yR > 0) {
      addTri(x0, z, 0, x1, z, yR, x1, z, 0, rgb);
    }
  }

  function addSkirtSouth(
    z: number,
    x0: number,
    x1: number,
    yL: number,
    yR: number,
    rgb: Rgb,
  ): void {
    if (yL > 0 && yR > 0) {
      addTri(x0, z, yL, x1, z, 0, x1, z, yR, rgb);
      addTri(x0, z, yL, x0, z, 0, x1, z, 0, rgb);
    } else if (yL > 0) {
      addTri(x0, z, yL, x0, z, 0, x1, z, 0, rgb);
    } else if (yR > 0) {
      addTri(x0, z, 0, x1, z, 0, x1, z, yR, rgb);
    }
  }

  function addSkirtEast(
    x: number,
    z0: number,
    z1: number,
    yN: number,
    yS: number,
    rgb: Rgb,
  ): void {
    if (yN > 0 && yS > 0) {
      addTri(x, z0, yN, x, z1, yS, x, z1, 0, rgb);
      addTri(x, z0, yN, x, z1, 0, x, z0, 0, rgb);
    } else if (yN > 0) {
      addTri(x, z0, yN, x, z1, 0, x, z0, 0, rgb);
    } else if (yS > 0) {
      addTri(x, z0, 0, x, z1, yS, x, z1, 0, rgb);
    }
  }

  function addSkirtWest(
    x: number,
    z0: number,
    z1: number,
    yN: number,
    yS: number,
    rgb: Rgb,
  ): void {
    if (yN > 0 && yS > 0) {
      addTri(x, z0, yN, x, z0, 0, x, z1, 0, rgb);
      addTri(x, z0, yN, x, z1, 0, x, z1, yS, rgb);
    } else if (yN > 0) {
      addTri(x, z0, yN, x, z0, 0, x, z1, 0, rgb);
    } else if (yS > 0) {
      addTri(x, z0, 0, x, z1, 0, x, z1, yS, rgb);
    }
  }

  function addHighWalls(
    cx: number,
    cy: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
  ): void {
    if (needsCliffWall(map, cx + 1, cy)) addWallEast(x1, z0, z1, H, 0, cliffCol);
    if (needsCliffWall(map, cx - 1, cy)) addWallWest(x0, z0, z1, H, 0, cliffCol);
    if (needsCliffWall(map, cx, cy + 1)) addWallSouth(z1, x0, x1, H, 0, cliffCol);
    if (needsCliffWall(map, cx, cy - 1)) addWallNorth(z0, x0, x1, H, 0, cliffCol);
  }

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x0 = (cx / cols) * map.width;
      const z0 = (cy / rows) * map.height;
      const x1 = ((cx + 1) / cols) * map.width;
      const z1 = ((cy + 1) / rows) * map.height;
      const ramp = isRampCell(map, cx, cy);
      const high = isHighCell(map, cx, cy);

      if (ramp) {
        const dir = rampDirection(map, cx, cy);
        if (dir.dx === 0 && dir.dy === 0) {
          const y = high ? H : 0;
          addTop(x0, z0, x1, z1, y, y, y, y, rampCol);
          if (high) addHighWalls(cx, cy, x0, z0, x1, z1);
          continue;
        }

        let y00 = 0;
        let y10 = 0;
        let y11 = 0;
        let y01 = 0;
        if (dir.dx === 1) {
          y10 = H;
          y11 = H;
        } else if (dir.dx === -1) {
          y00 = H;
          y01 = H;
        } else if (dir.dy === 1) {
          y01 = H;
          y11 = H;
        } else {
          y00 = H;
          y10 = H;
        }
        addTop(x0, z0, x1, z1, y00, y10, y11, y01, rampCol);

        if (dir.dx !== 0) {
          if (sideNeighborLower(map, cx, cy - 1)) {
            addSkirtNorth(z0, x0, x1, y00, y10, cliffCol);
          }
          if (sideNeighborLower(map, cx, cy + 1)) {
            addSkirtSouth(z1, x0, x1, y01, y11, cliffCol);
          }
        } else {
          if (sideNeighborLower(map, cx + 1, cy)) {
            addSkirtEast(x1, z0, z1, y10, y11, cliffCol);
          }
          if (sideNeighborLower(map, cx - 1, cy)) {
            addSkirtWest(x0, z0, z1, y00, y01, cliffCol);
          }
        }
        continue;
      }

      if (high) {
        addTop(x0, z0, x1, z1, H, H, H, H, highCol);
        addHighWalls(cx, cy, x0, z0, x1, z1);
      } else {
        addTop(x0, z0, x1, z1, 0, 0, 0, 0, ground);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createTerrainMesh(map: MapDef): THREE.Mesh {
  const geometry = buildTerrainGeometry(map);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  return new THREE.Mesh(geometry, material);
}
