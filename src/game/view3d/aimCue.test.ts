import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import type { GameState, Pilot } from "@/game/engine";
import { createAimCue } from "./aimCue";

function miniMap(): MapDef {
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
    elevation: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ramps: [false, false, false, false, false, false, false, false, false],
    ground: "#0",
    high: "#0",
    cliff: "#0",
    ramp: "#0",
    accent: "#0",
    cellSize: 30,
    features: [],
  };
}

function state(over: Partial<GameState> = {}): GameState {
  return {
    map: miniMap(),
    phase: "playing",
    time: 1.2,
    pointer: { x: 60, y: 45, active: true },
    pilots: [{ isPlayer: true, respawn: 0, x: 30, y: 30 } as Pilot],
    ...over,
  } as GameState;
}

describe("aimCue", () => {
  it("sits on the pointer so shots land where the reticle is", () => {
    const cue = createAimCue();
    const camera = new THREE.OrthographicCamera(-80, 80, 80, -80, 0.1, 4000);
    camera.position.set(45, 200, 245);
    cue.sync(state(), camera);
    expect(cue.group.visible).toBe(true);
    expect(cue.group.position.x).toBeCloseTo(60, 4);
    expect(cue.group.position.z).toBeCloseTo(45, 4);
    expect(cue.group.position.y).toBeGreaterThan(0);
    cue.dispose();
  });

  it("hides while the player is dead or the match is not live", () => {
    const cue = createAimCue();
    const camera = new THREE.OrthographicCamera(-80, 80, 80, -80, 0.1, 4000);
    cue.sync(state({ phase: "over" }), camera);
    expect(cue.group.visible).toBe(false);
    cue.sync(
      state({
        pilots: [{ isPlayer: true, respawn: 1.5, x: 30, y: 30 } as Pilot],
      }),
      camera,
    );
    expect(cue.group.visible).toBe(false);
    cue.dispose();
  });

  it("draws a neon core, not a dim Lambert mark", () => {
    const cue = createAimCue();
    const mats: THREE.Material[] = [];
    cue.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.push(...list);
    });
    expect(mats.length).toBeGreaterThan(0);
    expect(mats.every((m) => m instanceof THREE.MeshBasicMaterial)).toBe(true);
    expect(
      mats.some(
        (m) =>
          (m as THREE.MeshBasicMaterial).blending === THREE.AdditiveBlending,
      ),
    ).toBe(true);
    cue.dispose();
  });
});
