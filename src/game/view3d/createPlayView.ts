import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import type { MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { getPlayer, type GameState } from "@/game/engine";
import { sampleTerrainY } from "@/game/heightfield";
import { VIEW_WORLD_WIDTH } from "@/game/viewScale";
import { orthoAimRay, pickAimOnHeightfield } from "./aimPick";
import { createSkyDome } from "./atmosphere";
import {
  CAMERA_PITCH_RAD,
  MAX_DPR,
  computeOrthoHalfExtents,
  followTarget,
} from "./cameraRig";
import { disposeCraftArt, type CraftArtKit } from "./craftAssets";
import { applyCraftPose, createCraftGroup } from "./crafts";
import { createParticleLayer } from "./particles3d";
import { createPickupLayer, createProjectileLayer } from "./projectiles";
import { createTerrainMesh } from "./terrainMesh";
import {
  disposeTerrainKit,
  type TerrainKit,
} from "./terrainTextures";
import { biomeForMapId } from "@/game/terrainStyle";

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

export function createPlayView(
  canvas: HTMLCanvasElement,
  map: MapDef,
  kit: TerrainKit | null = null,
  craftArt: CraftArtKit = {},
): PlayView {
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
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const theme = biomeForMapId(map.id);
  const fogColor = new THREE.Color(
    theme.fog[0] / 255,
    theme.fog[1] / 255,
    theme.fog[2] / 255,
  );
  scene.background = fogColor.clone().lerp(new THREE.Color(0x87a0b4), 0.45);
  scene.fog = new THREE.Fog(scene.background.getHex(), 380, 1600);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  let terrain: THREE.Mesh;
  try {
    terrain = createTerrainMesh(map, kit);
  } catch {
    renderer.dispose();
    throw new Error("지형을 만들 수 없습니다");
  }
  scene.add(terrain);
  const sunDir = new THREE.Vector3(0.45, 0.82, 0.36).normalize();
  const sky = createSkyDome(theme.id, sunDir);
  scene.add(sky);

  scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x3a2a18, 0.42));
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.85);
  sun.position.copy(sunDir).multiplyScalar(420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.6;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.near = 20;
  sc.far = 900;
  sc.left = -280;
  sc.right = 280;
  sc.top = 280;
  sc.bottom = -280;
  scene.add(sun);
  scene.add(sun.target);

  const crafts = new Map<string, THREE.Group>();
  const shots = createProjectileLayer(200);
  const picks = createPickupLayer(12);
  const fx = createParticleLayer();
  scene.add(shots.mesh);
  scene.add(picks.mesh);
  scene.add(fx.mesh);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.38, 0.55, 0.78);
  const smaa = new SMAAPass();
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(smaa);
  composer.addPass(output);

  function ensureCraft(id: string, vultureId: VultureId): THREE.Group {
    let g = crafts.get(id);
    if (!g) {
      g = createCraftGroup(vultureId, craftArt[vultureId]);
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
      composer.setPixelRatio(ratio);
      composer.setSize(cssW, cssH);
      bloom.setSize(cssW, cssH);
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
      sun.target.position.set(target.x, target.y, target.z);
      sun.position.set(
        target.x + sunDir.x * 420,
        target.y + sunDir.y * 420,
        target.z + sunDir.z * 420,
      );
      sky.position.set(target.x, target.y, target.z);
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
          camera,
        });
        g.visible = p.respawn <= 0 || true;
        if (p.respawn > 0) g.visible = false;
      }
      for (const [id, g] of crafts) {
        if (!live.has(id)) g.visible = false;
      }
      shots.sync(state);
      picks.sync(state);
      fx.sync(state);
      composer.render();
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
      fx.dispose();
      composer.dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      terrain.geometry.dispose();
      const { material } = terrain;
      if (Array.isArray(material)) {
        for (const m of material) m.dispose();
      } else {
        material.dispose();
      }
      disposeTerrainKit(kit);
      disposeCraftArt(craftArt);
      env.dispose();
      pmrem.dispose();
      if (typeof renderer.forceContextLoss === "function") {
        renderer.forceContextLoss();
      }
      renderer.dispose();
    },
  };
}
