import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { sceneryHeight } from "./terrainMesh";
import {
  BOUNDARY_WALL_CELLS,
  boundaryMargin,
  boundaryRing,
  createMapBoundary,
} from "./boundary";

function miniMap(elev: number[]): MapDef {
  return {
    id: "t",
    name: "t",
    theme: "",
    description: "",
    originalFiles: [],
    width: 120,
    height: 120,
    cols: 4,
    rows: 4,
    elevation: elev,
    ramps: new Array(16).fill(false),
    ground: "#0",
    high: "#0",
    cliff: "#0",
    ramp: "#0",
    accent: "#0",
    cellSize: 30,
    features: [],
  };
}

const FLAT = miniMap(new Array(16).fill(0));

describe("boundary", () => {
  it("sits on the line where the engine stops the craft", () => {
    // engine inMapBounds: margin = max(4, cellSize * 0.2)
    expect(boundaryMargin(FLAT)).toBeCloseTo(6);
    const ring = boundaryRing(FLAT);
    expect(ring.length).toBeGreaterThan(16);
    for (const p of ring) {
      const onX = Math.abs(p.x - 6) < 1e-6 || Math.abs(p.x - 114) < 1e-6;
      const onZ = Math.abs(p.z - 6) < 1e-6 || Math.abs(p.z - 114) < 1e-6;
      expect(onX || onZ).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(6);
      expect(p.x).toBeLessThanOrEqual(114);
      expect(p.z).toBeGreaterThanOrEqual(6);
      expect(p.z).toBeLessThanOrEqual(114);
    }
    // Closed loop: the walk returns to where it started.
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    expect(first.x).toBeCloseTo(last.x);
    expect(first.z).toBeCloseTo(last.z);
  });

  it("raises a wall that stands on the terrain along the whole rim", () => {
    const boundary = createMapBoundary(FLAT, "jungle");
    const wall = boundary.group.getObjectByName("boundary-wall") as THREE.Mesh;
    expect(wall).toBeTruthy();
    const pos = wall.geometry.getAttribute("position") as THREE.BufferAttribute;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    const ground = sceneryHeight(FLAT, 6, 60);
    expect(minY).toBeLessThanOrEqual(ground);
    expect(maxY).toBeCloseTo(ground + 30 * BOUNDARY_WALL_CELLS, 0);
    boundary.dispose();
  });

  it("marks the rim on the ground and posts beacons around it", () => {
    const boundary = createMapBoundary(FLAT, "desert");
    const band = boundary.group.getObjectByName("boundary-band") as THREE.Mesh;
    const posts = boundary.group.getObjectByName(
      "boundary-posts",
    ) as THREE.InstancedMesh;
    expect(band).toBeTruthy();
    expect(posts.count).toBeGreaterThanOrEqual(4);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < posts.count; i++) {
      posts.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      const onX = Math.abs(p.x - 6) < 0.5 || Math.abs(p.x - 114) < 0.5;
      const onZ = Math.abs(p.z - 6) < 0.5 || Math.abs(p.z - 114) < 0.5;
      expect(onX || onZ).toBe(true);
    }
    boundary.dispose();
  });

  it("brightens as the craft closes on the rim", () => {
    const boundary = createMapBoundary(FLAT, "outpost");
    const wall = boundary.group.getObjectByName("boundary-wall") as THREE.Mesh;
    const mat = wall.material as THREE.ShaderMaterial;
    boundary.update(1.5, 60, 60);
    expect(mat.uniforms.uTime!.value).toBeCloseTo(1.5);
    expect(mat.uniforms.uFocus!.value.x).toBeCloseTo(60);
    expect(mat.uniforms.uFocus!.value.z).toBeCloseTo(60);
    boundary.dispose();
  });
});
