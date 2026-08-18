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

  describe("art card", () => {
    const map = miniMap(
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      [false, false, false, false, false, false, false, false, false],
    );
    const deg = (d: number) => (d * Math.PI) / 180;

    function rig() {
      const frames = Array.from({ length: 16 }, () => new THREE.Texture());
      const g = createCraftGroup("born_armor", frames);
      const camera = new THREE.OrthographicCamera(-80, 80, 80, -80, 0.1, 4000);
      camera.position.set(45, 200, 245);
      const args = {
        x: 45,
        y: 45,
        vx: 0,
        vy: 0,
        vultureId: "born_armor" as const,
        map,
        stillness: 0,
        hoverPhase: 0,
        time: 0,
        camera,
      };
      const art = g.getObjectByName("art") as THREE.Mesh;
      const settle = (angle: number) => {
        for (let i = 0; i < 60; i++) {
          applyCraftPose(g, { ...args, angle, dt: 0.05 });
        }
      };
      return {
        g,
        frames,
        settle,
        step: (angle: number, dt = 1 / 60) =>
          applyCraftPose(g, { ...args, angle, dt }),
        shown: () => (art.material as THREE.MeshBasicMaterial).map,
      };
    }

    it("eases the visual heading instead of snapping to the aim angle", () => {
      const { settle, step, g } = rig();
      settle(0);
      step(deg(90));
      const yaw = g.userData.yaw as number;
      expect(yaw).toBeGreaterThan(0);
      expect(yaw).toBeLessThan(deg(90));
    });

    it("picks the frame nearest the settled heading", () => {
      const { settle, shown, frames } = rig();
      settle(deg(8));
      expect(shown()).toBe(frames[0]);
      settle(deg(22.5));
      expect(shown()).toBe(frames[1]);
      settle(deg(90));
      expect(shown()).toBe(frames[4]);
      settle(deg(-22.5));
      expect(shown()).toBe(frames[15]);
    });

    it("sweeps through neighbouring frames instead of jumping on a flick", () => {
      const { step, shown, frames } = rig();
      const indexOf = () => frames.indexOf(shown() as THREE.Texture);
      step(0);
      let prev = indexOf();
      let moved = 0;
      for (let i = 0; i < 90; i++) {
        step(deg(180));
        const now = indexOf();
        const hop = Math.abs(now - prev);
        expect(Math.min(hop, frames.length - hop)).toBeLessThanOrEqual(1);
        if (now !== prev) moved++;
        prev = now;
      }
      expect(moved).toBeGreaterThan(4);
      expect(indexOf()).toBe(8);
    });
  });
});
