import * as THREE from "three";
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
};

type CraftSpec = {
  fuse: readonly [number, number, number];
  wing: readonly [number, number, number];
  canopy: readonly [number, number, number];
  canopyPos: readonly [number, number, number];
  canopyColor: number;
};

type CraftGeoms = {
  fuselage: THREE.BufferGeometry;
  wing: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
};

type CraftMats = {
  hull: THREE.MeshLambertMaterial;
  canopy: THREE.MeshLambertMaterial;
};

const SPECS: Record<VultureId, CraftSpec> = {
  born_armor: {
    fuse: [1.0, 0.28, 0.45],
    wing: [0.34, 0.05, 1.02],
    canopy: [0.28, 0.12, 0.22],
    canopyPos: [0.18, 0.17, 0],
    canopyColor: 0xf59e0b,
  },
  killers_pot: {
    fuse: [0.85, 0.38, 0.7],
    wing: [0.22, 0.08, 1.18],
    canopy: [0.22, 0.12, 0.3],
    canopyPos: [0.14, 0.22, 0],
    canopyColor: 0x22d3ee,
  },
  sorcerer: {
    fuse: [1.25, 0.2, 0.32],
    wing: [0.4, 0.04, 1.55],
    canopy: [0.32, 0.09, 0.16],
    canopyPos: [0.28, 0.125, 0],
    canopyColor: 0xa78bfa,
  },
};

const GEOM_CACHE = new Map<VultureId, CraftGeoms>();
const MAT_CACHE = new Map<VultureId, CraftMats>();

let shadowGeom: THREE.CircleGeometry | undefined;
let shadowMat: THREE.MeshBasicMaterial | undefined;

const _worldPos = new THREE.Vector3();
const _parentQ = new THREE.Quaternion();
const _flatQ = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -Math.PI / 2,
);

function ensureParts(id: VultureId): { geoms: CraftGeoms; mats: CraftMats } {
  let geoms = GEOM_CACHE.get(id);
  let mats = MAT_CACHE.get(id);
  if (geoms && mats) return { geoms, mats };
  const spec = SPECS[id];
  const vulture = getVulture(id);
  geoms = {
    fuselage: new THREE.BoxGeometry(spec.fuse[0], spec.fuse[1], spec.fuse[2]),
    wing: new THREE.BoxGeometry(spec.wing[0], spec.wing[1], spec.wing[2]),
    canopy: new THREE.BoxGeometry(
      spec.canopy[0],
      spec.canopy[1],
      spec.canopy[2],
    ),
  };
  mats = {
    hull: new THREE.MeshLambertMaterial({ color: vulture.color }),
    canopy: new THREE.MeshLambertMaterial({ color: spec.canopyColor }),
  };
  GEOM_CACHE.set(id, geoms);
  MAT_CACHE.set(id, mats);
  return { geoms, mats };
}

function getShadowGeom(): THREE.CircleGeometry {
  return (shadowGeom ??= new THREE.CircleGeometry(0.5, 24));
}

function getShadowMat(): THREE.MeshBasicMaterial {
  return (shadowMat ??= new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  }));
}

function addShadow(group: THREE.Group): void {
  const mesh = new THREE.Mesh(getShadowGeom(), getShadowMat());
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

function createCapsuleCraft(color: string): THREE.Group {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.22, 0.7, 4, 10),
    new THREE.MeshLambertMaterial({ color }),
  );
  mesh.rotation.z = -Math.PI / 2;
  group.add(mesh);
  return group;
}

function buildProceduralCraft(id: VultureId): THREE.Group {
  const spec = SPECS[id];
  const { geoms, mats } = ensureParts(id);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geoms.fuselage, mats.hull));
  group.add(new THREE.Mesh(geoms.wing, mats.hull));
  const canopy = new THREE.Mesh(geoms.canopy, mats.canopy);
  canopy.position.set(spec.canopyPos[0], spec.canopyPos[1], spec.canopyPos[2]);
  group.add(canopy);
  scaleToVisualLength(group, getVulture(id).radiusTiles);
  addShadow(group);
  return group;
}

export function createCraftGroup(id: VultureId): THREE.Group {
  try {
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
  } = args;
  const terrainY = sampleTerrainY(map, x, y);
  const hover = 2 + stillness * Math.sin(time * 4.2 + hoverPhase) * 1.2;
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

  // +X nose: YXZ x=bank (roll about nose), y=-angle, z=pitch (nose up about Z).
  group.rotation.order = "YXZ";
  group.rotation.set(bank, -angle, pitch);

  const shadow = group.getObjectByName("shadow");
  if (shadow) applyShadowPose(group, shadow, terrainY);
}
