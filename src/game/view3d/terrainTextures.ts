import * as THREE from "three";
import { biomeForMapId, type BiomeId } from "@/game/terrainStyle";

export type TerrainLayer = "ground" | "high" | "cliff" | "ramp";

export type TerrainKit = {
  biome: BiomeId;
  maps: Record<TerrainLayer, THREE.Texture>;
};

const LAYERS: TerrainLayer[] = ["ground", "high", "cliff", "ramp"];

function prepare(tex: THREE.Texture): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function loadOne(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => resolve(prepare(t)), undefined, reject);
  });
}

export function biomeFolder(mapId: string): Exclude<BiomeId, "default"> {
  const id = biomeForMapId(mapId).id;
  return id === "default" ? "jungle" : id;
}

export async function loadTerrainKit(mapId: string): Promise<TerrainKit | null> {
  const biome = biomeFolder(mapId);
  try {
    const entries = await Promise.all(
      LAYERS.map(async (layer) => {
        const tex = await loadOne(`/terrain/${biome}/${layer}.jpg`);
        return [layer, tex] as const;
      }),
    );
    return { biome, maps: Object.fromEntries(entries) as TerrainKit["maps"] };
  } catch (err) {
    console.warn("[terrain] texture kit skip", err);
    return null;
  }
}

export function createTerrainMaterials(kit: TerrainKit | null): THREE.Material[] {
  const roughness: Record<TerrainLayer, number> = {
    ground: 0.92,
    high: 0.88,
    cliff: 0.72,
    ramp: 0.9,
  };
  return LAYERS.map((layer) => {
    const map = kit?.maps[layer];
    return new THREE.MeshStandardMaterial({
      map: map ?? null,
      color: map ? 0xffffff : 0x445544,
      roughness: roughness[layer],
      metalness: 0.04,
      envMapIntensity: 0.35,
    });
  });
}

export function disposeTerrainKit(kit: TerrainKit | null): void {
  if (!kit) return;
  for (const tex of Object.values(kit.maps)) tex.dispose();
}
