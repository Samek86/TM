import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { PLAY_LOOK } from "./look";

export type WeaponModelKit = {
  bodies: Partial<Record<number, THREE.Group>>;
  shots: Partial<Record<number, THREE.Group>>;
};

type WeaponAsset = {
  slug: string;
  bodyLength: number;
  shotLength: number;
};

const ASSET_BY_ID: Record<number, WeaponAsset> = {
  1: { slug: "vulcan", bodyLength: 28, shotLength: 8 },
  2: { slug: "ati-gun", bodyLength: 28, shotLength: 10 },
  3: { slug: "em-gun", bodyLength: 30, shotLength: 12 },
  4: { slug: "sorcerer-cannon", bodyLength: 27, shotLength: 9 },
  5: { slug: "vulcan", bodyLength: 28, shotLength: 8 },
  6: { slug: "energy", bodyLength: 27, shotLength: 12 },
  7: { slug: "energy", bodyLength: 29, shotLength: 13 },
  8: { slug: "energy", bodyLength: 32, shotLength: 14 },
  9: { slug: "vulcan", bodyLength: 28, shotLength: 8 },
  10: { slug: "fire-bomb", bodyLength: 22, shotLength: 10 },
  11: { slug: "fire-bomb", bodyLength: 26, shotLength: 16 },
  12: { slug: "stinger", bodyLength: 30, shotLength: 17 },
  13: { slug: "stinger", bodyLength: 30, shotLength: 15 },
  14: { slug: "tow", bodyLength: 31, shotLength: 18 },
  15: { slug: "tomahawk", bodyLength: 34, shotLength: 20 },
  16: { slug: "fire-bomb", bodyLength: 31, shotLength: 23 },
  17: { slug: "energy", bodyLength: 27, shotLength: 12 },
  18: { slug: "em-gun", bodyLength: 28, shotLength: 13 },
  19: { slug: "stinger", bodyLength: 30, shotLength: 15 },
  20: { slug: "em-gun", bodyLength: 28, shotLength: 14 },
  21: { slug: "vulcan", bodyLength: 28, shotLength: 8 },
};

function dressMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.isMeshStandardMaterial) {
        standard.envMapIntensity = PLAY_LOOK.metalEnv;
        standard.needsUpdate = true;
      }
    }
  });
}

/** Normalise authored GLBs so their illustrated nose points along local +X. */
export function fitWeaponModel(
  source: THREE.Object3D,
  targetLength: number,
): THREE.Group {
  const group = new THREE.Group();
  // Weapon exports are authored nose-on +X, matching projectile heading.
  group.add(source);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  source.position.sub(center);
  group.scale.setScalar(targetLength / Math.max(size.x, 1e-5));
  return group;
}

/** Each visible pickup can fade independently, so it needs its own materials. */
export function cloneWeaponModel(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  clone.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
  });
  return clone;
}

async function loadModel(
  loader: GLTFLoader,
  slug: string,
  file: "model.glb" | "shot.glb",
  length: number,
): Promise<THREE.Group | null> {
  try {
    const gltf = await loader.loadAsync(`/assets/weapons/${slug}/${file}`);
    dressMaterials(gltf.scene);
    return fitWeaponModel(gltf.scene, length);
  } catch {
    return null;
  }
}

export async function loadWeaponModels(): Promise<WeaponModelKit> {
  const loader = new GLTFLoader();
  const kit: WeaponModelKit = { bodies: {}, shots: {} };
  const unique = new Map(
    Object.entries(ASSET_BY_ID).map(([id, asset]) => [asset.slug, asset]),
  );
  const loaded = new Map<
    string,
    { body: THREE.Group | null; shot: THREE.Group | null }
  >();
  await Promise.all(
    [...unique.values()].map(async (asset) => {
      const [body, shot] = await Promise.all([
        loadModel(loader, asset.slug, "model.glb", 1),
        loadModel(loader, asset.slug, "shot.glb", 1),
      ]);
      loaded.set(asset.slug, { body, shot });
    }),
  );
  for (const [idString, asset] of Object.entries(ASSET_BY_ID)) {
    const source = loaded.get(asset.slug);
    if (source?.body)
      kit.bodies[Number(idString)] = fitWeaponModel(
        source.body.clone(true),
        asset.bodyLength,
      );
    if (source?.shot)
      kit.shots[Number(idString)] = fitWeaponModel(
        source.shot.clone(true),
        asset.shotLength,
      );
  }
  return kit;
}

export function disposeWeaponModels(kit: WeaponModelKit): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  for (const root of [
    ...Object.values(kit.bodies),
    ...Object.values(kit.shots),
  ]) {
    root?.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry && !geometries.has(mesh.geometry)) {
        geometries.add(mesh.geometry);
        mesh.geometry.dispose();
      }
      for (const material of Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material]) {
        if (!materials.has(material)) {
          materials.add(material);
          material.dispose();
        }
      }
    });
  }
}
