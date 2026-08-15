import * as THREE from "three";
import type { Bullet, GameState } from "@/game/engine";
import { sampleTerrainY } from "@/game/heightfield";
import { engineToThree } from "./coords";

export type LayerHandle = {
  mesh: THREE.Object3D;
  sync(state: GameState): void;
  dispose(): void;
};

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

export function createProjectileLayer(maxShots: number): LayerHandle {
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
    emissiveIntensity: 0.55,
    envMapIntensity: 0.8,
  });
  const boltMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.1,
    roughness: 0.22,
    emissive: 0xffffff,
    emissiveIntensity: 1.35,
    envMapIntensity: 0.4,
  });
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.85,
    emissive: 0xffffff,
    emissiveIntensity: 0.7,
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

  const group = new THREE.Group();
  group.add(missiles, bolts, clouds, bombs, mines);

  return {
    mesh: group,
    sync(state: GameState) {
      const map = state.map;
      const n = { missile: 0, bolt: 0, cloud: 0, bomb: 0, mine: 0 };
      for (const b of state.bullets) {
        if (!b.alive) continue;
        const fam = familyOf(b);
        if (n[fam] >= maxShots) continue;
        const h = hover(b, sampleTerrainY(map, b.x, b.y));
        const pos = engineToThree(b.x, b.y, h);
        const s = Math.max(1.2, b.radius * (b.drawScale || 1));
        if (fam === "missile") {
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
        }
        n[fam] += 1;
      }
      hideFrom(missiles, n.missile, maxShots);
      hideFrom(bolts, n.bolt, maxShots);
      hideFrom(clouds, n.cloud, maxShots);
      hideFrom(bombs, n.bomb, maxShots);
      hideFrom(mines, n.mine, maxShots);
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
    },
  };
}

export function createPickupLayer(maxPickups: number): LayerHandle {
  const geom = new THREE.OctahedronGeometry(2.6, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.35,
    roughness: 0.3,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.45,
  });
  const group = new THREE.Group();
  const slots: THREE.Mesh[] = [];
  for (let i = 0; i < maxPickups; i++) {
    const m = new THREE.Mesh(geom, mat);
    m.visible = false;
    group.add(m);
    slots.push(m);
  }

  return {
    mesh: group,
    sync(state: GameState) {
      const map = state.map;
      for (let i = 0; i < maxPickups; i++) {
        const pk = state.pickups[i];
        const m = slots[i]!;
        if (!pk?.alive) {
          m.visible = false;
          continue;
        }
        const h = sampleTerrainY(map, pk.x, pk.y) + 4 + Math.sin(pk.bob) * 1.5;
        const pos = engineToThree(pk.x, pk.y, h);
        m.position.set(pos.x, pos.y, pos.z);
        m.rotation.y = pk.bob * 1.2;
        m.visible = true;
      }
    },
    dispose() {
      geom.dispose();
      mat.dispose();
    },
  };
}
