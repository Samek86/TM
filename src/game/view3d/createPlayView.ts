import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { qualityProfile, type QualityProfile } from "./quality";
import type { MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { getPlayer, type GameState } from "@/game/engine";
import { sculptedHeight } from "@/game/heightfield";
import { playWorldWidth } from "@/game/viewScale";
import { orthoAimRay, pickAimOnHeightfield } from "./aimPick";
import { createSkyDome, horizonColor } from "./atmosphere";
import { createMapBoundary } from "./boundary";
import { PLAY_LOOK } from "./look";
import {
  CAMERA_PITCH_RAD,
  MAX_DPR,
  computeOrthoHalfExtents,
  followTarget,
} from "./cameraRig";
import { disposeCraftArt, type CraftArtKit } from "./craftAssets";
import { disposeCraftModels, type CraftModelKit } from "./craftModels";
import { disposeOrdnanceArt, type OrdnanceArtKit } from "./ordnanceArt";
import { createAimCue } from "./aimCue";
import { applyCraftPose, createCraftGroup } from "./crafts";
import { createParticleLayer } from "./particles3d";
import { createPickupLayer, createProjectileLayer } from "./projectiles";
import { createTerrainScenery, type TerrainScenery } from "./terrainMesh";
import { disposeTerrainKit, type TerrainKit } from "./terrainTextures";
import { biomeForMapId } from "@/game/terrainStyle";
import { engineToThree } from "./coords";

export type PlayView = {
  resize(cssW: number, cssH: number, dpr: number, phoneLike?: boolean): void;
  renderFrame(state: GameState, dt: number): void;
  pickAim(
    cssX: number,
    cssY: number,
    cssW: number,
    cssH: number,
  ): { x: number; y: number } | null;
  projectWorld(
    engineX: number,
    engineY: number,
    height: number,
  ): { x: number; y: number } | null;
  dispose(): void;
};

export function createPlayView(
  canvas: HTMLCanvasElement,
  map: MapDef,
  kit: TerrainKit | null = null,
  craftArt: CraftArtKit = {},
  ordnance: OrdnanceArtKit | null = null,
  craftModels: CraftModelKit = {},
  quality: QualityProfile = qualityProfile("high"),
): PlayView {
  let cssWidth = 1;
  let cssHeight = 1;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
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
  renderer.toneMappingExposure = PLAY_LOOK.toneMappingExposure;
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const theme = biomeForMapId(map.id);
  // Fog is the sky's horizon band, so distant ground dissolves into the haze.
  const haze = horizonColor(theme.id);
  scene.background = haze.clone();
  scene.fog = new THREE.Fog(haze.getHex(), 760, 2400);
  // Negative near: the rig sits close to the player, and a 0 near plane
  // slices the foreground hillside open, showing sky through the cut.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2500, 4000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = PLAY_LOOK.environmentIntensity;
  let terrain: TerrainScenery;
  try {
    terrain = createTerrainScenery(map, kit, {
      playCast: quality.shadows && quality.terrainCastsShadow,
      sceneryCast: false,
    });
  } catch {
    renderer.dispose();
    throw new Error("지형을 만들 수 없습니다");
  }
  scene.add(terrain.group);
  const boundary = createMapBoundary(map, theme.id);
  scene.add(boundary.group);
  // Low afternoon sun: overhead light flattens every bank and cliff face.
  const sunDir = new THREE.Vector3(0.62, 0.5, 0.6).normalize();
  const sky = createSkyDome(theme.id, sunDir);
  scene.add(sky);

  scene.add(
    new THREE.HemisphereLight(0xc8dcf0, 0x4a5a38, PLAY_LOOK.hemiIntensity),
  );
  scene.add(new THREE.AmbientLight(0xffffff, PLAY_LOOK.ambientIntensity));
  const sun = new THREE.DirectionalLight(0xffeed2, PLAY_LOOK.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(700);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  // Terrain now self-shadows, so the offset has to clear a shadow texel on a
  // grazing slope; too little and every gentle bank stripes itself.
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 1.4;
  sun.shadow.radius = 3;
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.near = 20;
  sc.far = 1500;
  sc.left = -520;
  sc.right = 520;
  sc.top = 520;
  sc.bottom = -520;
  scene.add(sun);
  scene.add(sun.target);

  const crafts = new Map<string, THREE.Group>();
  const shots = createProjectileLayer(200, ordnance);
  const picks = createPickupLayer(12, ordnance);
  const fx = createParticleLayer();
  const aim = createAimCue();
  scene.add(shots.mesh);
  scene.add(picks.mesh);
  scene.add(fx.mesh);
  scene.add(aim.group);

  let composer: EffectComposer | null = null;
  if (quality.postFx) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(1280, 720),
        PLAY_LOOK.bloomStrength,
        PLAY_LOOK.bloomRadius,
        PLAY_LOOK.bloomThreshold,
      ),
    );
    composer.addPass(new SMAAPass());
    composer.addPass(new OutputPass());
  }

  function ensureCraft(id: string, vultureId: VultureId): THREE.Group {
    let g = crafts.get(id);
    if (!g) {
      g = createCraftGroup(
        vultureId,
        craftArt[vultureId],
        craftModels[vultureId],
      );
      crafts.set(id, g);
      scene.add(g);
    }
    return g;
  }

  return {
    resize(cssW, cssH, dpr, phoneLike = false) {
      cssWidth = Math.max(1, cssW);
      cssHeight = Math.max(1, cssH);
      const ratio = Math.min(dpr, quality.maxDpr, MAX_DPR);
      renderer.setPixelRatio(ratio);
      renderer.setSize(cssW, cssH, false);
      composer?.setPixelRatio(ratio);
      composer?.setSize(cssW, cssH);
      const worldW = Math.min(map.width, playWorldWidth(cssW, phoneLike));
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
      const pY = sculptedHeight(state.map, px, py);
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
        target.x + sunDir.x * 700,
        target.y + sunDir.y * 700,
        target.z + sunDir.z * 700,
      );
      sky.position.set(target.x, target.y, target.z);
      boundary.update(state.time, px, py);
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
      shots.sync(state, camera);
      picks.sync(state, camera);
      fx.sync(state);
      aim.sync(state, camera);
      if (composer) composer.render();
      else renderer.render(scene, camera);
    },
    pickAim(cssX, cssY, cssW, cssH) {
      const ndcX = (cssX / cssW) * 2 - 1;
      const ndcY = -(cssY / cssH) * 2 + 1;
      const { origin, dir } = orthoAimRay(camera, ndcX, ndcY);
      return pickAimOnHeightfield(map, origin, dir);
    },
    projectWorld(engineX, engineY, height) {
      const world = engineToThree(engineX, engineY, height);
      const point = new THREE.Vector3(world.x, world.y, world.z).project(
        camera,
      );
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      return {
        x: (point.x * 0.5 + 0.5) * cssWidth,
        y: (-point.y * 0.5 + 0.5) * cssHeight,
      };
    },
    dispose() {
      shots.dispose();
      picks.dispose();
      fx.dispose();
      aim.dispose();
      composer?.dispose();
      sky.geometry.dispose();
      (sky.material as THREE.Material).dispose();
      terrain.dispose();
      boundary.dispose();
      disposeTerrainKit(kit);
      disposeCraftArt(craftArt);
      disposeCraftModels(craftModels);
      if (ordnance) disposeOrdnanceArt(ordnance);
      env.dispose();
      pmrem.dispose();
      if (typeof renderer.forceContextLoss === "function") {
        renderer.forceContextLoss();
      }
      renderer.dispose();
    },
  };
}
