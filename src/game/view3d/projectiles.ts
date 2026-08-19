import * as THREE from "three";
import { getPlayer, type Bullet, type GameState } from "@/game/engine";
import { sculptedHeight } from "@/game/heightfield";
import { engineToThree } from "./coords";
import { cloneWeaponModel, type WeaponModelKit } from "./weaponModels";

export type LayerHandle = {
  mesh: THREE.Object3D;
  sync(state: GameState, camera?: THREE.Camera): void;
  dispose(): void;
};

const PICKUP_WORLD = 52;

function hover(b: Bullet, terrainY: number): number {
  if (b.ammo === "mine") return terrainY + 0.9;
  if (b.style === "storm" || b.style === "frost" || b.ammo === "cloud") {
    return terrainY + 4 + b.radius * 0.15;
  }
  return terrainY + 3.2;
}

function assignModel(
  slot: THREE.Group,
  model: THREE.Group | undefined,
  weaponId: number,
): void {
  if (slot.userData.weaponId === weaponId) return;
  slot.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material]) {
      material.dispose();
    }
  });
  slot.clear();
  if (model) slot.add(cloneWeaponModel(model));
  slot.userData.weaponId = weaponId;
}

export function createProjectileLayer(
  maxShots: number,
  models: WeaponModelKit | null = null,
): LayerHandle {
  const trailGeom = new THREE.CylinderGeometry(0.08, 0.28, 1, 6, 1, true);
  trailGeom.rotateZ(-Math.PI / 2);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const trails = new THREE.InstancedMesh(trailGeom, trailMat, maxShots);
  trails.count = 0;
  trails.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const prevX = new Float32Array(maxShots);
  const prevY = new Float32Array(maxShots);

  const group = new THREE.Group();
  const slots = Array.from({ length: maxShots }, (_, index) => {
    const slot = new THREE.Group();
    slot.name = `shot${index}`;
    slot.visible = false;
    group.add(slot);
    return slot;
  });
  group.add(trails);

  return {
    mesh: group,
    sync(state: GameState, _camera?: THREE.Camera) {
      const map = state.map;
      let shotN = 0;
      let tN = 0;
      for (let bi = 0; bi < state.bullets.length; bi++) {
        const b = state.bullets[bi]!;
        if (!b.alive) continue;
        if (shotN >= maxShots) continue;
        const h = hover(b, sculptedHeight(map, b.x, b.y));
        const pos = engineToThree(b.x, b.y, h);
        const slot = slots[shotN]!;
        assignModel(slot, models?.shots[b.weaponId], b.weaponId);
        slot.position.set(pos.x, pos.y, pos.z);
        slot.rotation.set(0, -b.angle, 0);
        slot.visible = slot.children.length > 0;
        shotN += 1;
        if (b.ammo !== "mine" && b.ammo !== "cloud" && tN < maxShots) {
          const px = prevX[bi] || b.x;
          const py = prevY[bi] || b.y;
          const dx = b.x - px;
          const dy = b.y - py;
          const len = Math.hypot(dx, dy);
          if (len > 0.8) {
            const mid = engineToThree((b.x + px) * 0.5, (b.y + py) * 0.5, h);
            dummy.position.set(mid.x, mid.y, mid.z);
            dummy.scale.set(
              Math.min(28, len * 1.15),
              b.radius * 0.45,
              b.radius * 0.45,
            );
            dummy.rotation.set(0, -Math.atan2(dy, dx), 0);
            dummy.updateMatrix();
            trails.setMatrixAt(tN, dummy.matrix);
            trails.setColorAt(tN, color.set(b.color));
            tN += 1;
          }
          prevX[bi] = b.x;
          prevY[bi] = b.y;
        }
      }
      for (let index = shotN; index < slots.length; index++)
        slots[index]!.visible = false;
      trails.count = tN;
      trails.instanceMatrix.needsUpdate = true;
      if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
    },
    dispose() {
      trailGeom.dispose();
      trailMat.dispose();
      for (const slot of slots) {
        slot.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]) {
            material.dispose();
          }
        });
      }
    },
  };
}

function makeLootRing(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.92, 40),
    new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = "lootRing";
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

export function createPickupLayer(
  maxPickups: number,
  models: WeaponModelKit | null = null,
): LayerHandle {
  const group = new THREE.Group();
  const slots: THREE.Group[] = [];
  for (let i = 0; i < maxPickups; i++) {
    const slot = new THREE.Group();
    slot.name = `pickup${i}`;
    slot.visible = false;
    slot.add(makeLootRing());
    group.add(slot);
    slots.push(slot);
  }

  return {
    mesh: group,
    sync(state: GameState) {
      const map = state.map;
      const player = getPlayer(state);
      for (let i = 0; i < maxPickups; i++) {
        const pk = state.pickups[i];
        const slot = slots[i]!;
        if (!pk?.alive) {
          slot.visible = false;
          continue;
        }
        const eligible = !!player && player.weapons.indexOf(pk.weaponId) >= 1;
        const h = sculptedHeight(map, pk.x, pk.y) + 7 + Math.sin(pk.bob) * 2;
        const pos = engineToThree(pk.x, pk.y, h);
        slot.position.set(pos.x, pos.y, pos.z);
        slot.visible = true;
        const ring = slot.getObjectByName("lootRing") as THREE.Mesh;
        const pulse = 1.05 + Math.sin(pk.bob * 2) * 0.12;
        ring.scale.setScalar(PICKUP_WORLD * 0.62 * pulse);
        ring.visible = eligible;
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        ringMat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(pk.bob * 2));
        const icon = slot.getObjectByName("icon") as THREE.Group | undefined;
        if (!icon || icon.userData.weaponId !== pk.weaponId) {
          if (icon) {
            icon.traverse((object) => {
              const mesh = object as THREE.Mesh;
              if (!mesh.isMesh) return;
              for (const material of Array.isArray(mesh.material)
                ? mesh.material
                : [mesh.material]) {
                material.dispose();
              }
            });
            slot.remove(icon);
          }
          const model = models?.bodies[pk.weaponId];
          if (model) {
            const next = cloneWeaponModel(model);
            next.name = "icon";
            next.userData.weaponId = pk.weaponId;
            slot.add(next);
          }
        }
        const current = slot.getObjectByName("icon") as THREE.Group | undefined;
        if (current) {
          current.visible = true;
          current.rotation.y = pk.bob * 1.2;
          current.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            const materials = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            for (const material of materials) {
              const standard = material as THREE.MeshStandardMaterial;
              if (!standard.isMeshStandardMaterial) continue;
              standard.transparent = !eligible;
              standard.opacity = eligible ? 1 : 0.42;
            }
          });
        }
      }
    },
    dispose() {
      for (const slot of slots) {
        slot.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          for (const material of Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material]) {
            material.dispose();
          }
        });
        const ring = slot.getObjectByName("lootRing") as THREE.Mesh | undefined;
        ring?.geometry.dispose();
        (ring?.material as THREE.Material | undefined)?.dispose();
      }
    },
  };
}
