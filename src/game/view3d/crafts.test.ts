import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { applyCraftPose, createCraftGroup } from "./crafts";

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

describe("crafts", () => {
  it("returns a Group for every vulture id", () => {
    for (const id of ["born_armor", "killers_pot", "sorcerer"] as const) {
      const g = createCraftGroup(id);
      expect(g.type).toBe("Group");
      expect(g.children.length).toBeGreaterThan(4);
    }
  });

  it("uses PBR hull and glass materials, not Lambert", () => {
    const g = createCraftGroup("born_armor");
    const types = new Set<string>();
    g.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.Material;
      types.add(mat.type);
    });
    expect(types.has("MeshLambertMaterial")).toBe(false);
    expect(
      types.has("MeshStandardMaterial") || types.has("MeshPhysicalMaterial"),
    ).toBe(true);
  });

  it("angle 0 keeps the group's +X aligned with world +X", () => {
    const map = miniMap(
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const g = createCraftGroup("born_armor");
    applyCraftPose(g, {
      x: 45,
      y: 45,
      vx: 0,
      vy: 0,
      angle: 0,
      vultureId: "born_armor",
      map,
      stillness: 0,
      hoverPhase: 0,
      time: 0,
      dt: 0.1,
    });
    g.updateMatrixWorld(true);
    const dir = new THREE.Vector3(1, 0, 0).transformDirection(g.matrixWorld);
    expect(dir.x).toBeCloseTo(1);
    expect(dir.y).toBeCloseTo(0);
    expect(dir.z).toBeCloseTo(0);
  });
});
