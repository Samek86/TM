import * as THREE from "three";
import { WEAPONS } from "@/data/weapons";

export type OrdnanceArtKit = {
  bodies: Partial<Record<number, THREE.Texture[]>>;
  shots: Partial<Record<number, THREE.Texture[]>>;
  /** Looping lightning-mist sphere (crackle frames, not yaw). */
  clouds?: Partial<Record<number, THREE.Texture[]>>;
  items: THREE.Texture[];
};

/** Killers EM-Gun painted storm sphere. `cloud_00.png` … */
export const STORM_CLOUD_WEAPON_ID = 3;
export const STORM_CLOUD_FRAME_COUNT = 6;

export function stormCloudFramePath(index: number): string {
  return `/assets/weapons/03/cloud_${String(index).padStart(2, "0")}.png`;
}

/** Every traveling projectile has a painted 16-way facing sequence. Mines stay put. */
export const ORIENTED_WEAPON_IDS = new Set([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
]);

/**
 * Engine heading painted in `yaw_00` (0 = nose east / +X).
 * Several missile sheets were authored nose-left, so they need a π flip
 * before the card is yawed onto the flight vector.
 */
export const SHOT_BASE_HEADING: Readonly<Record<number, number>> = {
  13: Math.PI,
  14: Math.PI,
  15: Math.PI,
};

export function shotBaseHeading(weaponId: number): number {
  return SHOT_BASE_HEADING[weaponId] ?? 0;
}

/** Mesh yaw so the painted nose tracks `flightAngle` (engine, Y-down). */
export function shotCardHeading(weaponId: number, flightAngle: number): number {
  return flightAngle - shotBaseHeading(weaponId);
}

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

async function loadStormCloudSheet(): Promise<THREE.Texture[] | null> {
  try {
    const frames = await Promise.all(
      Array.from({ length: STORM_CLOUD_FRAME_COUNT }, (_, i) =>
        loadPaintedTexture(stormCloudFramePath(i)).then((texture) => {
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          texture.anisotropy = 1;
          return texture;
        }),
      ),
    );
    return frames.length ? frames : null;
  } catch {
    return null;
  }
}

/** Painted weapon heroes for the 3D world. Storm uses the G lightning-mist sphere. */
export async function loadOrdnanceArt(): Promise<OrdnanceArtKit> {
  const kit: OrdnanceArtKit = { bodies: {}, shots: {}, clouds: {}, items: [] };
  const storm = loadStormCloudSheet();
  await Promise.all([
    ...WEAPONS.map(async (weapon) => {
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
    storm.then((frames) => {
      if (frames?.length) kit.clouds![STORM_CLOUD_WEAPON_ID] = frames;
    }),
  ]);
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
  for (const frames of Object.values(kit.clouds ?? {})) {
    for (const tex of frames ?? []) drop(tex);
  }
  for (const tex of kit.items) drop(tex);
}
