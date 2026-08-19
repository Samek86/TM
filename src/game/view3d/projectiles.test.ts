import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import type { Bullet, GameState, Pickup } from "@/game/engine";
import {
  createPickupLayer,
  createProjectileLayer,
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

  it("selects a different painted yaw frame as a missile changes heading", () => {
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
    layer.sync(miniState({ bullets: [bullet({ angle: Math.PI })] }));
    expect((card.material as THREE.MeshBasicMaterial).map).toBe(frames[8]);
    expect(Math.abs(card.rotation.z)).toBe(0);
    layer.dispose();
  });

  it("wraps heading angles through the sixteen-way frame sequence", () => {
    expect(shotYawFrameIndex(0, 16)).toBe(0);
    expect(shotYawFrameIndex(Math.PI / 2, 16)).toBe(4);
    expect(shotYawFrameIndex(Math.PI, 16)).toBe(8);
    expect(shotYawFrameIndex(-Math.PI / 2, 16)).toBe(12);
  });

  it("compensates padded painted shots while capping heavy ordnance", () => {
    expect(shotWorldSize(12)).toBeCloseTo(16);
    expect(shotWorldSize(13)).toBeCloseTo(16);
    expect(shotWorldSize(19)).toBeCloseTo(16);
    expect(shotWorldSize(14)).toBeCloseTo(22);
    expect(shotWorldSize(11)).toBeCloseTo(22);
    expect(shotWorldSize(15)).toBeCloseTo(34);
    expect(shotWorldSize(16)).toBeLessThanOrEqual(42);
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
});
