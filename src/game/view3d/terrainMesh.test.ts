import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { sculptedHeight } from "@/game/heightfield";
import {
  buildSceneryGeometry,
  buildTerrainGeometry,
  sceneryHeight,
} from "./terrainMesh";

function miniMap(elev: number[], ramps: boolean[]): MapDef {
  return {
    id: "t",
    name: "t",
    theme: "",
    description: "",
    originalFiles: [],
    width: 90,
    height: 90,
    cols: 3,
    rows: 3,
    elevation: elev,
    ramps,
    ground: "#0",
    high: "#0",
    cliff: "#0",
    ramp: "#0",
    accent: "#0",
    cellSize: 30,
    features: [],
  };
}

describe("terrainMesh", () => {
  it("includes vertices at 0 and at cliff height", () => {
    const map = miniMap(
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      [false, true, false, false, true, false, false, true, false],
    );
    const g = buildTerrainGeometry(map);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(minY).toBeCloseTo(0);
    expect(maxY).toBeCloseTo(46.5);
    expect(pos.count).toBeGreaterThan(8);
  });

  it("shares every grid vertex so the surface cannot crack", () => {
    const map = miniMap(
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      [false, true, false, false, true, false, false, true, false],
    );
    const g = buildTerrainGeometry(map);
    expect(g.getIndex()).not.toBeNull();
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const seen = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      seen.add(`${pos.getX(i).toFixed(3)}|${pos.getZ(i).toFixed(3)}`);
    }
    expect(seen.size).toBe(pos.count);
  });

  it("blends four layer weights that always sum to one", () => {
    const map = miniMap(
      [1, 1, 1, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const g = buildTerrainGeometry(map);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const splat = g.getAttribute("aSplat") as THREE.BufferAttribute;
    expect(splat.itemSize).toBe(4);
    expect(splat.count).toBe(pos.count);
    let bankCliff = 0;
    let valleyGround = 0;
    for (let i = 0; i < splat.count; i++) {
      const sum =
        splat.getX(i) + splat.getY(i) + splat.getZ(i) + splat.getW(i);
      expect(sum).toBeCloseTo(1);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      if (Math.abs(z - 25) < 0.01 && y > 4 && y < 40) {
        bankCliff = Math.max(bankCliff, splat.getZ(i));
      }
      if (z > 60) valleyGround = Math.max(valleyGround, splat.getX(i));
    }
    expect(bankCliff).toBeGreaterThan(0.6);
    expect(valleyGround).toBeCloseTo(1);
  });

  it("wraps the playfield in scenery that starts at the map border", () => {
    const map = miniMap(
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const g = buildSceneryGeometry(map);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    let minX = Infinity;
    let maxX = -Infinity;
    let insideCount = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      if (x > 0.01 && x < 89.99 && z > 0.01 && z < 89.99) insideCount += 1;
    }
    expect(minX).toBeLessThan(-500);
    expect(maxX).toBeGreaterThan(590);
    expect(insideCount).toBe(0);
    // Border heights come from the same field, so the two meshes line up.
    expect(sceneryHeight(map, 0, 45)).toBeCloseTo(sculptedHeight(map, 0, 45));
  });

  it("cliff banks reach the valley floor and inset the plateau rim", () => {
    const map = miniMap(
      [1, 1, 1, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const g = buildTerrainGeometry(map);
    const pos = g.getAttribute("position") as THREE.BufferAttribute;
    const atFoot: number[] = [];
    let crestZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const x = pos.getX(i);
      if (Math.abs(z - 30) < 0.01 && x >= 0 && x <= 90) {
        atFoot.push(y);
      }
      if (y > 40) crestZ = Math.max(crestZ, z);
    }
    expect(Math.min(...atFoot)).toBeCloseTo(0);
    expect(crestZ).toBeLessThan(30 - 2);
    expect(crestZ).toBeGreaterThan(10);
  });
});
