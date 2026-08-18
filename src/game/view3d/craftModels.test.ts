import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getVulture } from "@/data/vultures";
import { craftWorldRadius } from "@/game/viewScale";
import { CRAFT_MODEL_FIT, fitCraftModel } from "./craftModels";

/** Stand-in for a GLB scene: off-centre, arbitrary size, nose on +X. */
function slab(len: number, w: number, h: number, offset: THREE.Vector3) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, w));
  mesh.position.copy(offset);
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

function measure(group: THREE.Object3D) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  return {
    size: box.getSize(new THREE.Vector3()),
    center: box.getCenter(new THREE.Vector3()),
  };
}

describe("fitCraftModel", () => {
  it("scales any source size to the craft's visual length", () => {
    for (const id of ["born_armor", "killers_pot", "sorcerer"] as const) {
      const want =
        CRAFT_MODEL_FIT[id].lengthMul *
        craftWorldRadius(getVulture(id).radiusTiles);
      for (const len of [0.4, 3, 120]) {
        const fitted = fitCraftModel(
          slab(len, len * 0.6, len * 0.2, new THREE.Vector3()),
          id,
        );
        expect(measure(fitted).size.x).toBeCloseTo(want, 4);
      }
    }
  });

  it("recentres a model exported far from the origin", () => {
    const fitted = fitCraftModel(
      slab(2, 1, 0.5, new THREE.Vector3(37, -12, 8)),
      "born_armor",
    );
    const { center } = measure(fitted);
    expect(center.length()).toBeLessThan(1e-6);
  });

  it("turns a TRELLIS nose-on-+Z model to face +X", () => {
    const prev = CRAFT_MODEL_FIT.sorcerer.yaw;
    CRAFT_MODEL_FIT.sorcerer.yaw = 0;
    try {
      const raw = measure(
        fitCraftModel(slab(1, 4, 0.4, new THREE.Vector3()), "sorcerer"),
      ).size;
      expect(raw.z).toBeGreaterThan(raw.x);
    } finally {
      CRAFT_MODEL_FIT.sorcerer.yaw = prev;
    }

    const turned = measure(
      fitCraftModel(slab(1, 4, 0.4, new THREE.Vector3()), "sorcerer"),
    ).size;
    expect(turned.x).toBeGreaterThan(turned.z);
    expect(CRAFT_MODEL_FIT.sorcerer.yaw).toBeCloseTo(Math.PI / 2, 6);
  });

  it("hovers above the terrain rather than clipping into it", () => {
    const fitted = fitCraftModel(
      slab(2, 1, 0.5, new THREE.Vector3()),
      "killers_pot",
    );
    expect(Number(fitted.userData.hoverLift)).toBeGreaterThan(6);
  });
});
