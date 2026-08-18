/**
 * Optional 3D craft models.
 *
 * Drop a GLB at `public/assets/crafts/<vultureId>/model.glb` and that craft
 * renders as real geometry, so its heading is continuous instead of stepping
 * through the 16-direction sprite sheet. Crafts without a GLB keep using the
 * sprites, so the files can land one at a time.
 *
 * Export uncompressed GLB (no Draco / meshopt) — no decoder is bundled.
 * Orientation and size are fitted automatically; if a model comes in facing
 * the wrong way, nudge its entry in CRAFT_MODEL_FIT rather than re-exporting.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { VultureId } from "@/data/weapons";
import { getVulture } from "@/data/vultures";
import { craftWorldRadius } from "@/game/viewScale";
import { CRAFT_RENDER_MODE } from "./craftAssets";
import { PLAY_LOOK } from "./look";

export type CraftModelKit = Partial<Record<VultureId, THREE.Group>>;

export const CRAFT_IDS: readonly VultureId[] = [
  "born_armor",
  "killers_pot",
  "sorcerer",
];

export type ModelFit = {
  /** Pre-rotation applied so the nose ends up on +X, in radians (YXZ order). */
  yaw: number;
  pitch: number;
  roll: number;
  /** Visual length as a multiple of the craft's hitbox radius. */
  lengthMul: number;
};

const DEFAULT_FIT: ModelFit = {
  // TRELLIS / image-to-3D exports face +Z; the pose path yaws around +Y
  // so the nose has to sit on +X or the craft crabs sideways.
  yaw: Math.PI / 2,
  pitch: 0,
  roll: 0,
  // 60% of the first in-game pass (2.0). The baked meshes read larger
  // than the old block models at the same bounding length.
  lengthMul: 1.2,
};

export const CRAFT_MODEL_FIT: Record<VultureId, ModelFit> = {
  born_armor: { ...DEFAULT_FIT },
  killers_pot: { ...DEFAULT_FIT },
  sorcerer: { ...DEFAULT_FIT },
};

function dressMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      if (std?.isMeshStandardMaterial) std.envMapIntensity = PLAY_LOOK.metalEnv;
    }
  });
}

/**
 * Rotate the model so its nose points down +X, recentre it on its own bounding
 * box, then normalise it to one unit long before scaling the outer group to the
 * craft's visual length. Keeping the normalisation inside means the outer scale
 * equals the world length, so the shadow disc sizes the same way it does for
 * the procedural crafts.
 */
export function fitCraftModel(
  source: THREE.Object3D,
  id: VultureId,
): THREE.Group {
  const fit = CRAFT_MODEL_FIT[id];
  const group = new THREE.Group();
  const norm = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.order = "YXZ";
  pivot.rotation.set(fit.pitch, fit.yaw, fit.roll);
  pivot.add(source);
  norm.add(pivot);
  group.add(norm);

  norm.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(norm);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  pivot.position.set(-center.x, -center.y, -center.z);
  norm.scale.setScalar(1 / Math.max(size.x, 1e-6));

  const target = fit.lengthMul * craftWorldRadius(getVulture(id).radiusTiles);
  group.scale.setScalar(target);
  group.userData.hoverLift = target * 0.22 + 6;
  return group;
}

export async function loadCraftModels(
  ids: readonly VultureId[] = CRAFT_IDS,
): Promise<CraftModelKit> {
  const kit: CraftModelKit = {};
  if (CRAFT_RENDER_MODE !== "gltf") return kit;
  const loader = new GLTFLoader();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(`/assets/crafts/${id}/model.glb`);
        dressMaterials(gltf.scene);
        kit[id] = fitCraftModel(gltf.scene, id);
      } catch {
        // No model yet for this craft; the sprite sheet still covers it.
      }
    }),
  );
  return kit;
}

export function disposeCraftModels(kit: CraftModelKit): void {
  const seenGeom = new Set<THREE.BufferGeometry>();
  const seenMat = new Set<THREE.Material>();
  for (const root of Object.values(kit)) {
    root?.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry && !seenGeom.has(mesh.geometry)) {
        seenGeom.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const mat of mats) {
        if (!mat || seenMat.has(mat)) continue;
        seenMat.add(mat);
        mat.dispose();
      }
    });
  }
}
