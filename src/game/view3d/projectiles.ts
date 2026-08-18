import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { WEAPONS } from "@/data/weapons";
import { getPlayer, type Bullet, type GameState } from "@/game/engine";
import { sculptedHeight } from "@/game/heightfield";
import { engineToThree } from "./coords";
import type { OrdnanceArtKit } from "./ordnanceArt";

export type LayerHandle = {
  mesh: THREE.Object3D;
  sync(state: GameState, camera?: THREE.Camera): void;
  dispose(): void;
};

const PICKUP_WORLD = 52;
type ShotShape =
  | "dart"
  | "cruise"
  | "scatter"
  | "bomb"
  | "nuke"
  | "bolt"
  | "pierce"
  | "heavy"
  | "frost"
  | "cloud"
  | "mine"
  | "default";

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _axisX = new THREE.Vector3(1, 0, 0);
const _dir = new THREE.Vector3();

function shapeFor(style: string | undefined, ammo: Bullet["ammo"]): ShotShape {
  if (ammo === "mine") return "mine";
  if (style === "storm") return "cloud";
  if (style === "frost") return "frost";
  if (ammo === "cloud") return "cloud";
  if (style === "lob") return "bomb";
  if (style === "nuke") return "nuke";
  if (style === "dart") return "dart";
  if (style === "cruise") return "cruise";
  if (style === "scatter") return "scatter";
  if (style === "pierce") return "pierce";
  if (style === "heavy") return "heavy";
  if (style === "poke" || style === "twin_beam" || ammo === "beam" || ammo === "energy") {
    return "bolt";
  }
  return "default";
}

function shapeForBullet(bullet: Bullet): ShotShape {
  return shapeFor(bullet.style, bullet.ammo);
}

function hover(b: Bullet, terrainY: number): number {
  if (b.ammo === "mine") return terrainY + 0.9;
  if (shapeForBullet(b) === "cloud" || shapeForBullet(b) === "frost") {
    return terrainY + 4 + b.radius * 0.15;
  }
  return terrainY + 3.2;
}

function shotScale(shape: ShotShape, radius: number): number {
  const multiplier =
    shape === "cloud" || shape === "frost"
      ? 1
      : shape === "bomb" || shape === "nuke"
        ? 1.25
        : shape === "scatter"
          ? 1.8
          : 2.25;
  return radius * multiplier;
}

function orientX(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.rotateZ(-Math.PI / 2);
  return geometry;
}

function finGeometry(length: number, span: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -length / 2, 0, 0,
        length / 2, 0, 0,
        -length / 2, span, 0,
        -length / 2, 0, 0,
        -length / 2, -span, 0,
        length / 2, 0, 0,
      ],
      3,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const compatible = parts.map((part) => {
    part.deleteAttribute("uv");
    return part.index ? part.toNonIndexed() : part;
  });
  const result = mergeGeometries(compatible, false);
  for (const part of compatible) {
    if (!parts.includes(part)) part.dispose();
  }
  for (const part of parts) part.dispose();
  if (!result) throw new Error("Unable to assemble ordnance geometry");
  result.computeVertexNormals();
  return result;
}

/** Volumetric silhouette, pointing along local +X. */
function makeShapeGeometry(shape: ShotShape): THREE.BufferGeometry {
  switch (shape) {
    case "dart":
      return merge([
        orientX(new THREE.CylinderGeometry(0.13, 0.19, 1.25, 8)),
        orientX(new THREE.ConeGeometry(0.19, 0.55, 8).translate(0, 0.9, 0)),
        finGeometry(0.36, 0.28).translate(-0.55, 0, 0),
      ]);
    case "cruise":
      return merge([
        orientX(new THREE.CylinderGeometry(0.33, 0.38, 1.35, 10)),
        orientX(new THREE.ConeGeometry(0.33, 0.62, 10).translate(0, 0.98, 0)),
        finGeometry(0.58, 0.5).translate(-0.48, 0, 0),
      ]);
    case "scatter":
      return merge([
        orientX(new THREE.CylinderGeometry(0.22, 0.25, 0.84, 8)),
        orientX(new THREE.ConeGeometry(0.22, 0.38, 8).translate(0, 0.59, 0)),
        finGeometry(0.28, 0.34).translate(-0.3, 0, 0),
      ]);
    case "bomb":
      return merge([
        new THREE.SphereGeometry(0.53, 12, 8).scale(1.15, 0.85, 0.85),
        orientX(new THREE.CylinderGeometry(0.18, 0.23, 0.48, 8).translate(0, -0.6, 0)),
        finGeometry(0.42, 0.36).translate(-0.72, 0, 0),
      ]);
    case "nuke":
      return merge([
        orientX(new THREE.CylinderGeometry(0.48, 0.58, 1.65, 12)),
        orientX(new THREE.ConeGeometry(0.48, 0.78, 12).translate(0, 1.2, 0)),
        finGeometry(0.72, 0.72).translate(-0.65, 0, 0),
      ]);
    case "bolt":
      return merge([
        orientX(new THREE.CapsuleGeometry(0.14, 1.05, 4, 8)),
        orientX(new THREE.ConeGeometry(0.14, 0.4, 8).translate(0, 0.72, 0)),
      ]);
    case "pierce":
      return merge([
        orientX(new THREE.CylinderGeometry(0.11, 0.16, 1.48, 8)),
        orientX(new THREE.ConeGeometry(0.11, 0.68, 8).translate(0, 1.08, 0)),
      ]);
    case "heavy":
      return merge([
        orientX(new THREE.CapsuleGeometry(0.3, 1.15, 4, 10)),
        orientX(new THREE.ConeGeometry(0.3, 0.5, 10).translate(0, 0.9, 0)),
      ]);
    case "frost":
      return new THREE.DodecahedronGeometry(0.95, 1);
    case "cloud":
      return merge([
        new THREE.IcosahedronGeometry(0.86, 1),
        new THREE.IcosahedronGeometry(0.62, 1).translate(0.56, 0.15, 0),
        new THREE.IcosahedronGeometry(0.55, 1).translate(-0.42, -0.22, 0.18),
      ]);
    case "mine":
      return merge([
        new THREE.IcosahedronGeometry(0.57, 1),
        new THREE.CylinderGeometry(0.11, 0.11, 1.55, 6).rotateX(Math.PI / 2),
        new THREE.CylinderGeometry(0.11, 0.11, 1.55, 6).rotateZ(Math.PI / 2),
      ]);
    default:
      return merge([
        orientX(new THREE.CylinderGeometry(0.26, 0.3, 1.1, 9)),
        orientX(new THREE.ConeGeometry(0.26, 0.48, 9).translate(0, 0.78, 0)),
        finGeometry(0.42, 0.38).translate(-0.42, 0, 0),
      ]);
  }
}

function makeInstanced(
  geom: THREE.BufferGeometry,
  mat: THREE.Material,
  cap: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geom, mat, cap);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.setColorAt(0, _color.setHex(0xffffff));
  return mesh;
}

function writeInstance(
  mesh: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  angle: number,
  orient: boolean,
  color: string,
): void {
  _dummy.position.set(x, y, z);
  _dummy.scale.set(sx, sy, sz);
  if (orient) {
    _dir.set(Math.cos(angle), 0, Math.sin(angle));
    if (_dir.lengthSq() > 1e-8) {
      _dir.normalize();
      _dummy.quaternion.setFromUnitVectors(_axisX, _dir);
    } else {
      _dummy.quaternion.identity();
    }
  } else {
    _dummy.quaternion.identity();
  }
  _dummy.updateMatrix();
  mesh.setMatrixAt(i, _dummy.matrix);
  _color.set(color);
  mesh.setColorAt(i, _color);
}

function hideFrom(mesh: THREE.InstancedMesh, start: number, cap: number): void {
  _dummy.position.set(0, -999, 0);
  _dummy.scale.setScalar(0);
  _dummy.quaternion.identity();
  _dummy.updateMatrix();
  for (let i = start; i < cap; i++) mesh.setMatrixAt(i, _dummy.matrix);
  mesh.count = start;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function createProjectileLayer(
  maxShots: number,
  _art: OrdnanceArtKit | null = null,
): LayerHandle {
  const shapes: ShotShape[] = [
    "dart", "cruise", "scatter", "bomb", "nuke", "bolt",
    "pierce", "heavy", "frost", "cloud", "mine", "default",
  ];
  const geometries = new Map<ShotShape, THREE.BufferGeometry>();
  const meshes = new Map<ShotShape, THREE.InstancedMesh>();
  for (const shape of shapes) {
    const cloud = shape === "cloud" || shape === "frost";
    const bolt = shape === "bolt" || shape === "pierce" || shape === "heavy";
    const geometry = makeShapeGeometry(shape);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: cloud ? 0.05 : bolt ? 0.16 : 0.58,
      roughness: cloud ? 0.72 : bolt ? 0.2 : 0.3,
      emissive: 0xffffff,
      emissiveIntensity: cloud ? 0.24 : bolt ? 0.42 : 0.18,
      envMapIntensity: cloud ? 0.1 : 0.3,
      transparent: cloud,
      opacity: cloud ? 0.72 : 1,
      depthWrite: !cloud,
    });
    geometries.set(shape, geometry);
    const mesh = makeInstanced(geometry, material, maxShots);
    mesh.name = `shot-${shape}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.set(shape, mesh);
  }

  const trailGeom = new THREE.CylinderGeometry(0.08, 0.28, 1, 6, 1, true);
  trailGeom.rotateZ(-Math.PI / 2);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const trails = makeInstanced(trailGeom, trailMat, maxShots);
  const prevX = new Float32Array(maxShots);
  const prevY = new Float32Array(maxShots);

  const group = new THREE.Group();
  group.add(...meshes.values(), trails);

  return {
    mesh: group,
    sync(state: GameState, _camera?: THREE.Camera) {
      const map = state.map;
      const n = new Map<ShotShape, number>(shapes.map((shape) => [shape, 0]));
      let tN = 0;
      for (let bi = 0; bi < state.bullets.length; bi++) {
        const b = state.bullets[bi]!;
        if (!b.alive) continue;
        const shape = shapeForBullet(b);
        const count = n.get(shape)!;
        if (count >= maxShots) continue;
        const h = hover(b, sculptedHeight(map, b.x, b.y));
        const pos = engineToThree(b.x, b.y, h);
        const s = Math.max(1.2, b.radius * (b.drawScale || 1));
        const cloud = shape === "cloud" || shape === "frost";
        const mine = shape === "mine";
        const scale = cloud ? Math.max(s, b.radius) : shotScale(shape, s);
        writeInstance(
          meshes.get(shape)!,
          count,
          pos.x,
          pos.y,
          pos.z,
          scale,
          scale,
          scale,
          b.angle,
          !cloud && !mine && shape !== "bomb" && shape !== "nuke",
          b.color,
        );
        n.set(shape, count + 1);
        if (!mine && !cloud && tN < maxShots) {
          const px = prevX[bi] || b.x;
          const py = prevY[bi] || b.y;
          const dx = b.x - px;
          const dy = b.y - py;
          const len = Math.hypot(dx, dy);
          if (len > 0.8) {
            const mid = engineToThree(
              (b.x + px) * 0.5,
              (b.y + py) * 0.5,
              h,
            );
            writeInstance(
              trails,
              tN,
              mid.x,
              mid.y,
              mid.z,
              Math.min(28, len * 1.15),
              s * 0.45,
              s * 0.45,
              Math.atan2(dy, dx),
              true,
              b.color,
            );
            tN += 1;
          }
          prevX[bi] = b.x;
          prevY[bi] = b.y;
        }
      }
      for (const shape of shapes) hideFrom(meshes.get(shape)!, n.get(shape)!, maxShots);
      hideFrom(trails, tN, maxShots);
    },
    dispose() {
      for (const geometry of geometries.values()) geometry.dispose();
      for (const mesh of meshes.values()) (mesh.material as THREE.Material).dispose();
      trailGeom.dispose();
      trailMat.dispose();
    },
  };
}

function makeLootRing(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.92, 40),
    new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = "lootRing";
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

export function createPickupLayer(
  maxPickups: number,
  _art: OrdnanceArtKit | null = null,
): LayerHandle {
  const group = new THREE.Group();
  const slots: THREE.Group[] = [];
  for (let i = 0; i < maxPickups; i++) {
    const slot = new THREE.Group();
    slot.name = `pickup${i}`;
    slot.visible = false;
    slot.add(makeLootRing());
    group.add(slot);
    slots.push(slot);
  }

  return {
    mesh: group,
    sync(state: GameState) {
      const map = state.map;
      const player = getPlayer(state);
      for (let i = 0; i < maxPickups; i++) {
        const pk = state.pickups[i];
        const slot = slots[i]!;
        if (!pk?.alive) {
          slot.visible = false;
          continue;
        }
        const eligible = !!player && player.weapons.indexOf(pk.weaponId) >= 1;
        const h = sculptedHeight(map, pk.x, pk.y) + 7 + Math.sin(pk.bob) * 2;
        const pos = engineToThree(pk.x, pk.y, h);
        slot.position.set(pos.x, pos.y, pos.z);
        slot.visible = true;
        const ring = slot.getObjectByName("lootRing") as THREE.Mesh;
        const pulse = 1.05 + Math.sin(pk.bob * 2) * 0.12;
        ring.scale.setScalar(PICKUP_WORLD * 0.62 * pulse);
        ring.visible = eligible;
        const ringMat = ring.material as THREE.MeshBasicMaterial;
        ringMat.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(pk.bob * 2));
        let icon = slot.getObjectByName("icon") as THREE.Mesh | undefined;
        if (!icon || icon.userData.weaponId !== pk.weaponId) {
          if (icon) {
            slot.remove(icon);
            icon.geometry.dispose();
            (icon.material as THREE.Material).dispose();
          }
          const weapon = WEAPONS.find((candidate) => candidate.id === pk.weaponId);
          const shape = shapeFor(weapon?.style, weapon?.ammo ?? "special");
          icon = new THREE.Mesh(
            makeShapeGeometry(shape),
            new THREE.MeshStandardMaterial({
              color: 0xffffff,
              metalness: shape === "cloud" || shape === "frost" ? 0.1 : 0.6,
              roughness: shape === "cloud" || shape === "frost" ? 0.7 : 0.28,
              emissive: 0xffffff,
              emissiveIntensity: 0.28,
              transparent: shape === "cloud" || shape === "frost",
              opacity: 1,
            }),
          );
          icon.name = "icon";
          icon.userData.weaponId = pk.weaponId;
          icon.castShadow = true;
          icon.receiveShadow = true;
          icon.scale.setScalar(13);
          slot.add(icon);
        }
        icon.visible = true;
        icon.rotation.y = pk.bob * 1.2;
        const iconMat = icon.material as THREE.MeshStandardMaterial;
        iconMat.transparent = true;
        iconMat.opacity = eligible ? 1 : 0.42;
      }
    },
    dispose() {
      for (const slot of slots) {
        slot.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        });
      }
    },
  };
}
