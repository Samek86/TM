import * as THREE from "three";
import { getPlayer, type Bullet, type GameState } from "@/game/engine";
import { sculptedHeight } from "@/game/heightfield";
import { engineToThree } from "./coords";
import type { OrdnanceArtKit } from "./ordnanceArt";

export type LayerHandle = {
  mesh: THREE.Object3D;
  sync(state: GameState, camera?: THREE.Camera): void;
  dispose(): void;
};

const PICKUP_WORLD = 52;
const SHOT_WORLD = 62;

function makeCard(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = name;
  mesh.visible = false;
  return mesh;
}

function setCard(
  mesh: THREE.Mesh,
  texture: THREE.Texture,
  world: number,
): void {
  const material = mesh.material as THREE.MeshBasicMaterial;
  if (material.map !== texture) {
    material.map = texture;
    material.needsUpdate = true;
  }
  const image = texture.image as
    { width?: number; height?: number } | undefined;
  const width = Math.max(1, Number(image?.width) || 1);
  const height = Math.max(1, Number(image?.height) || 1);
  const largest = Math.max(width, height);
  mesh.scale.set((world * width) / largest, (world * height) / largest, 1);
  mesh.visible = true;
}

/** Flat on the world plane: painted volume is visible from the play camera. */
function layFlat(mesh: THREE.Object3D, heading = 0): void {
  mesh.rotation.set(-Math.PI / 2, 0, -heading);
}

function hover(b: Bullet, terrainY: number): number {
  if (b.ammo === "mine") return terrainY + 0.9;
  if (b.style === "storm" || b.style === "frost" || b.ammo === "cloud") {
    return terrainY + 4 + b.radius * 0.15;
  }
  return terrainY + 3.2;
}

export function createProjectileLayer(
  maxShots: number,
  art: OrdnanceArtKit | null = null,
): LayerHandle {
  const group = new THREE.Group();
  const cards = Array.from({ length: maxShots }, (_, index) => {
    const card = makeCard(`shot${index}`);
    group.add(card);
    return card;
  });

  return {
    mesh: group,
    sync(state: GameState, _camera?: THREE.Camera) {
      const map = state.map;
      let shotN = 0;
      for (const card of cards) card.visible = false;
      for (let bi = 0; bi < state.bullets.length; bi++) {
        const b = state.bullets[bi]!;
        if (!b.alive) continue;
        if (shotN >= maxShots) continue;
        const texture = art?.shots[b.weaponId]?.[0];
        if (!texture) continue;
        const h = hover(b, sculptedHeight(map, b.x, b.y));
        const pos = engineToThree(b.x, b.y, h);
        const card = cards[shotN]!;
        card.position.set(pos.x, pos.y, pos.z);
        setCard(card, texture, SHOT_WORLD * Math.max(0.82, b.drawScale || 1));
        layFlat(card, b.angle);
        shotN += 1;
      }
    },
    dispose() {
      for (const card of cards) {
        card.geometry.dispose();
        (card.material as THREE.Material).dispose();
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
  art: OrdnanceArtKit | null = null,
): LayerHandle {
  const group = new THREE.Group();
  const slots: THREE.Group[] = [];
  for (let i = 0; i < maxPickups; i++) {
    const slot = new THREE.Group();
    slot.name = `pickup${i}`;
    slot.visible = false;
    slot.add(makeCard("icon"));
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
        const icon = slot.getObjectByName("icon") as THREE.Mesh;
        const texture = art?.bodies[pk.weaponId]?.[0];
        if (texture) {
          setCard(icon, texture, PICKUP_WORLD);
          layFlat(icon, pk.bob * 0.35);
          const material = icon.material as THREE.MeshBasicMaterial;
          material.opacity = eligible ? 1 : 0.42;
        } else {
          icon.visible = false;
        }
      }
    },
    dispose() {
      for (const slot of slots) {
        const icon = slot.getObjectByName("icon") as THREE.Mesh | undefined;
        icon?.geometry.dispose();
        (icon?.material as THREE.Material | undefined)?.dispose();
        const ring = slot.getObjectByName("lootRing") as THREE.Mesh | undefined;
        ring?.geometry.dispose();
        (ring?.material as THREE.Material | undefined)?.dispose();
      }
    },
  };
}
