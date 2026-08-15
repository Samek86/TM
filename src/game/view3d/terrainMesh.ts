import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { cellSizeOf, cliffHeight, rampDirection } from "@/game/heightfield";
import { engineToThree } from "./coords";
import {
  createTerrainMaterials,
  type TerrainKit,
} from "./terrainTextures";

const TILE = 110;
const LAYER_COUNT = 4;
const GROUND = 0;
const HIGH = 1;
const CLIFF = 2;
const RAMP = 3;

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

function needsCliffWall(map: MapDef, nx: number, ny: number): boolean {
  if (!inGrid(map, nx, ny)) return true;
  return !isHighCell(map, nx, ny) && !isRampCell(map, nx, ny);
}

function sideNeighborLower(map: MapDef, nx: number, ny: number): boolean {
  if (!inGrid(map, nx, ny)) return true;
  if (isRampCell(map, nx, ny)) return false;
  return !isHighCell(map, nx, ny);
}

type Face = "top" | "xwall" | "zwall";

export function buildTerrainGeometry(map: MapDef): THREE.BufferGeometry {
  const cols = map.cols;
  const rows = map.rows;
  const H = cliffHeight(cellSizeOf(map));
  const layers = Array.from({ length: LAYER_COUNT }, () => ({
    pos: [] as number[],
    uv: [] as number[],
    col: [] as number[],
  }));
  const LAYER_RGB: [number, number, number][] = [
    [0.55, 0.62, 0.42],
    [1.0, 0.96, 0.72],
    [0.42, 0.36, 0.32],
    [1.0, 0.82, 0.42],
  ];

  function push(
    layer: number,
    ex: number,
    ey: number,
    h: number,
    face: Face,
  ): void {
    const p = engineToThree(ex, ey, h);
    layers[layer]!.pos.push(p.x, p.y, p.z);
    const rgb = LAYER_RGB[layer] ?? [1, 1, 1];
    layers[layer]!.col.push(rgb[0], rgb[1], rgb[2]);
    if (face === "top") {
      layers[layer]!.uv.push(ex / TILE, ey / TILE);
    } else if (face === "xwall") {
      layers[layer]!.uv.push(ey / TILE, h / TILE);
    } else {
      layers[layer]!.uv.push(ex / TILE, h / TILE);
    }
  }

  function addTri(
    layer: number,
    face: Face,
    ax: number,
    ay: number,
    ah: number,
    bx: number,
    by: number,
    bh: number,
    cx: number,
    cy: number,
    ch: number,
  ): void {
    push(layer, ax, ay, ah, face);
    push(layer, bx, by, bh, face);
    push(layer, cx, cy, ch, face);
  }

  function addTop(
    layer: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    y00: number,
    y10: number,
    y11: number,
    y01: number,
  ): void {
    addTri(layer, "top", x0, z0, y00, x0, z1, y01, x1, z1, y11);
    addTri(layer, "top", x0, z0, y00, x1, z1, y11, x1, z0, y10);
  }

  function addWallEast(
    x: number,
    z0: number,
    z1: number,
    top: number,
    bot: number,
  ): void {
    addTri(CLIFF, "xwall", x, z0, top, x, z1, top, x, z1, bot);
    addTri(CLIFF, "xwall", x, z0, top, x, z1, bot, x, z0, bot);
  }

  function addWallWest(
    x: number,
    z0: number,
    z1: number,
    top: number,
    bot: number,
  ): void {
    addTri(CLIFF, "xwall", x, z0, top, x, z0, bot, x, z1, bot);
    addTri(CLIFF, "xwall", x, z0, top, x, z1, bot, x, z1, top);
  }

  function addWallSouth(
    z: number,
    x0: number,
    x1: number,
    top: number,
    bot: number,
  ): void {
    addTri(CLIFF, "zwall", x0, z, top, x0, z, bot, x1, z, bot);
    addTri(CLIFF, "zwall", x0, z, top, x1, z, bot, x1, z, top);
  }

  function addWallNorth(
    z: number,
    x0: number,
    x1: number,
    top: number,
    bot: number,
  ): void {
    addTri(CLIFF, "zwall", x0, z, top, x1, z, top, x1, z, bot);
    addTri(CLIFF, "zwall", x0, z, top, x1, z, bot, x0, z, bot);
  }

  function addSkirtNorth(
    z: number,
    x0: number,
    x1: number,
    yL: number,
    yR: number,
  ): void {
    if (yL > 0 && yR > 0) {
      addTri(CLIFF, "zwall", x0, z, yL, x1, z, yR, x1, z, 0);
      addTri(CLIFF, "zwall", x0, z, yL, x1, z, 0, x0, z, 0);
    } else if (yL > 0) {
      addTri(CLIFF, "zwall", x0, z, yL, x1, z, 0, x0, z, 0);
    } else if (yR > 0) {
      addTri(CLIFF, "zwall", x0, z, 0, x1, z, yR, x1, z, 0);
    }
  }

  function addSkirtSouth(
    z: number,
    x0: number,
    x1: number,
    yL: number,
    yR: number,
  ): void {
    if (yL > 0 && yR > 0) {
      addTri(CLIFF, "zwall", x0, z, yL, x1, z, 0, x1, z, yR);
      addTri(CLIFF, "zwall", x0, z, yL, x0, z, 0, x1, z, 0);
    } else if (yL > 0) {
      addTri(CLIFF, "zwall", x0, z, yL, x0, z, 0, x1, z, 0);
    } else if (yR > 0) {
      addTri(CLIFF, "zwall", x0, z, 0, x1, z, 0, x1, z, yR);
    }
  }

  function addSkirtEast(
    x: number,
    z0: number,
    z1: number,
    yN: number,
    yS: number,
  ): void {
    if (yN > 0 && yS > 0) {
      addTri(CLIFF, "xwall", x, z0, yN, x, z1, yS, x, z1, 0);
      addTri(CLIFF, "xwall", x, z0, yN, x, z1, 0, x, z0, 0);
    } else if (yN > 0) {
      addTri(CLIFF, "xwall", x, z0, yN, x, z1, 0, x, z0, 0);
    } else if (yS > 0) {
      addTri(CLIFF, "xwall", x, z0, 0, x, z1, yS, x, z1, 0);
    }
  }

  function addSkirtWest(
    x: number,
    z0: number,
    z1: number,
    yN: number,
    yS: number,
  ): void {
    if (yN > 0 && yS > 0) {
      addTri(CLIFF, "xwall", x, z0, yN, x, z0, 0, x, z1, 0);
      addTri(CLIFF, "xwall", x, z0, yN, x, z1, 0, x, z1, yS);
    } else if (yN > 0) {
      addTri(CLIFF, "xwall", x, z0, yN, x, z0, 0, x, z1, 0);
    } else if (yS > 0) {
      addTri(CLIFF, "xwall", x, z0, 0, x, z1, 0, x, z1, yS);
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
    if (needsCliffWall(map, cx + 1, cy)) addWallEast(x1, z0, z1, H, 0);
    if (needsCliffWall(map, cx - 1, cy)) addWallWest(x0, z0, z1, H, 0);
    if (needsCliffWall(map, cx, cy + 1)) addWallSouth(z1, x0, x1, H, 0);
    if (needsCliffWall(map, cx, cy - 1)) addWallNorth(z0, x0, x1, H, 0);
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
          addTop(RAMP, x0, z0, x1, z1, y, y, y, y);
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
        addTop(RAMP, x0, z0, x1, z1, y00, y10, y11, y01);

        if (dir.dx !== 0) {
          if (sideNeighborLower(map, cx, cy - 1)) {
            addSkirtNorth(z0, x0, x1, y00, y10);
          }
          if (sideNeighborLower(map, cx, cy + 1)) {
            addSkirtSouth(z1, x0, x1, y01, y11);
          }
        } else {
          if (sideNeighborLower(map, cx + 1, cy)) {
            addSkirtEast(x1, z0, z1, y10, y11);
          }
          if (sideNeighborLower(map, cx - 1, cy)) {
            addSkirtWest(x0, z0, z1, y00, y01);
          }
        }
        continue;
      }

      if (high) {
        addTop(HIGH, x0, z0, x1, z1, H, H, H, H);
        addHighWalls(cx, cy, x0, z0, x1, z1);
      } else {
        addTop(GROUND, x0, z0, x1, z1, 0, 0, 0, 0);
      }
    }
  }

  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const geometry = new THREE.BufferGeometry();
  let offset = 0;
  for (let i = 0; i < LAYER_COUNT; i++) {
    const layer = layers[i]!;
    const count = layer.pos.length / 3;
    positions.push(...layer.pos);
    uvs.push(...layer.uv);
    colors.push(...layer.col);
    geometry.addGroup(offset, count, i);
    offset += count;
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createTerrainMesh(
  map: MapDef,
  kit: TerrainKit | null = null,
): THREE.Mesh {
  const geometry = buildTerrainGeometry(map);
  const materials = createTerrainMaterials(kit);
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}
