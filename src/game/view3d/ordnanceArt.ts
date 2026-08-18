import * as THREE from "three";
import {
  FIELD_LOADOUT_WEAPON_IDS,
  WEAPONS,
  type WeaponDef,
} from "@/data/weapons";
import {
  bakeBombCanvas,
  bakeMissileCanvas,
  bakePickupCanvas,
  missileKindFromStyle,
  pickupIconKind,
  pickupTag,
} from "@/game/missileDraw";

export type OrdnanceArtKit = {
  bodies: Partial<Record<number, THREE.Texture[]>>;
  shots: Partial<Record<number, THREE.Texture[]>>;
  items: THREE.Texture[];
};

function texFromCanvas(canvas: HTMLCanvasElement): THREE.Texture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function bakeShot(w: WeaponDef): THREE.Texture {
  if (w.ammo === "explosive" || w.style === "lob" || w.style === "nuke") {
    return texFromCanvas(bakeBombCanvas(w.color, w.style === "nuke"));
  }
  return texFromCanvas(
    bakeMissileCanvas(missileKindFromStyle(w.style), w.color),
  );
}

function bakePickup(w: WeaponDef): THREE.Texture {
  return texFromCanvas(
    bakePickupCanvas(pickupIconKind(w), w.color, pickupTag(w.name)),
  );
}

/** Bake the clean 2D missile drawings. Original SPR is too small to upscale. */
export async function loadOrdnanceArt(): Promise<OrdnanceArtKit> {
  const kit: OrdnanceArtKit = { bodies: {}, shots: {}, items: [] };
  for (const w of WEAPONS) {
    if (FIELD_LOADOUT_WEAPON_IDS.includes(w.id)) {
      kit.bodies[w.id] = [bakePickup(w)];
    }
    if (
      w.ammo === "missile" ||
      w.ammo === "explosive" ||
      w.style === "dart" ||
      w.style === "cruise" ||
      w.style === "scatter" ||
      w.style === "lob" ||
      w.style === "nuke"
    ) {
      kit.shots[w.id] = [bakeShot(w)];
    }
  }
  return kit;
}

export function disposeOrdnanceArt(kit: OrdnanceArtKit): void {
  const seen = new Set<THREE.Texture>();
  const drop = (tex: THREE.Texture) => {
    if (seen.has(tex)) return;
    seen.add(tex);
    tex.dispose();
  };
  for (const frames of Object.values(kit.bodies)) {
    for (const tex of frames ?? []) drop(tex);
  }
  for (const frames of Object.values(kit.shots)) {
    for (const tex of frames ?? []) drop(tex);
  }
  for (const tex of kit.items) drop(tex);
}
