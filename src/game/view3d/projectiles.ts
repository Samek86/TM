import * as THREE from "three";
import type { GameState } from "@/game/engine";
import { sampleTerrainY } from "@/game/heightfield";
import { engineToThree } from "./coords";

export type LayerHandle = {
  mesh: THREE.Object3D;
  sync(state: GameState): void;
  dispose(): void;
};

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function createProjectileLayer(maxShots: number): LayerHandle {
  const geom = new THREE.SphereGeometry(1, 8, 8);
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(geom, mat, maxShots);
  mesh.count = 0;
  mesh.frustumCulled = false;

  return {
    mesh,
    sync(state: GameState) {
      const map = state.map;
      let live = 0;
      for (const b of state.bullets) {
        if (!b.alive) continue;
        if (live >= maxShots) break;
        const pos = engineToThree(b.x, b.y, sampleTerrainY(map, b.x, b.y) + 3);
        const s = b.radius * (b.drawScale || 1);
        _dummy.position.set(pos.x, pos.y, pos.z);
        _dummy.scale.setScalar(s);
        _dummy.updateMatrix();
        mesh.setMatrixAt(live, _dummy.matrix);
        _color.set(b.color);
        mesh.setColorAt(live, _color);
        live += 1;
      }
      _dummy.position.set(0, 0, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = live; i < maxShots; i++) {
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.count = live;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      geom.dispose();
      mat.dispose();
    },
  };
}

export function createPickupLayer(maxPickups: number): LayerHandle {
  const geom = new THREE.OctahedronGeometry(2.4, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });
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
        const m = slots[i];
        if (!pk?.alive) {
          m.visible = false;
          continue;
        }
        const h = sampleTerrainY(map, pk.x, pk.y) + 4 + Math.sin(pk.bob) * 1.5;
        const pos = engineToThree(pk.x, pk.y, h);
        m.position.set(pos.x, pos.y, pos.z);
        m.visible = true;
      }
    },
    dispose() {
      geom.dispose();
      mat.dispose();
    },
  };
}
