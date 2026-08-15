import * as THREE from "three";
import type { GameState } from "@/game/engine";
import { sampleTerrainY } from "@/game/heightfield";
import { engineToThree } from "./coords";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function createParticleLayer(maxN = 280): {
  mesh: THREE.InstancedMesh;
  sync(state: GameState): void;
  dispose(): void;
} {
  const geom = new THREE.SphereGeometry(1, 8, 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.1,
    roughness: 0.45,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geom, mat, maxN);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.setColorAt(0, _color.setHex(0xffffff));

  return {
    mesh,
    sync(state) {
      const map = state.map;
      let live = 0;
      for (const p of state.particles) {
        if (!p.alive || live >= maxN) continue;
        const fade = Math.max(0.15, p.life / Math.max(0.001, p.maxLife));
        const h = sampleTerrainY(map, p.x, p.y) + 3.4;
        const pos = engineToThree(p.x, p.y, h);
        const s = Math.max(0.6, p.size * 0.12) * fade;
        _dummy.position.set(pos.x, pos.y, pos.z);
        _dummy.scale.setScalar(s);
        _dummy.updateMatrix();
        mesh.setMatrixAt(live, _dummy.matrix);
        _color.set(p.color);
        mesh.setColorAt(live, _color);
        live += 1;
      }
      _dummy.scale.setScalar(0);
      _dummy.position.set(0, -999, 0);
      _dummy.updateMatrix();
      for (let i = live; i < maxN; i++) mesh.setMatrixAt(i, _dummy.matrix);
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
