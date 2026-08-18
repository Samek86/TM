/**
 * In-match crafts: bake identity (silhouette + palette) with PBR materials.
 * Nose is +X. applyCraftPose is visual-only (bank / pitch / hover).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { getVulture } from "@/data/vultures";
import { sculptedHeight } from "@/game/heightfield";
import { craftWorldRadius } from "@/game/viewScale";
import { yawFrameIndex } from "./craftAssets";
import { engineToThree } from "./coords";
import { PLAY_LOOK } from "./look";
import {
  BANK_CAP_DEG,
  PITCH_BLEND,
  VISUAL_LENGTH_MUL,
  blendAngle,
  smoothYaw,
  targetBankRad,
  targetPitchRad,
} from "./craftPose";

export type CraftPoseArgs = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  vultureId: VultureId;
  map: MapDef;
  stillness: number;
  hoverPhase: number;
  time: number;
  dt: number;
  camera?: THREE.Camera;
};

const _worldPos = new THREE.Vector3();
const _parentQ = new THREE.Quaternion();
const _flatQ = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);

const MAT_CACHE = new Map<string, THREE.Material>();
const GEOM_CACHE = new Map<string, THREE.BufferGeometry>();

function geom(
  key: string,
  make: () => THREE.BufferGeometry,
): THREE.BufferGeometry {
  let g = GEOM_CACHE.get(key);
  if (!g) {
    g = make();
    GEOM_CACHE.set(key, g);
  }
  return g;
}

function metal(
  key: string,
  color: number,
  extras: ConstructorParameters<typeof THREE.MeshStandardMaterial>[0] = {},
): THREE.MeshStandardMaterial {
  const cached = MAT_CACHE.get(key);
  if (cached) return cached as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.82,
    roughness: 0.32,
    envMapIntensity: PLAY_LOOK.metalEnv,
    ...extras,
  });
  MAT_CACHE.set(key, m);
  return m;
}

function glass(key: string, color: number): THREE.MeshPhysicalMaterial {
  const cached = MAT_CACHE.get(key);
  if (cached) return cached as THREE.MeshPhysicalMaterial;
  const m = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.05,
    roughness: 0.08,
    transmission: 0.35,
    thickness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: PLAY_LOOK.glassEnv,
    transparent: true,
    opacity: 0.92,
  });
  MAT_CACHE.set(key, m);
  return m;
}

function glow(key: string, color: number): THREE.MeshStandardMaterial {
  const cached = MAT_CACHE.get(key);
  if (cached) return cached as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: PLAY_LOOK.glowEmissive,
    metalness: 0.2,
    roughness: 0.45,
  });
  MAT_CACHE.set(key, m);
  return m;
}

function add(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

let shadowGeom: THREE.CircleGeometry | undefined;
let shadowMat: THREE.MeshBasicMaterial | undefined;

function addShadow(group: THREE.Group): void {
  shadowGeom ??= new THREE.CircleGeometry(0.55, 28);
  shadowMat ??= new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(shadowGeom, shadowMat);
  mesh.name = "shadow";
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = -1;
  group.add(mesh);
}

function scaleToVisualLength(group: THREE.Group, radiusTiles: number): void {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(size.x, 1e-6);
  const target = VISUAL_LENGTH_MUL * craftWorldRadius(radiusTiles);
  group.scale.setScalar(target / length);
}

function rbox(
  key: string,
  w: number,
  h: number,
  d: number,
  radius = 0.045,
): THREE.BufferGeometry {
  return geom(
    key,
    () => new RoundedBoxGeometry(w, h, d, 5, radius),
  );
}

/** Cone pointing down +X, the craft's nose axis. */
function cone(key: string, radius: number, len: number): THREE.BufferGeometry {
  return geom(key, () => {
    const g = new THREE.ConeGeometry(radius, len, 20);
    g.rotateZ(-Math.PI / 2);
    return g;
  });
}

/** Cylinder lying along +X. */
function tube(
  key: string,
  rFront: number,
  rBack: number,
  len: number,
  seg = 18,
): THREE.BufferGeometry {
  return geom(key, () => {
    const g = new THREE.CylinderGeometry(rFront, rBack, len, seg);
    g.rotateZ(-Math.PI / 2);
    return g;
  });
}

/**
 * Flat wing pair from a half planform, given as [alongNose, span] points
 * running root leading edge -> tip -> root trailing edge. The outline is
 * mirrored across the centreline, so the whole pair is one mesh.
 */
function wing(
  key: string,
  half: readonly (readonly [number, number])[],
  thickness: number,
): THREE.BufferGeometry {
  return geom(key, () => {
    const shape = new THREE.Shape();
    shape.moveTo(half[0]![0], half[0]![1]);
    for (let i = 1; i < half.length; i++) shape.lineTo(half[i]![0], half[i]![1]);
    for (let i = half.length - 1; i >= 0; i--) {
      shape.lineTo(half[i]![0], -half[i]![1]);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: true,
      bevelThickness: thickness * 0.3,
      bevelSize: thickness * 0.3,
      bevelSegments: 1,
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, thickness / 2, 0);
    return g;
  });
}

/** Engine pod: metal barrel with an emissive nozzle disc at the tail. */
function engine(
  parent: THREE.Object3D,
  shell: THREE.Material,
  jet: THREE.Material,
  radius: number,
  len: number,
  x: number,
  y: number,
  z: number,
): void {
  const key = `${radius.toFixed(3)}.${len.toFixed(3)}`;
  add(parent, tube(`eng.body.${key}`, radius * 0.86, radius, len), shell, x, y, z);
  // The scene runs a deliberately low glow budget, so the nozzle earns its
  // read from emissive area rather than intensity.
  add(
    parent,
    tube(`eng.jet.${key}`, radius * 0.62, radius * 0.9, len * 0.3),
    jet,
    x - len * 0.44,
    y,
    z,
  );
}

const SPHERE = () => new THREE.SphereGeometry(1, 20, 14);

/**
 * Cockpit blister: a squashed sphere on a slightly wider dark collar. Without
 * the collar the glass reads as a painted oval at play-view sizes.
 */
function canopy(
  parent: THREE.Object3D,
  glassMat: THREE.Material,
  frameMat: THREE.Material,
  x: number,
  y: number,
  long: number,
  tall: number,
  wide: number,
): void {
  const collar = add(parent, geom("sph.unit", SPHERE), frameMat, x, y - tall * 0.3, 0);
  collar.scale.set(long * 1.12, tall * 0.75, wide * 1.2);
  const bubble = add(parent, geom("sph.unit", SPHERE), glassMat, x, y, 0);
  bubble.scale.set(long, tall, wide);
  bubble.castShadow = false;
}

/** Grey armoured strike fighter: orange nose, twin high-mounted engines. */
function buildBorn(): THREE.Group {
  const g = new THREE.Group();
  const hull = metal("born.hull", 0x8f96a1, { roughness: 0.52, metalness: 0.58 });
  const dark = metal("born.dark", 0x596068, { roughness: 0.58, metalness: 0.5 });
  const red = metal("born.red", 0xa8323a, { roughness: 0.5, metalness: 0.35 });
  const nose = metal("born.nose", 0xe07b18, { roughness: 0.5, metalness: 0.32 });
  const dome = glass("born.glass", 0x16306e);
  const jet = glow("born.jet", 0x2fd0f5);

  add(g, rbox("born.fuse", 1.02, 0.27, 0.40, 0.11), hull, 0.04, 0, 0);
  add(g, rbox("born.belly", 0.80, 0.15, 0.50, 0.07), dark, -0.04, -0.15, 0);
  add(g, rbox("born.spine", 0.44, 0.12, 0.20, 0.05), dark, -0.14, 0.16, 0);
  add(g, rbox("born.nosebox", 0.30, 0.22, 0.30, 0.09), nose, 0.60, -0.01, 0);
  add(g, cone("born.tip", 0.13, 0.34), nose, 0.90, -0.01, 0);
  canopy(g, dome, dark, 0.36, 0.17, 0.16, 0.13, 0.10);

  add(
    g,
    wing("born.wing", [
      [0.30, 0.07],
      [-0.10, 0.60],
      [-0.36, 0.58],
      [-0.24, 0.07],
    ], 0.05),
    hull,
    -0.02,
    -0.04,
    0,
  );
  add(g, rbox("born.tipL", 0.16, 0.04, 0.07, 0.02), red, -0.20, -0.04, 0.58);
  add(g, rbox("born.tipR", 0.16, 0.04, 0.07, 0.02), red, -0.20, -0.04, -0.58);
  add(g, rbox("born.pod", 0.34, 0.07, 0.08, 0.03), dark, -0.06, -0.12, 0.34);
  add(g, rbox("born.pod", 0.34, 0.07, 0.08, 0.03), dark, -0.06, -0.12, -0.34);

  engine(g, hull, jet, 0.115, 0.44, -0.40, 0.10, 0.16);
  engine(g, hull, jet, 0.115, 0.44, -0.40, 0.10, -0.16);
  add(g, rbox("born.fin", 0.26, 0.24, 0.045, 0.02), dark, -0.36, 0.30, 0.16);
  add(g, rbox("born.fin", 0.26, 0.24, 0.045, 0.02), dark, -0.36, 0.30, -0.16);
  add(g, rbox("born.finTip", 0.16, 0.05, 0.05, 0.02), red, -0.34, 0.41, 0.16);
  add(g, rbox("born.finTip", 0.16, 0.05, 0.05, 0.02), red, -0.34, 0.41, -0.16);
  return g;
}

/** Blue heavy gunship: wide hull, forward gun barrels, four engine drums. */
function buildKillers(): THREE.Group {
  const g = new THREE.Group();
  const hull = metal("kill.hull", 0x3a90b8, { roughness: 0.55, metalness: 0.5 });
  const dark = metal("kill.dark", 0x1d5a78, { roughness: 0.6, metalness: 0.48 });
  const gun = metal("kill.gun", 0x4a5058, { roughness: 0.45, metalness: 0.7 });
  const dome = glass("kill.glass", 0x5fd8f0);
  const jet = glow("kill.jet", 0x35c8f2);

  add(g, rbox("kill.fuse", 0.94, 0.34, 0.60, 0.12), hull, 0.02, 0.02, 0);
  add(g, rbox("kill.deck", 0.66, 0.16, 0.40, 0.08), dark, 0.06, 0.20, 0);
  add(g, rbox("kill.belly", 0.82, 0.18, 0.70, 0.09), dark, -0.02, -0.16, 0);
  add(g, rbox("kill.prow", 0.30, 0.24, 0.36, 0.10), dark, 0.58, 0.0, 0);
  canopy(g, dome, dark, 0.30, 0.32, 0.16, 0.13, 0.13);

  add(
    g,
    wing("kill.wing", [
      [0.20, 0.28],
      [-0.10, 0.72],
      [-0.34, 0.70],
      [-0.28, 0.28],
    ], 0.07),
    hull,
    -0.04,
    -0.04,
    0,
  );
  add(g, rbox("kill.sponson", 0.52, 0.22, 0.20, 0.07), dark, -0.06, -0.06, 0.44);
  add(g, rbox("kill.sponson", 0.52, 0.22, 0.20, 0.07), dark, -0.06, -0.06, -0.44);
  for (const z of [0.18, 0.30]) {
    add(g, tube("kill.barrel", 0.035, 0.035, 0.56, 10), gun, 0.62, -0.14, z);
    add(g, tube("kill.barrel", 0.035, 0.035, 0.56, 10), gun, 0.62, -0.14, -z);
  }

  for (const y of [0.14, -0.06]) {
    engine(g, dark, jet, 0.105, 0.40, -0.50, y, 0.17);
    engine(g, dark, jet, 0.105, 0.40, -0.50, y, -0.17);
  }
  add(g, rbox("kill.tail", 0.20, 0.28, 0.05, 0.02), dark, -0.44, 0.32, 0);
  return g;
}

/** Purple interceptor: long dart nose, delta wings, magenta thrust. */
function buildSorcerer(): THREE.Group {
  const g = new THREE.Group();
  const hull = metal("sorc.hull", 0x6d4bc4, { roughness: 0.44, metalness: 0.62 });
  const dark = metal("sorc.dark", 0x3a2266, { roughness: 0.5, metalness: 0.6 });
  const dome = glass("sorc.glass", 0x2a1550);
  const jet = glow("sorc.jet", 0xef6ff0);

  add(g, rbox("sorc.fuse", 1.00, 0.17, 0.24, 0.07), hull, -0.06, 0, 0);
  add(g, rbox("sorc.chine", 0.62, 0.07, 0.40, 0.04), hull, 0.10, -0.02, 0);
  add(g, cone("sorc.tip", 0.10, 0.62), hull, 0.76, 0.0, 0);
  canopy(g, dome, dark, 0.20, 0.12, 0.15, 0.08, 0.07);

  add(
    g,
    wing("sorc.wing", [
      [0.22, 0.05],
      [-0.46, 0.54],
      [-0.60, 0.52],
      [-0.34, 0.05],
    ], 0.035),
    hull,
    -0.04,
    -0.02,
    0,
  );
  add(g, rbox("sorc.tipL", 0.14, 0.03, 0.05, 0.015), dark, -0.50, -0.02, 0.52);
  add(g, rbox("sorc.tipR", 0.14, 0.03, 0.05, 0.015), dark, -0.50, -0.02, -0.52);
  add(g, rbox("sorc.fin", 0.24, 0.20, 0.035, 0.015), dark, -0.48, 0.16, 0.10, 0.38);
  add(g, rbox("sorc.fin", 0.24, 0.20, 0.035, 0.015), dark, -0.48, 0.16, -0.10, -0.38);

  engine(g, dark, jet, 0.085, 0.32, -0.52, 0.0, 0.09);
  engine(g, dark, jet, 0.085, 0.32, -0.52, 0.0, -0.09);
  return g;
}

const BUILDERS: Record<VultureId, () => THREE.Group> = {
  born_armor: buildBorn,
  killers_pot: buildKillers,
  sorcerer: buildSorcerer,
};

function createCapsuleCraft(color: string): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.7, 6, 12),
    metal(`cap.${color}`, new THREE.Color(color).getHex()),
  );
  mesh.rotation.z = -Math.PI / 2;
  group.add(mesh);
  return group;
}

function buildProceduralCraft(id: VultureId): THREE.Group {
  const group = BUILDERS[id]();
  scaleToVisualLength(group, getVulture(id).radiusTiles);
  group.userData.hoverLift =
    VISUAL_LENGTH_MUL * craftWorldRadius(getVulture(id).radiusTiles) * 0.22 + 6;
  addShadow(group);
  return group;
}

function buildArtCraft(id: VultureId, frames: THREE.Texture[]): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: frames[0] ?? null,
    color: PLAY_LOOK.artTint,
    transparent: true,
    alphaTest: 0.06,
    side: THREE.DoubleSide,
    depthWrite: true,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.55, 2.55), mat);
  mesh.name = "art";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  group.add(mesh);
  group.userData.yawFrames = frames;
  const radius = craftWorldRadius(getVulture(id).radiusTiles);
  const target = radius * 1.08;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const length = Math.max(size.x, size.y, 1e-6);
  group.scale.setScalar(target / length);
  group.userData.artCard = true;
  group.userData.baseScale = group.scale.x;
  group.userData.hoverLift = target * 0.36 + 5;
  addShadow(group);
  return group;
}

/**
 * Clone of a fitted GLB. Cloning shares geometry and materials, so every
 * pilot flying the same craft costs one extra transform tree.
 */
function buildModelCraft(template: THREE.Group): THREE.Group {
  const group = template.clone(true);
  addShadow(group);
  return group;
}

export function createCraftGroup(
  id: VultureId,
  art?: THREE.Texture[] | THREE.Texture | null,
  model?: THREE.Group | null,
): THREE.Group {
  try {
    if (model) return buildModelCraft(model);
    const frames = Array.isArray(art) ? art : art ? [art] : [];
    if (frames.length) return buildArtCraft(id, frames);
    return buildProceduralCraft(id);
  } catch {
    const vulture = getVulture(id);
    const group = createCapsuleCraft(vulture.color);
    scaleToVisualLength(group, vulture.radiusTiles);
    addShadow(group);
    return group;
  }
}

function applyShadowPose(
  group: THREE.Group,
  shadow: THREE.Object3D,
  terrainY: number,
): void {
  group.updateMatrixWorld(true);
  _worldPos.set(group.position.x, terrainY + 0.05, group.position.z);
  group.worldToLocal(_worldPos);
  shadow.position.copy(_worldPos);
  group.getWorldQuaternion(_parentQ);
  shadow.quaternion.copy(_parentQ).invert().multiply(_flatQ);
}

export function applyCraftPose(group: THREE.Group, args: CraftPoseArgs): void {
  const {
    x,
    y,
    vx,
    vy,
    angle,
    vultureId,
    map,
    stillness,
    hoverPhase,
    time,
    dt,
    camera,
  } = args;
  const terrainY = sculptedHeight(map, x, y);
  const lift = Number(group.userData.hoverLift) || 10;
  const hover = lift + stillness * Math.sin(time * 4.2 + hoverPhase) * 2.2;
  const pos = engineToThree(x, y, terrainY + hover);
  group.position.set(pos.x, pos.y, pos.z);

  const cap = BANK_CAP_DEG[vultureId];
  const bank = blendAngle(
    Number(group.userData.bank) || 0,
    targetBankRad(vx, vy, angle, cap),
    dt,
    PITCH_BLEND,
  );
  const pitch = blendAngle(
    Number(group.userData.pitch) || 0,
    targetPitchRad(map, x, y, vx, vy),
    dt,
    PITCH_BLEND,
  );
  group.userData.bank = bank;
  group.userData.pitch = pitch;

  const prevYaw = group.userData.yaw;
  const yaw = smoothYaw(typeof prevYaw === "number" ? prevYaw : angle, angle, dt);
  group.userData.yaw = yaw;

  if (group.userData.artCard && camera) {
    const frames = group.userData.yawFrames as THREE.Texture[] | undefined;
    if (frames && frames.length > 0) {
      const art = group.getObjectByName("art") as THREE.Mesh | undefined;
      const mat = art?.material as THREE.MeshBasicMaterial | undefined;
      const next = frames[yawFrameIndex(yaw, frames.length)];
      if (mat && next && mat.map !== next) {
        mat.map = next;
        mat.needsUpdate = true;
      }
    }
    group.lookAt(camera.position.x, group.position.y, camera.position.z);
    const s = Number(group.userData.baseScale) || 1;
    group.scale.set(s, s, s);
    group.rotateZ(bank);
    group.rotateX(pitch * 0.4);
  } else {
    group.rotation.order = "YXZ";
    group.rotation.set(bank, -yaw, pitch);
  }

  const shadow = group.getObjectByName("shadow");
  if (shadow) applyShadowPose(group, shadow, terrainY);
}
