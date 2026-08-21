import * as THREE from "three";
import { getWeaponById } from "@/data/weapons";
import { getPlayer, type Bullet, type GameState } from "@/game/engine";
import { sculptedHeight } from "@/game/heightfield";
import { opaqueBounds } from "@/game/missileDraw";
import { engineToThree } from "./coords";
import {
  shotCardHeading,
  type OrdnanceArtKit,
} from "./ordnanceArt";

export type LayerHandle = {
  mesh: THREE.Object3D;
  sync(state: GameState, camera?: THREE.Camera): void;
  dispose(): void;
};

const PICKUP_WORLD = 52;

/**
 * Visual-only world lengths. The painted frames include transparent padding,
 * so these compensate for their visible silhouette on phone-sized screens.
 * Cruise/nuclear ordnance may approach a craft size but never exceed it.
 *
 * Slim shots (missiles, beams, poke/pierce bolts) get an extra 1.5× — their
 * painted glyphs sit in a lot of empty frame and otherwise read as specks.
 */
export const MISSILE_VISUAL_MUL = 1.5;

export const SHOT_WORLD_BY_WEAPON: Readonly<Record<number, number>> = {
  1: 12,
  2: 14,
  3: 16,
  4: 12,
  5: 14,
  6: 16,
  7: 14,
  8: 20,
  9: 14,
  10: 14,
  11: 22,
  12: 16,
  13: 16,
  14: 22,
  15: 34,
  16: 38,
  17: 16,
  18: 18,
  19: 16,
  20: 20,
  21: 14,
};

function isSlimShot(weaponId: number): boolean {
  const w = getWeaponById(weaponId);
  return (
    w.ammo === "missile" ||
    w.ammo === "beam" ||
    w.style === "pierce" ||
    w.style === "poke" ||
    w.style === "twin_beam"
  );
}

function isCloudBullet(b: {
  ammo?: string;
  style?: string;
}): boolean {
  return b.ammo === "cloud" || b.style === "storm" || b.style === "frost";
}

/** Padded energy/dart/cloud art — fit the glyph, not the empty 512² frame. */
function needsOpaqueFit(weaponId: number): boolean {
  const w = getWeaponById(weaponId);
  return (
    w.ammo === "beam" ||
    w.ammo === "cloud" ||
    w.style === "pierce" ||
    w.style === "poke" ||
    w.style === "twin_beam" ||
    w.style === "dart" ||
    w.style === "scatter" ||
    w.style === "storm" ||
    w.style === "frost"
  );
}

export const STORM_CRACKLE_FPS = 12;
/** Storm sphere fill — keep terrain readable through overlapping shots. */
export const STORM_CLOUD_OPACITY = 0.5;

/** Looping lightning sizzle. `age` is seconds since the cloud spawned. */
export function cloudCrackleFrame(
  age: number,
  frameCount: number,
  fps = STORM_CRACKLE_FPS,
): number {
  const n = Math.max(1, frameCount);
  return Math.floor(Math.max(0, age) * fps) % n;
}

export function shotWorldSize(weaponId: number, drawScale = 1): number {
  const visualMul = isSlimShot(weaponId) ? MISSILE_VISUAL_MUL : 1;
  return Math.min(
    42,
    (SHOT_WORLD_BY_WEAPON[weaponId] ?? 12) *
      visualMul *
      Math.max(0.82, drawScale),
  );
}

/** Clouds fill their engine hit radius; other shots keep the painted table. */
export function projectileWorldSize(b: {
  weaponId: number;
  radius: number;
  ammo?: string;
  style?: string;
  drawScale?: number;
}): number {
  if (isCloudBullet(b)) return Math.max(8, b.radius * 2);
  return shotWorldSize(b.weaponId, b.drawScale || 1);
}

/** Scale a 1×1 card so `world` is the opaque silhouette's longest side. */
export function cardScaleForOpaque(
  world: number,
  imageW: number,
  imageH: number,
  opaqueW: number,
  opaqueH: number,
): { x: number; y: number } {
  const largest = Math.max(opaqueW, opaqueH, 1);
  return {
    x: (world * Math.max(1, imageW)) / largest,
    y: (world * Math.max(1, imageH)) / largest,
  };
}

type OpaqueSpan = { w: number; h: number };

function measureImageOpaque(image: unknown): OpaqueSpan | null {
  if (typeof document === "undefined" || !image) return null;
  const img = image as { width?: number; height?: number };
  const width = Math.max(0, Number(img.width) || 0);
  const height = Math.max(0, Number(img.height) || 0);
  if (!width || !height) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image as CanvasImageSource, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    const box = opaqueBounds(data, width, height);
    if (!box) return null;
    return { w: box.w, h: box.h };
  } catch {
    return null;
  }
}

function textureOpaqueSpan(texture: THREE.Texture, fallback: OpaqueSpan): OpaqueSpan {
  const cached = texture.userData.opaqueSpan as OpaqueSpan | undefined;
  if (cached && cached.w > 0 && cached.h > 0) return cached;
  const measured = measureImageOpaque(texture.image);
  const span = measured ?? fallback;
  texture.userData.opaqueSpan = span;
  return span;
}

function makeCard(name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  mesh.name = name;
  mesh.visible = false;
  return mesh;
}

function setCard(
  mesh: THREE.Mesh,
  texture: THREE.Texture,
  world: number,
  fitOpaque = false,
  opacity = 1,
): void {
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.opacity = opacity;
  if (material.map !== texture) {
    material.map = texture;
    material.needsUpdate = true;
  }
  const image = texture.image as
    { width?: number; height?: number } | undefined;
  const width = Math.max(1, Number(image?.width) || 1);
  const height = Math.max(1, Number(image?.height) || 1);
  const span = fitOpaque
    ? textureOpaqueSpan(texture, { w: width, h: height })
    : { w: width, h: height };
  const scale = cardScaleForOpaque(world, width, height, span.w, span.h);
  mesh.scale.set(scale.x, scale.y, 1);
  mesh.visible = true;
}

/** Flat on the world plane: painted volume is visible from the play camera. */
function layFlat(mesh: THREE.Object3D, heading = 0): void {
  mesh.rotation.set(-Math.PI / 2, 0, -heading);
}

function hover(b: Bullet, terrainY: number): number {
  if (b.ammo === "mine") return terrainY + 0.9;
  if (b.style === "storm" || b.style === "frost" || b.ammo === "cloud") {
    return terrainY + 4 + b.radius * 0.15;
  }
  return terrainY + 3.2;
}

export function createProjectileLayer(
  maxShots: number,
  art: OrdnanceArtKit | null = null,
): LayerHandle {
  const group = new THREE.Group();
  const cards = Array.from({ length: maxShots }, (_, index) => {
    const card = makeCard(`shot${index}`);
    group.add(card);
    return card;
  });

  return {
    mesh: group,
    sync(state: GameState, _camera?: THREE.Camera) {
      const map = state.map;
      let shotN = 0;
      for (const card of cards) card.visible = false;
      for (let bi = 0; bi < state.bullets.length; bi++) {
        const b = state.bullets[bi]!;
        if (!b.alive) continue;
        if (shotN >= maxShots) continue;
        const cloudFrames = art?.clouds?.[b.weaponId];
        const frames = art?.shots[b.weaponId];
        // Storm uses the painted lightning-mist sphere, crackling by age.
        // Other shots keep a single side-view frame yawed onto the flight vector.
        const cloud = isCloudBullet(b);
        const age = Math.max(0, b.maxLife - b.life);
        const texture = cloudFrames?.length
          ? cloudFrames[cloudCrackleFrame(age, cloudFrames.length)]
          : frames?.[0];
        if (!texture) continue;
        const h = hover(b, sculptedHeight(map, b.x, b.y));
        const pos = engineToThree(b.x, b.y, h);
        const card = cards[shotN]!;
        card.position.set(pos.x, pos.y, pos.z);
        setCard(
          card,
          texture,
          projectileWorldSize(b),
          // Sphere sheet already fills the frame. Measuring 1024² RGBA
          // with getImageData on first show stalls the play thread.
          !!cloudFrames?.length ? false : needsOpaqueFit(b.weaponId),
          b.style === "storm" ? STORM_CLOUD_OPACITY : 1,
        );
        layFlat(card, cloud ? 0 : shotCardHeading(b.weaponId, b.angle));
        shotN += 1;
      }
    },
    dispose() {
      for (const card of cards) {
        card.geometry.dispose();
        (card.material as THREE.Material).dispose();
      }
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
  art: OrdnanceArtKit | null = null,
): LayerHandle {
  const group = new THREE.Group();
  const slots: THREE.Group[] = [];
  for (let i = 0; i < maxPickups; i++) {
    const slot = new THREE.Group();
    slot.name = `pickup${i}`;
    slot.visible = false;
    slot.add(makeCard("icon"));
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
        const icon = slot.getObjectByName("icon") as THREE.Mesh;
        const texture = art?.bodies[pk.weaponId]?.[0];
        if (texture) {
          setCard(icon, texture, PICKUP_WORLD);
          layFlat(icon, pk.bob * 0.35);
          const material = icon.material as THREE.MeshBasicMaterial;
          material.opacity = eligible ? 1 : 0.42;
        } else {
          icon.visible = false;
        }
      }
    },
    dispose() {
      for (const slot of slots) {
        const icon = slot.getObjectByName("icon") as THREE.Mesh | undefined;
        icon?.geometry.dispose();
        (icon?.material as THREE.Material | undefined)?.dispose();
        const ring = slot.getObjectByName("lootRing") as THREE.Mesh | undefined;
        ring?.geometry.dispose();
        (ring?.material as THREE.Material | undefined)?.dispose();
      }
    },
  };
}
