import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { getPlayer, type GameState } from "@/game/engine";
import { sampleTerrainY } from "@/game/heightfield";
import { VIEW_WORLD_WIDTH } from "@/game/viewScale";
import { pickAimOnHeightfield } from "./aimPick";
import {
  CAMERA_PITCH_RAD,
  MAX_DPR,
  computeOrthoHalfExtents,
  followTarget,
} from "./cameraRig";
import { applyCraftPose, createCraftGroup } from "./crafts";
import { createPickupLayer, createProjectileLayer } from "./projectiles";
import { createTerrainMesh } from "./terrainMesh";

export type PlayView = {
  resize(cssW: number, cssH: number, dpr: number): void;
  renderFrame(state: GameState, dt: number): void;
  pickAim(
    cssX: number,
    cssY: number,
    cssW: number,
    cssH: number,
  ): { x: number; y: number } | null;
  dispose(): void;
};

export function createPlayView(canvas: HTMLCanvasElement, map: MapDef): PlayView {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    throw new Error("WebGL을 시작할 수 없습니다");
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  const terrain = createTerrainMesh(map);
  scene.add(terrain);
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.85);
  sun.position.set(200, 320, 280);
  scene.add(sun);

  const crafts = new Map<string, THREE.Group>();
  const shots = createProjectileLayer(200);
  const picks = createPickupLayer(12);
  scene.add(shots.mesh);
  scene.add(picks.mesh);

  function ensureCraft(id: string, vultureId: VultureId): THREE.Group {
    let g = crafts.get(id);
    if (!g) {
      g = createCraftGroup(vultureId);
      crafts.set(id, g);
      scene.add(g);
    }
    return g;
  }

  return {
    resize(cssW, cssH, dpr) {
      const ratio = Math.min(dpr, MAX_DPR);
      renderer.setPixelRatio(ratio);
      renderer.setSize(cssW, cssH, false);
      const worldW = Math.min(map.width, VIEW_WORLD_WIDTH);
      const { halfW, halfH } = computeOrthoHalfExtents(cssW, cssH, worldW);
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    },
    renderFrame(state, dt) {
      const player = getPlayer(state);
      const px = player?.x ?? state.map.width / 2;
      const py = player?.y ?? state.map.height / 2;
      const pY = sampleTerrainY(state.map, px, py);
      const target = followTarget(px, py, pY, state.shake, state.time);
      const dist = 420;
      camera.position.set(
        target.x,
        target.y + dist * Math.sin(CAMERA_PITCH_RAD),
        target.z + dist * Math.cos(CAMERA_PITCH_RAD),
      );
      camera.lookAt(target.x, target.y, target.z);
      const live = new Set<string>();
      for (const p of state.pilots) {
        live.add(p.id);
        const g = ensureCraft(p.id, p.vultureId);
        g.visible = true;
        applyCraftPose(g, {
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          angle: p.angle,
          vultureId: p.vultureId,
          map: state.map,
          stillness: p.stillness,
          hoverPhase: p.hoverPhase,
          time: state.time,
          dt,
        });
        g.visible = p.respawn <= 0 || true;
        if (p.respawn > 0) g.visible = false;
      }
      for (const [id, g] of crafts) {
        if (!live.has(id)) g.visible = false;
      }
      shots.sync(state);
      picks.sync(state);
      renderer.render(scene, camera);
    },
    pickAim(cssX, cssY, cssW, cssH) {
      const ndcX = (cssX / cssW) * 2 - 1;
      const ndcY = -(cssY / cssH) * 2 + 1;
      const origin = new THREE.Vector3();
      const dir = new THREE.Vector3();
      origin.setFromMatrixPosition(camera.matrixWorld);
      dir.set(ndcX, ndcY, 0.5).unproject(camera).sub(origin).normalize();
      return pickAimOnHeightfield(
        map,
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
      );
    },
    dispose() {
      shots.dispose();
      picks.dispose();
      terrain.geometry.dispose();
      renderer.dispose();
    },
  };
}
