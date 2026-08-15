import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { getPlayer, type GameState } from "@/game/engine";
import { sampleTerrainY } from "@/game/heightfield";
import { VIEW_WORLD_WIDTH } from "@/game/viewScale";
import { orthoAimRay, pickAimOnHeightfield } from "./aimPick";
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
  } catch {
    throw new Error("WebGL을 시작할 수 없습니다");
  }
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) {
    renderer.dispose();
    throw new Error("WebGL을 시작할 수 없습니다");
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  let terrain: THREE.Mesh;
  try {
    terrain = createTerrainMesh(map);
  } catch {
    renderer.dispose();
    throw new Error("지형을 만들 수 없습니다");
  }
  scene.add(terrain);
  scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x3a2a18, 0.55));
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.35);
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
      const { origin, dir } = orthoAimRay(camera, ndcX, ndcY);
      return pickAimOnHeightfield(map, origin, dir);
    },
    dispose() {
      shots.dispose();
      picks.dispose();
      terrain.geometry.dispose();
      const { material } = terrain;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else {
        material.dispose();
      }
      env.dispose();
      pmrem.dispose();
      if (typeof renderer.forceContextLoss === "function") {
        renderer.forceContextLoss();
      }
      renderer.dispose();
    },
  };
}
