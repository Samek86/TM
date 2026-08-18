import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import type { Bullet, GameState, Pickup } from "@/game/engine";
import { createPickupLayer, createProjectileLayer } from "./projectiles";

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

describe("projectiles", () => {
  it("builds instanced, shadow-casting volumetric shot layers", () => {
    const layer = createProjectileLayer(8);
    expect(layer.mesh.type).toBe("Group");
    const dart = layer.mesh.getObjectByName("shot-dart") as THREE.InstancedMesh;
    expect(dart.isInstancedMesh).toBe(true);
    expect(dart.castShadow).toBe(true);
    expect(dart.geometry.type).not.toBe("PlaneGeometry");
    layer.dispose();
  });

  it("builds a 3D weapon mesh for a live field pickup", () => {
    const tex = new THREE.Texture();
    const layer = createPickupLayer(4, {
      bodies: { 12: [tex] },
      shots: {},
      items: [],
    });
    layer.sync(miniState({ pickups: [pickup({ weaponId: 12 })] }));
    const slot = layer.mesh.getObjectByName("pickup0") as THREE.Object3D;
    const icon = slot.getObjectByName("icon") as THREE.Mesh;
    const ring = slot.getObjectByName("lootRing") as THREE.Object3D;
    expect(slot.visible).toBe(true);
    expect(icon.geometry.type).not.toBe("PlaneGeometry");
    expect((icon.material as THREE.MeshStandardMaterial).isMeshStandardMaterial).toBe(true);
    expect(icon.castShadow).toBe(true);
    expect(ring.visible).toBe(true);
    layer.dispose();
  });

  it("dims a field pickup the local craft cannot stock", () => {
    const tex = new THREE.Texture();
    const layer = createPickupLayer(2, {
      bodies: { 8: [tex] },
      shots: {},
      items: [],
    });
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
    expect((icon.material as THREE.MeshStandardMaterial).opacity).toBeLessThan(0.7);
    layer.dispose();
  });

  it("hides a dead pickup", () => {
    const tex = new THREE.Texture();
    const layer = createPickupLayer(2, {
      bodies: { 12: [tex] },
      shots: {},
      items: [],
    });
    layer.sync(
      miniState({ pickups: [pickup({ alive: false, weaponId: 12 })] }),
    );
    const card = layer.mesh.getObjectByName("pickup0") as THREE.Mesh;
    expect(card.visible).toBe(false);
    layer.dispose();
  });

  it("uses a volumetric dart instead of a supplied shot card", () => {
    const tex = new THREE.Texture();
    const layer = createProjectileLayer(4, {
      bodies: {},
      shots: { 12: [tex] },
      items: [],
    });
    layer.sync(miniState({ bullets: [bullet({ weaponId: 12 })] }));
    const dart = layer.mesh.getObjectByName("shot-dart") as THREE.InstancedMesh;
    expect(dart.count).toBe(1);
    expect(dart.geometry.type).not.toBe("PlaneGeometry");
    expect((dart.material as THREE.MeshStandardMaterial).map).toBeNull();
    layer.dispose();
  });

  it("assigns distinct 3D shot layers to weapon families", () => {
    const layer = createProjectileLayer(4);
    layer.sync(
      miniState({
        bullets: [
          bullet({ style: "dart", ammo: "missile" }),
          bullet({ style: "cruise", ammo: "missile" }),
          bullet({ style: "pierce", ammo: "special" }),
          bullet({ style: "lob", ammo: "explosive" }),
          bullet({ style: "frost", ammo: "cloud" }),
          bullet({ style: "default", ammo: "mine" }),
        ],
      }),
    );
    for (const name of ["dart", "cruise", "pierce", "bomb", "frost", "mine"]) {
      const mesh = layer.mesh.getObjectByName(`shot-${name}`) as THREE.InstancedMesh;
      expect(mesh.count).toBe(1);
    }
    layer.dispose();
  });
});
