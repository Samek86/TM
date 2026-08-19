import * as THREE from "three";
import { WEAPONS } from "@/data/weapons";

export type OrdnanceArtKit = {
  bodies: Partial<Record<number, THREE.Texture[]>>;
  shots: Partial<Record<number, THREE.Texture[]>>;
  items: THREE.Texture[];
};

/** Every traveling projectile has a painted 16-way facing sequence. Mines stay put. */
export const ORIENTED_WEAPON_IDS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
]);

export function shotYawFrameIndex(angle: number, frameCount: number): number {
  const count = Math.max(1, frameCount);
  const turn = Math.PI * 2;
  const normalized = ((angle % turn) + turn) % turn;
  return Math.round((normalized / turn) * count) % count;
}

async function loadPaintedTexture(path: string): Promise<THREE.Texture> {
  const texture = await new THREE.TextureLoader().loadAsync(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  return texture;
}

/** Painted weapon heroes for the 3D world; never uses legacy SPR pixels. */
export async function loadOrdnanceArt(): Promise<OrdnanceArtKit> {
  const kit: OrdnanceArtKit = { bodies: {}, shots: {}, items: [] };
  await Promise.all(
    WEAPONS.map(async (weapon) => {
      const id = String(weapon.id).padStart(2, "0");
      const [body, shot] = await Promise.all([
        loadPaintedTexture(`/assets/weapons/${id}/hero.png`),
        ORIENTED_WEAPON_IDS.has(weapon.id)
          ? Promise.all(
              Array.from({ length: 16 }, (_, frame) =>
                loadPaintedTexture(
                  `/assets/weapons/${id}/yaw_${String(frame).padStart(2, "0")}.png`,
                ),
              ),
            )
          : loadPaintedTexture(`/assets/weapons/${id}/shot.png`).then(
              (texture) => [texture],
            ),
      ]);
      kit.bodies[weapon.id] = [body];
      kit.shots[weapon.id] = shot;
    }),
  );
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
