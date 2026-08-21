import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import type { Bullet, GameState, Pickup } from "@/game/engine";
import {
  cardScaleForOpaque,
  cloudCrackleFrame,
  createPickupLayer,
  createProjectileLayer,
  projectileWorldSize,
  shotWorldSize,
} from "./projectiles";
import {
  ORIENTED_WEAPON_IDS,
  shotYawFrameIndex,
  type OrdnanceArtKit,
} from "./ordnanceArt";

function miniMap(): MapDef {
  return {
    id: "t",
    name: "t",
    theme: "",
    description: "",
    originalFiles: [],
    width: 90,
    height: 90,
    cols: 3,
    rows: 3,
    elevation: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ramps: [false, false, false, false, false, false, false, false, false],
    ground: "#0",
    high: "#0",
    cliff: "#0",
    ramp: "#0",
    accent: "#0",
    cellSize: 30,
    features: [],
  };
}

function miniState(partial: {
  pickups?: Pickup[];
  bullets?: Bullet[];
  weaponIds?: number[];
}): GameState {
  return {
    map: miniMap(),
    pickups: partial.pickups ?? [],
    bullets: partial.bullets ?? [],
    pilots: [
      {
        isPlayer: true,
        weapons: partial.weaponIds ?? [1, 12],
      },
    ],
  } as GameState;
}

function pickup(over: Partial<Pickup> = {}): Pickup {
  return {
    alive: true,
    x: 40,
    y: 40,
    weaponId: 12,
    bob: 0,
    respawnIn: 0,
    ...over,
  };
}

function bullet(over: Partial<Bullet> = {}): Bullet {
  return {
    alive: true,
    x: 40,
    y: 40,
    vx: 10,
    vy: 0,
    angle: 0,
    life: 1,
    maxLife: 1,
    damage: 1,
    ownerId: "p",
    weaponId: 12,
    color: "#f80",
    radius: 6,
    baseRadius: 6,
    growTo: 0,
    tick: 0,
    touch: {},
    catcher: false,
    ammo: "missile",
    pierceLeft: 0,
    splashR: 0,
    splashMul: 0,
    drawScale: 1,
    style: "dart",
    homing: 0,
    ...over,
  };
}

function art(ids: number[]): OrdnanceArtKit {
  const bodies: OrdnanceArtKit["bodies"] = {};
  const shots: OrdnanceArtKit["shots"] = {};
  for (const id of ids) {
    bodies[id] = [new THREE.Texture()];
    shots[id] = [new THREE.Texture()];
  }
  return { bodies, shots, items: [] };
}

describe("projectiles", () => {
  it("builds a pooled layer for painted shot cards", () => {
    const layer = createProjectileLayer(8);
    expect(layer.mesh.type).toBe("Group");
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect(card.geometry.type).toBe("PlaneGeometry");
    expect(card.visible).toBe(false);
    layer.dispose();
  });

  it("shows a painted weapon card for a live field pickup", () => {
    const kit = art([12]);
    const layer = createPickupLayer(4, kit);
    layer.sync(miniState({ pickups: [pickup({ weaponId: 12 })] }));
    const slot = layer.mesh.getObjectByName("pickup0") as THREE.Object3D;
    const icon = slot.getObjectByName("icon") as THREE.Mesh;
    const ring = slot.getObjectByName("lootRing") as THREE.Object3D;
    expect(slot.visible).toBe(true);
    expect((icon.material as THREE.MeshBasicMaterial).map).toBe(
      kit.bodies[12]?.[0],
    );
    expect(ring.visible).toBe(true);
    layer.dispose();
  });

  it("dims a field pickup the local craft cannot stock", () => {
    const layer = createPickupLayer(2, art([8]));
    layer.sync(
      miniState({
        pickups: [pickup({ weaponId: 8 })],
        weaponIds: [1, 12],
      }),
    );
    const slot = layer.mesh.getObjectByName("pickup0") as THREE.Object3D;
    const icon = slot.getObjectByName("icon") as THREE.Mesh;
    const ring = slot.getObjectByName("lootRing") as THREE.Object3D;
    expect(slot.visible).toBe(true);
    expect(ring.visible).toBe(false);
    expect((icon.material as THREE.MeshBasicMaterial).opacity).toBeLessThan(
      0.7,
    );
    layer.dispose();
  });

  it("hides a dead pickup", () => {
    const layer = createPickupLayer(2, art([12]));
    layer.sync(
      miniState({ pickups: [pickup({ alive: false, weaponId: 12 })] }),
    );
    const card = layer.mesh.getObjectByName("pickup0") as THREE.Mesh;
    expect(card.visible).toBe(false);
    layer.dispose();
  });

  it("uses a painted shot card for every live projectile", () => {
    const kit = art([12]);
    const layer = createProjectileLayer(4, kit);
    layer.sync(miniState({ bullets: [bullet({ weaponId: 12 })] }));
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect(card.visible).toBe(true);
    expect((card.material as THREE.MeshBasicMaterial).map).toBe(
      kit.shots[12]?.[0],
    );
    expect((card.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    expect((card.material as THREE.MeshBasicMaterial).depthWrite).toBe(false);
    layer.dispose();
  });

  it("yaws the side-view card with the missile's flight heading", () => {
    const frames = Array.from({ length: 16 }, () => new THREE.Texture());
    const kit: OrdnanceArtKit = {
      bodies: {},
      shots: { 12: frames },
      items: [],
    };
    const layer = createProjectileLayer(2, kit);
    layer.sync(miniState({ bullets: [bullet({ angle: 0 })] }));
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect((card.material as THREE.MeshBasicMaterial).map).toBe(frames[0]);
    expect(card.rotation.z).toBeCloseTo(0);
    layer.sync(miniState({ bullets: [bullet({ angle: Math.PI / 2 })] }));
    expect((card.material as THREE.MeshBasicMaterial).map).toBe(frames[0]);
    expect(card.rotation.z).toBeCloseTo(-Math.PI / 2);
    layer.dispose();
  });

  it("spins a west-facing Tomahawk so it flies nose-first", () => {
    const frames = Array.from({ length: 16 }, () => new THREE.Texture());
    const kit: OrdnanceArtKit = {
      bodies: {},
      shots: { 15: frames },
      items: [],
    };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [bullet({ weaponId: 15, style: "cruise", angle: 0 })],
      }),
    );
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect((card.material as THREE.MeshBasicMaterial).map).toBe(frames[0]);
    expect(Math.abs(card.rotation.z)).toBeCloseTo(Math.PI);
    layer.dispose();
  });

  it("wraps heading angles through the sixteen-way frame sequence", () => {
    expect(shotYawFrameIndex(0, 16)).toBe(0);
    expect(shotYawFrameIndex(Math.PI / 2, 16)).toBe(4);
    expect(shotYawFrameIndex(Math.PI, 16)).toBe(8);
    expect(shotYawFrameIndex(-Math.PI / 2, 16)).toBe(12);
  });

  it("compensates padded painted shots while capping heavy ordnance", () => {
    // Missiles are 1.5× their table length so the silhouette reads in play.
    expect(shotWorldSize(12)).toBeCloseTo(24);
    expect(shotWorldSize(13)).toBeCloseTo(24);
    expect(shotWorldSize(19)).toBeCloseTo(24);
    expect(shotWorldSize(14)).toBeCloseTo(33);
    expect(shotWorldSize(11)).toBeCloseTo(22);
    expect(shotWorldSize(15)).toBeCloseTo(42);
    expect(shotWorldSize(16)).toBeLessThanOrEqual(42);
  });

  it("leaves chunky non-laser shots at their table world length", () => {
    expect(shotWorldSize(1)).toBeCloseTo(12);
    expect(shotWorldSize(8)).toBeCloseTo(20);
    expect(shotWorldSize(11)).toBeCloseTo(22);
  });

  it("enlarges laser-like bolts the same 1.5× as missiles", () => {
    expect(shotWorldSize(6)).toBeCloseTo(24);
    expect(shotWorldSize(17)).toBeCloseTo(24);
    expect(shotWorldSize(2)).toBeCloseTo(21);
    expect(shotWorldSize(4)).toBeCloseTo(18);
  });

  it("maps world length onto the opaque silhouette, not the padded frame", () => {
    // Laser yaw art is 512² with a ~180px bolt. The card must grow so that
    // bolt, not the empty frame, is `world` units long.
    const scale = cardScaleForOpaque(16, 512, 512, 180, 102);
    expect(scale.x).toBeCloseTo((16 * 512) / 180);
    expect(scale.y).toBeCloseTo((16 * 512) / 180);
    const filled = cardScaleForOpaque(16, 256, 256, 227, 58);
    expect(filled.x).toBeCloseTo((16 * 256) / 227);
  });

  it("applies opaque-span scale to a live laser card", () => {
    const texture = new THREE.Texture();
    texture.image = { width: 512, height: 512 };
    texture.userData.opaqueSpan = { w: 180, h: 102 };
    const kit: OrdnanceArtKit = { bodies: {}, shots: { 6: [texture] }, items: [] };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [bullet({ weaponId: 6, ammo: "beam", drawScale: 1 })],
      }),
    );
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    const world = shotWorldSize(6);
    expect(card.visible).toBe(true);
    expect(card.scale.x).toBeCloseTo((world * 512) / 180);
    layer.dispose();
  });

  it("does not opaque-fit fat cruise cards", () => {
    const texture = new THREE.Texture();
    texture.image = { width: 512, height: 512 };
    texture.userData.opaqueSpan = { w: 239, h: 109 };
    const kit: OrdnanceArtKit = {
      bodies: {},
      shots: { 15: [texture] },
      items: [],
    };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [
          bullet({
            weaponId: 15,
            ammo: "missile",
            style: "cruise",
            drawScale: 1,
          }),
        ],
      }),
    );
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect(card.scale.x).toBeCloseTo(shotWorldSize(15));
    layer.dispose();
  });

  it("registers every traveling projectile for alpha yaw sprites", () => {
    for (const id of [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]) {
      expect(ORIENTED_WEAPON_IDS.has(id)).toBe(true);
    }
    expect(ORIENTED_WEAPON_IDS.has(10)).toBe(false);
  });

  it("assigns the matching painted card to each weapon id", () => {
    const ids = [12, 15, 2, 11, 20, 10];
    const kit = art(ids);
    const layer = createProjectileLayer(6, kit);
    layer.sync(
      miniState({
        bullets: [
          bullet({ weaponId: 12, style: "dart", ammo: "missile" }),
          bullet({ weaponId: 15, style: "cruise", ammo: "missile" }),
          bullet({ weaponId: 2, style: "pierce", ammo: "special" }),
          bullet({ weaponId: 11, style: "lob", ammo: "explosive" }),
          bullet({ weaponId: 20, style: "frost", ammo: "cloud" }),
          bullet({ weaponId: 10, style: "default", ammo: "mine" }),
        ],
      }),
    );
    for (const [index, id] of ids.entries()) {
      const card = layer.mesh.getObjectByName(`shot${index}`) as THREE.Mesh;
      expect(card.visible).toBe(true);
      expect((card.material as THREE.MeshBasicMaterial).map).toBe(
        kit.shots[id]?.[0],
      );
    }
    layer.dispose();
  });

  it("sizes storm and frost cards to the live engine cloud diameter", () => {
    expect(projectileWorldSize({ weaponId: 3, ammo: "cloud", style: "storm", radius: 40 })).toBe(80);
    expect(projectileWorldSize({ weaponId: 20, ammo: "cloud", style: "frost", radius: 70 })).toBe(140);
    expect(projectileWorldSize({ weaponId: 12, ammo: "missile", style: "dart", radius: 6, drawScale: 1 })).toBeCloseTo(24);
  });

  it("opaque-fits EM-Gun storm so the lightning glyph fills the cloud diameter", () => {
    const texture = new THREE.Texture();
    texture.image = { width: 512, height: 512 };
    texture.userData.opaqueSpan = { w: 208, h: 147 };
    const kit: OrdnanceArtKit = { bodies: {}, shots: { 3: [texture] }, items: [] };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [
          bullet({
            weaponId: 3,
            ammo: "cloud",
            style: "storm",
            radius: 40,
            drawScale: 1,
          }),
        ],
      }),
    );
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect(card.visible).toBe(true);
    expect(card.scale.x).toBeCloseTo((80 * 512) / 208);
    expect(card.scale.y).toBeCloseTo((80 * 512) / 208);
    layer.dispose();
  });

  it("plays the painted storm sphere instead of the yaw missile card", () => {
    const yaw = new THREE.Texture();
    const crackle = [
      new THREE.Texture(),
      new THREE.Texture(),
      new THREE.Texture(),
      new THREE.Texture(),
    ];
    const kit: OrdnanceArtKit = {
      bodies: {},
      shots: { 3: [yaw] },
      clouds: { 3: crackle },
      items: [],
    };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [
          bullet({
            weaponId: 3,
            ammo: "cloud",
            style: "storm",
            radius: 8,
            baseRadius: 8,
            growTo: 45,
            angle: 1.2,
            maxLife: 2,
            life: 2 - 0.09,
          }),
        ],
      }),
    );
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect(card.visible).toBe(true);
    expect((card.material as THREE.MeshBasicMaterial).map).toBe(crackle[1]);
    expect(card.rotation.z).toBeCloseTo(0);
    layer.dispose();
  });

  it("crackles storm frames from flight age at 12 fps and loops", () => {
    expect(cloudCrackleFrame(0, 8)).toBe(0);
    expect(cloudCrackleFrame(1 / 12, 8)).toBe(1);
    expect(cloudCrackleFrame(8 / 12, 8)).toBe(0);
  });

  it("does not opaque-fit the storm sphere sheet during play", () => {
    const sphere = new THREE.Texture();
    sphere.image = { width: 1024, height: 1024 };
    sphere.userData.opaqueSpan = { w: 200, h: 200 };
    const kit: OrdnanceArtKit = {
      bodies: {},
      shots: { 3: [new THREE.Texture()] },
      clouds: { 3: [sphere] },
      items: [],
    };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [
          bullet({
            weaponId: 3,
            ammo: "cloud",
            style: "storm",
            radius: 20,
            drawScale: 1,
          }),
        ],
      }),
    );
    const card = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect(card.scale.x).toBeCloseTo(40);
    expect((card.material as THREE.MeshBasicMaterial).alphaTest).toBeCloseTo(
      0.05,
    );
    layer.dispose();
  });

  it("draws storm spheres dimmer than other shots", () => {
    const sphere = new THREE.Texture();
    sphere.image = { width: 512, height: 512 };
    const kit: OrdnanceArtKit = {
      bodies: {},
      shots: { 12: [new THREE.Texture()] },
      clouds: { 3: [sphere] },
      items: [],
    };
    const layer = createProjectileLayer(2, kit);
    layer.sync(
      miniState({
        bullets: [
          bullet({
            weaponId: 3,
            ammo: "cloud",
            style: "storm",
            radius: 20,
          }),
        ],
      }),
    );
    const storm = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect((storm.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(
      0.5,
    );
    layer.sync(
      miniState({
        bullets: [bullet({ weaponId: 12, style: "dart", ammo: "missile" })],
      }),
    );
    const dart = layer.mesh.getObjectByName("shot0") as THREE.Mesh;
    expect((dart.material as THREE.MeshBasicMaterial).opacity).toBe(1);
    layer.dispose();
  });
});
