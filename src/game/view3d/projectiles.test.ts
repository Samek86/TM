import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import type { Bullet, GameState, Pickup } from "@/game/engine";
import { createPickupLayer, createProjectileLayer } from "./projectiles";
import type { WeaponModelKit } from "./weaponModels";

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

function model(name: string): THREE.Group {
  const root = new THREE.Group();
  root.name = name;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x8ba4b0, metalness: 0.8 }),
  );
  mesh.castShadow = true;
  root.add(mesh);
  return root;
}

function models(ids: number[]): WeaponModelKit {
  const bodies: WeaponModelKit["bodies"] = {};
  const shots: WeaponModelKit["shots"] = {};
  for (const id of ids) {
    bodies[id] = model(`body-${id}`);
    shots[id] = model(`shot-${id}`);
  }
  return { bodies, shots };
}

describe("projectiles", () => {
  it("builds a pooled layer for authored GLB shot models", () => {
    const layer = createProjectileLayer(8);
    expect(layer.mesh.type).toBe("Group");
    const slot = layer.mesh.getObjectByName("shot0") as THREE.Group;
    expect(slot.type).toBe("Group");
    expect(slot.visible).toBe(false);
    layer.dispose();
  });

  it("builds a 3D weapon mesh for a live field pickup", () => {
    const layer = createPickupLayer(4, models([12]));
    layer.sync(miniState({ pickups: [pickup({ weaponId: 12 })] }));
    const slot = layer.mesh.getObjectByName("pickup0") as THREE.Object3D;
    const icon = slot.getObjectByName("icon") as THREE.Mesh;
    const ring = slot.getObjectByName("lootRing") as THREE.Object3D;
    expect(slot.visible).toBe(true);
    expect(icon.name).toBe("icon");
    const mesh = icon.children[0] as THREE.Mesh;
    expect(
      (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial,
    ).toBe(true);
    expect(mesh.castShadow).toBe(true);
    expect(ring.visible).toBe(true);
    layer.dispose();
  });

  it("dims a field pickup the local craft cannot stock", () => {
    const layer = createPickupLayer(2, models([8]));
    layer.sync(
      miniState({
        pickups: [pickup({ weaponId: 8 })],
        weaponIds: [1, 12],
      }),
    );
    const slot = layer.mesh.getObjectByName("pickup0") as THREE.Object3D;
    const icon = slot.getObjectByName("icon") as THREE.Group;
    const ring = slot.getObjectByName("lootRing") as THREE.Object3D;
    expect(slot.visible).toBe(true);
    expect(ring.visible).toBe(false);
    expect(
      ((icon.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial)
        .opacity,
    ).toBeLessThan(0.7);
    layer.dispose();
  });

  it("hides a dead pickup", () => {
    const layer = createPickupLayer(2, models([12]));
    layer.sync(
      miniState({ pickups: [pickup({ alive: false, weaponId: 12 })] }),
    );
    const card = layer.mesh.getObjectByName("pickup0") as THREE.Mesh;
    expect(card.visible).toBe(false);
    layer.dispose();
  });

  it("uses an authored model instead of a supplied shot card", () => {
    const layer = createProjectileLayer(4, models([12]));
    layer.sync(miniState({ bullets: [bullet({ weaponId: 12 })] }));
    const slot = layer.mesh.getObjectByName("shot0") as THREE.Group;
    expect(slot.visible).toBe(true);
    expect(slot.children[0]?.name).toBe("shot-12");
    layer.dispose();
  });

  it("assigns the matching authored shot model to each weapon id", () => {
    const layer = createProjectileLayer(6, models([12, 15, 2, 11, 20, 10]));
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
    for (const [index, id] of [12, 15, 2, 11, 20, 10].entries()) {
      const slot = layer.mesh.getObjectByName(`shot${index}`) as THREE.Group;
      expect(slot.visible).toBe(true);
      expect(slot.children[0]?.name).toBe(`shot-${id}`);
    }
    layer.dispose();
  });
});
