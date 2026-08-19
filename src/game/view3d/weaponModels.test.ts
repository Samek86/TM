import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  cloneWeaponModel,
  fitWeaponModel,
  WEAPON_MODEL_ASSETS,
} from "./weaponModels";

function sourceModel(): THREE.Group {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(8, 2, 3),
    new THREE.MeshStandardMaterial({ color: 0x6f7e85, metalness: 0.8 }),
  );
  mesh.position.set(12, 3, -5);
  root.add(mesh);
  return root;
}

describe("weaponModels", () => {
  it("registers separate body and shot assets for all 21 weapons", () => {
    expect(Object.keys(WEAPON_MODEL_ASSETS)).toHaveLength(21);
    expect(
      new Set(Object.values(WEAPON_MODEL_ASSETS).map((asset) => asset.slug))
        .size,
    ).toBe(21);
  });

  it("recentres and scales an authored model to its target world length", () => {
    const fitted = fitWeaponModel(sourceModel(), 24);
    fitted.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(fitted);
    expect(box.getSize(new THREE.Vector3()).x).toBeCloseTo(24, 5);
    expect(box.getCenter(new THREE.Vector3()).length()).toBeLessThan(1e-6);
  });

  it("clones materials so pickup eligibility can fade independently", () => {
    const fitted = fitWeaponModel(sourceModel(), 24);
    const clone = cloneWeaponModel(fitted);
    const original = fitted.getObjectByProperty("isMesh", true) as THREE.Mesh;
    const copied = clone.getObjectByProperty("isMesh", true) as THREE.Mesh;
    expect(copied.geometry).toBe(original.geometry);
    expect(copied.material).not.toBe(original.material);
  });
});
