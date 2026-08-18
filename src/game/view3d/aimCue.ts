/**
 * In-world neon reticle at the aim point. The 3D view has no 2D overlay
 * cursor, and the CSS crosshair disappears into the terrain — this is the
 * mark missiles actually fly toward.
 */
import * as THREE from "three";
import { getPlayer, type GameState } from "@/game/engine";
import { sculptedHeight } from "@/game/heightfield";
import { engineToThree } from "./coords";

const NEON = 0x3df0ff;
const NEON_HOT = 0xe8ffff;
const LIFT = 2.8;

function neonMat(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

function makeReticle(): THREE.Group {
  const g = new THREE.Group();
  g.name = "reticle";

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(7.2, 32),
    neonMat(NEON, 0.16),
  );
  glow.rotation.x = -Math.PI / 2;
  g.add(glow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(4.6, 5.15, 48),
    neonMat(NEON_HOT, 0.95),
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(1.15, 1.45, 28),
    neonMat(NEON, 0.85),
  );
  inner.rotation.x = -Math.PI / 2;
  g.add(inner);

  const tickGeom = new THREE.PlaneGeometry(2.4, 0.28);
  const tickMat = neonMat(NEON_HOT, 1);
  for (const yaw of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    const tick = new THREE.Mesh(tickGeom, tickMat);
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = yaw;
    tick.position.set(Math.cos(yaw) * 6.4, 0.02, Math.sin(yaw) * 6.4);
    g.add(tick);
  }

  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.85, 0),
    neonMat(NEON_HOT, 1),
  );
  diamond.position.y = 0.4;
  g.add(diamond);

  return g;
}

export function createAimCue(): {
  group: THREE.Group;
  sync(state: GameState, camera: THREE.Camera): void;
  dispose(): void;
} {
  const group = new THREE.Group();
  group.name = "aimCue";
  const reticle = makeReticle();
  group.add(reticle);

  const beamGeom = new THREE.BufferGeometry();
  const beamPos = new Float32Array(6);
  beamGeom.setAttribute("position", new THREE.BufferAttribute(beamPos, 3));
  const beam = new THREE.Line(
    beamGeom,
    new THREE.LineBasicMaterial({
      color: NEON,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  beam.frustumCulled = false;
  group.add(beam);

  const geoms = new Set<THREE.BufferGeometry>();
  const mats = new Set<THREE.Material>();
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geoms.add(mesh.geometry);
    const raw = (mesh as THREE.Mesh).material;
    if (!raw) return;
    for (const m of Array.isArray(raw) ? raw : [raw]) mats.add(m);
  });

  return {
    group,
    sync(state, _camera) {
      const player = getPlayer(state);
      if (!player || player.respawn > 0 || state.phase !== "playing") {
        group.visible = false;
        return;
      }
      group.visible = true;
      const { x, y } = state.pointer;
      const h = sculptedHeight(state.map, x, y);
      const aim = engineToThree(x, y, h + LIFT);
      group.position.set(aim.x, aim.y, aim.z);
      const pulse = 1 + 0.07 * Math.sin(state.time * 9);
      reticle.scale.setScalar(pulse);
      reticle.rotation.y = state.time * 0.7;

      const ph = sculptedHeight(state.map, player.x, player.y);
      const from = engineToThree(player.x, player.y, ph + 8);
      beamPos[0] = from.x - aim.x;
      beamPos[1] = from.y - aim.y;
      beamPos[2] = from.z - aim.z;
      beamPos[3] = 0;
      beamPos[4] = 0;
      beamPos[5] = 0;
      beamGeom.attributes.position.needsUpdate = true;
      beamGeom.computeBoundingSphere();
    },
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
