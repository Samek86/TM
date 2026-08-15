/**
 * In-match crafts: bake identity (silhouette + palette) with PBR materials.
 * Nose is +X. applyCraftPose is visual-only (bank / pitch / hover).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { MapDef } from "@/data/maps";
import type { VultureId } from "@/data/weapons";
import { getVulture } from "@/data/vultures";
import { sampleTerrainY } from "@/game/heightfield";
import { craftWorldRadius } from "@/game/viewScale";
import { engineToThree } from "./coords";
import {
  BANK_CAP_DEG,
  PITCH_BLEND,
  VISUAL_LENGTH_MUL,
  blendAngle,
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
    envMapIntensity: 1.15,
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
    envMapIntensity: 1.4,
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
    emissiveIntensity: 2.4,
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

function buildBorn(): THREE.Group {
  const g = new THREE.Group();
  const hull = metal("born.hull", 0x8b93a0, { roughness: 0.38, metalness: 0.78 });
  const trim = metal("born.trim", 0xc4cad3, { roughness: 0.22, metalness: 0.9 });
  const nose = metal("born.nose", 0xf59e0b, { roughness: 0.4, metalness: 0.55 });
  const dome = glass("born.glass", 0x2563eb);
  const jet = glow("born.jet", 0x22d3ee);

  add(g, rbox("born.fuse", 1.05, 0.26, 0.48, 0.055), hull);
  add(g, rbox("born.spine", 0.72, 0.08, 0.22, 0.03), trim, -0.04, 0.14, 0);
  add(g, rbox("born.nose", 0.22, 0.2, 0.28, 0.04), nose, 0.56, 0, 0);
  add(g, geom("sph.med", () => new THREE.SphereGeometry(0.16, 24, 16)), dome, 0.12, 0.2, 0);
  add(g, rbox("born.wing", 0.38, 0.05, 1.08, 0.03), hull, -0.06, -0.02, 0);
  add(g, rbox("born.wingTip", 0.1, 0.04, 0.18, 0.02), trim, -0.18, -0.01, 0.48);
  add(g, rbox("born.wingTip", 0.1, 0.04, 0.18, 0.02), trim, -0.18, -0.01, -0.48);
  const cyl = geom("cyl.eng", () => new THREE.CylinderGeometry(0.07, 0.08, 0.28, 14));
  add(g, cyl, jet, -0.58, 0.01, 0.14, 0, 0, Math.PI / 2);
  add(g, cyl, jet, -0.58, 0.01, -0.14, 0, 0, Math.PI / 2);
  return g;
}

function buildKillers(): THREE.Group {
  const g = new THREE.Group();
  const hull = metal("kill.hull", 0x1a8aa8, { roughness: 0.36, metalness: 0.72 });
  const dark = metal("kill.dark", 0x0e4d62, { roughness: 0.42, metalness: 0.7 });
  const dome = glass("kill.glass", 0x67e8f9);
  const jet = glow("kill.jet", 0x22d3ee);

  add(g, rbox("kill.fuse", 0.92, 0.4, 0.78, 0.08), hull);
  add(g, rbox("kill.skirt", 0.7, 0.1, 0.92, 0.04), dark, -0.04, -0.16, 0);
  add(g, rbox("kill.nose", 0.2, 0.26, 0.36, 0.05), dark, 0.5, 0.02, 0);
  add(g, geom("sph.lg", () => new THREE.SphereGeometry(0.22, 28, 18)), dome, 0.04, 0.26, 0);
  add(g, rbox("kill.wing", 0.28, 0.08, 1.22, 0.04), hull, -0.08, 0, 0);
  const cyl = geom("cyl.eng", () => new THREE.CylinderGeometry(0.07, 0.08, 0.28, 14));
  add(g, cyl, jet, -0.52, -0.02, 0.18, 0, 0, Math.PI / 2);
  add(g, cyl, jet, -0.52, -0.02, -0.18, 0, 0, Math.PI / 2);
  return g;
}

function buildSorcerer(): THREE.Group {
  const g = new THREE.Group();
  const hull = metal("sorc.hull", 0x7c3aed, { roughness: 0.28, metalness: 0.8 });
  const dark = metal("sorc.dark", 0x3b0764, { roughness: 0.34, metalness: 0.75 });
  const dome = glass("sorc.glass", 0x2e1065);
  const jet = glow("sorc.jet", 0xf0abfc);

  add(g, rbox("sorc.fuse", 1.38, 0.16, 0.26, 0.04), hull);
  add(g, rbox("sorc.nose", 0.28, 0.12, 0.14, 0.03), dark, 0.72, 0, 0);
  add(g, geom("sph.sm", () => new THREE.SphereGeometry(0.11, 22, 14)), dome, 0.18, 0.12, 0);
  const wing = rbox("sorc.wing", 0.55, 0.035, 0.22, 0.02);
  add(g, wing, hull, -0.08, 0, 0.38, 0, 0.42, 0);
  add(g, wing, hull, -0.08, 0, -0.38, 0, -0.42, 0);
  add(g, rbox("sorc.tail", 0.18, 0.08, 0.12, 0.02), dark, -0.62, 0.04, 0);
  const cyl = geom("cyl.thin", () => new THREE.CylinderGeometry(0.035, 0.045, 0.2, 12));
  add(g, cyl, jet, -0.72, 0, 0.06, 0, 0, Math.PI / 2);
  add(g, cyl, jet, -0.72, 0, -0.06, 0, 0, Math.PI / 2);
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

function buildArtCraft(id: VultureId, texture: THREE.Texture): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
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

export function createCraftGroup(
  id: VultureId,
  art?: THREE.Texture | null,
): THREE.Group {
  try {
    if (art) return buildArtCraft(id, art);
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
  const terrainY = sampleTerrainY(map, x, y);
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

  if (group.userData.artCard && camera) {
    group.lookAt(camera.position.x, group.position.y, camera.position.z);
    const aimX = Math.cos(angle);
    const aimZ = Math.sin(angle);
    const toCamX = camera.position.x - group.position.x;
    const toCamZ = camera.position.z - group.position.z;
    const rightX = -toCamZ;
    const rightZ = toCamX;
    const flip = aimX * rightX + aimZ * rightZ < 0 ? -1 : 1;
    const s = Number(group.userData.baseScale) || 1;
    group.scale.set(s * flip, s, s);
    group.rotateZ(bank);
    group.rotateX(pitch * 0.4);
  } else {
    group.rotation.order = "YXZ";
    group.rotation.set(bank, -angle, pitch);
  }

  const shadow = group.getObjectByName("shadow");
  if (shadow) applyShadowPose(group, shadow, terrainY);
}
