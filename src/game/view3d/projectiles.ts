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

function makeCard(name: string, size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: null,
      transparent: true,
      alphaTest: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = name;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.scale.setScalar(size);
  return mesh;
}

function setCard(
  mesh: THREE.Mesh,
  tex: THREE.Texture | undefined,
  show: boolean,
  world: number,
): void {
  const mat = mesh.material as THREE.MeshBasicMaterial;
  if (tex && mat.map !== tex) {
    mat.map = tex;
    mat.needsUpdate = true;
  }
  mesh.visible = show && !!tex;
  const img = tex?.image as { width?: number; height?: number } | undefined;
  const w = Math.max(1, Number(img?.width) || 1);
  const h = Math.max(1, Number(img?.height) || 1);
  const m = Math.max(w, h);
  mesh.scale.set((world * w) / m, (world * h) / m, 1);
}

/** Lie on the map plane. Heading 0 = east, same as engine angle. */
function layFlat(mesh: THREE.Object3D, heading = 0): void {
  mesh.rotation.set(-Math.PI / 2, 0, -heading);
}

type Family = "missile" | "bolt" | "cloud" | "bomb" | "mine";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _axisX = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

function familyOf(b: Bullet): Family {
  const s = b.style;
  if (s === "storm" || s === "frost" || b.ammo === "cloud") return "cloud";
  if (s === "lob") return "bomb";
  if (b.ammo === "mine") return "mine";
  if (
    s === "twin_beam" ||
    s === "pierce" ||
    s === "poke" ||
    s === "heavy" ||
    b.ammo === "beam" ||
    b.ammo === "energy"
  ) {
    return "bolt";
  }
  return "missile";
}

function hover(b: Bullet, terrainY: number): number {
  if (b.ammo === "mine") return terrainY + 0.9;
  if (familyOf(b) === "cloud") return terrainY + 4 + b.radius * 0.15;
  return terrainY + 3.2;
}

function makeInstanced(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  cap: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geom, mat, cap);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.setColorAt(0, _color.setHex(0xffffff));
  return mesh;
}

function writeInstance(
  mesh: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  angle: number,
  orient: boolean,
  color: string,
): void {
  _dummy.position.set(x, y, z);
  _dummy.scale.set(sx, sy, sz);
  if (orient) {
    _dir.set(Math.cos(angle), 0, Math.sin(angle));
    if (_dir.lengthSq() > 1e-8) {
      _dir.normalize();
      _dummy.quaternion.setFromUnitVectors(_axisX, _dir);
    } else {
      _dummy.quaternion.identity();
    }
  } else {
    _dummy.quaternion.identity();
  }
  _dummy.updateMatrix();
  mesh.setMatrixAt(i, _dummy.matrix);
  _color.set(color);
  mesh.setColorAt(i, _color);
}

function hideFrom(mesh: THREE.InstancedMesh, start: number, cap: number): void {
  _dummy.position.set(0, -999, 0);
  _dummy.scale.setScalar(0);
  _dummy.quaternion.identity();
  _dummy.updateMatrix();
  for (let i = start; i < cap; i++) mesh.setMatrixAt(i, _dummy.matrix);
  mesh.count = start;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function createProjectileLayer(
  maxShots: number,
  art: OrdnanceArtKit | null = null,
): LayerHandle {
  const missileGeom = new THREE.ConeGeometry(0.38, 1.55, 8, 1);
  missileGeom.rotateZ(-Math.PI / 2);
  const boltGeom = new THREE.CapsuleGeometry(0.16, 1.35, 4, 8);
  boltGeom.rotateZ(-Math.PI / 2);
  const cloudGeom = new THREE.SphereGeometry(1, 14, 10);
  const bombGeom = new THREE.SphereGeometry(1, 12, 8);
  const mineGeom = new THREE.CylinderGeometry(1, 1, 0.28, 12);

  const missileMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.55,
    roughness: 0.28,
    emissive: 0xffffff,
    emissiveIntensity: 0.28,
    envMapIntensity: 0.25,
  });
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.22,
    emissive: 0xffffff,
    emissiveIntensity: 0.5,
    envMapIntensity: 0.15,
  });
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.85,
    emissive: 0xffffff,
    emissiveIntensity: 0.28,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const bombMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.35,
    roughness: 0.4,
    emissive: 0xffffff,
    emissiveIntensity: 0.4,
  });
  const mineMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.5,
    roughness: 0.45,
    emissive: 0xffffff,
    emissiveIntensity: 0.25,
  });

  const missiles = makeInstanced(missileGeom, missileMat, maxShots);
  const bolts = makeInstanced(boltGeom, boltMat, maxShots);
  const clouds = makeInstanced(cloudGeom, cloudMat, maxShots);
  const bombs = makeInstanced(bombGeom, bombMat, maxShots);
  const mines = makeInstanced(mineGeom, mineMat, maxShots);

  const trailGeom = new THREE.CylinderGeometry(0.08, 0.28, 1, 6, 1, true);
  trailGeom.rotateZ(-Math.PI / 2);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const trails = makeInstanced(trailGeom, trailMat, maxShots);
  const prevX = new Float32Array(maxShots);
  const prevY = new Float32Array(maxShots);

  const group = new THREE.Group();
  const shotCards: THREE.Mesh[] = [];
  for (let i = 0; i < maxShots; i++) {
    const card = makeCard(`shot${i}`, SHOT_WORLD);
    shotCards.push(card);
    group.add(card);
  }
  group.add(missiles, bolts, clouds, bombs, mines, trails);

  return {
    mesh: group,
    sync(state: GameState, camera?: THREE.Camera) {
      const map = state.map;
      const n = { missile: 0, bolt: 0, cloud: 0, bomb: 0, mine: 0 };
      let tN = 0;
      let cardN = 0;
      for (const card of shotCards) card.visible = false;
      for (let bi = 0; bi < state.bullets.length; bi++) {
        const b = state.bullets[bi]!;
        if (!b.alive) continue;
        const fam = familyOf(b);
        if (n[fam] >= maxShots) continue;
        const h = hover(b, sculptedHeight(map, b.x, b.y));
        const pos = engineToThree(b.x, b.y, h);
        const s = Math.max(1.2, b.radius * (b.drawScale || 1));
        const shotFrames = art?.shots[b.weaponId];
        const useArt =
          !!shotFrames?.length &&
          fam !== "cloud" &&
          fam !== "mine" &&
          cardN < shotCards.length;
        if (useArt && shotFrames) {
          const card = shotCards[cardN]!;
          card.position.set(pos.x, pos.y, pos.z);
          setCard(
            card,
            shotFrames[0],
            true,
            SHOT_WORLD * Math.max(0.9, b.drawScale || 1),
          );
          layFlat(card, b.angle);
          cardN += 1;
        } else if (fam === "missile") {
          writeInstance(
            missiles,
            n.missile,
            pos.x,
            pos.y,
            pos.z,
            s * 2.4,
            s * 0.7,
            s * 0.7,
            b.angle,
            true,
            b.color,
          );
          n.missile += 1;
        } else if (fam === "bolt") {
          writeInstance(
            bolts,
            n.bolt,
            pos.x,
            pos.y,
            pos.z,
            s * 3.1,
            s * 0.55,
            s * 0.55,
            b.angle,
            true,
            b.color,
          );
          n.bolt += 1;
        } else if (fam === "cloud") {
          const r = Math.max(s, b.radius);
          writeInstance(
            clouds,
            n.cloud,
            pos.x,
            pos.y,
            pos.z,
            r,
            r,
            r,
            0,
            false,
            b.color,
          );
          n.cloud += 1;
        } else if (fam === "bomb") {
          writeInstance(
            bombs,
            n.bomb,
            pos.x,
            pos.y,
            pos.z,
            s * 1.15,
            s * 1.15,
            s * 1.15,
            0,
            false,
            b.color,
          );
          n.bomb += 1;
        } else {
          writeInstance(
            mines,
            n.mine,
            pos.x,
            pos.y,
            pos.z,
            s * 1.5,
            s,
            s * 1.5,
            0,
            false,
            b.color,
          );
          n.mine += 1;
        }
        if (fam !== "mine" && fam !== "cloud" && tN < maxShots) {
          const px = prevX[bi] || b.x;
          const py = prevY[bi] || b.y;
          const dx = b.x - px;
          const dy = b.y - py;
          const len = Math.hypot(dx, dy);
          if (len > 0.8) {
            const mid = engineToThree(
              (b.x + px) * 0.5,
              (b.y + py) * 0.5,
              h,
            );
            writeInstance(
              trails,
              tN,
              mid.x,
              mid.y,
              mid.z,
              Math.min(28, len * 1.15),
              s * 0.45,
              s * 0.45,
              Math.atan2(dy, dx),
              true,
              b.color,
            );
            tN += 1;
          }
          prevX[bi] = b.x;
          prevY[bi] = b.y;
        }
      }
      hideFrom(missiles, n.missile, maxShots);
      hideFrom(bolts, n.bolt, maxShots);
      hideFrom(clouds, n.cloud, maxShots);
      hideFrom(bombs, n.bomb, maxShots);
      hideFrom(mines, n.mine, maxShots);
      hideFrom(trails, tN, maxShots);
    },
    dispose() {
      missileGeom.dispose();
      boltGeom.dispose();
      cloudGeom.dispose();
      bombGeom.dispose();
      mineGeom.dispose();
      missileMat.dispose();
      boltMat.dispose();
      cloudMat.dispose();
      bombMat.dispose();
      mineMat.dispose();
      trailGeom.dispose();
      trailMat.dispose();
      for (const card of shotCards) {
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
  const fallbackGeom = new THREE.OctahedronGeometry(6, 0);
  const fallbackMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.35,
    roughness: 0.3,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.45,
  });
  const group = new THREE.Group();
  const slots: THREE.Group[] = [];
  const useArt = !!(art && Object.keys(art.bodies).length);
  for (let i = 0; i < maxPickups; i++) {
    const slot = new THREE.Group();
    slot.name = `pickup${i}`;
    slot.visible = false;
    const icon = useArt
      ? makeCard("icon", PICKUP_WORLD)
      : new THREE.Mesh(fallbackGeom, fallbackMat);
    if (!useArt) icon.name = "icon";
    slot.add(icon);
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
        const icon = slot.getObjectByName("icon") as THREE.Mesh;
        const ring = slot.getObjectByName("lootRing") as THREE.Mesh;
        const pulse = 1.05 + Math.sin(pk.bob * 2) * 0.12;
        ring.scale.setScalar(PICKUP_WORLD * 0.62 * pulse);
        ring.visible = eligible;
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        ringMat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(pk.bob * 2));
        if (useArt && art) {
          setCard(icon, art.bodies[pk.weaponId]?.[0], true, PICKUP_WORLD);
          layFlat(icon, pk.bob * 0.35);
        } else {
          icon.visible = true;
          icon.rotation.y = pk.bob * 1.2;
        }
        const iconMat = icon.material as THREE.MeshBasicMaterial;
        iconMat.transparent = true;
        iconMat.opacity = eligible ? 1 : 0.42;
      }
    },
    dispose() {
      fallbackGeom.dispose();
      fallbackMat.dispose();
      for (const slot of slots) {
        slot.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          if (mesh.geometry !== fallbackGeom) mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material;
          if (mat !== fallbackMat) mat.dispose();
        });
      }
    },
  };
}
