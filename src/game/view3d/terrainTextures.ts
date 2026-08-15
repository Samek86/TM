import * as THREE from "three";
import { biomeForMapId, type BiomeId } from "@/game/terrainStyle";

export type TerrainLayer = "ground" | "high" | "cliff" | "ramp";

export type TerrainKit = {
  biome: BiomeId;
  maps: Record<TerrainLayer, THREE.Texture>;
  normals: Partial<Record<TerrainLayer, THREE.Texture>>;
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
    const maps = Object.fromEntries(entries) as TerrainKit["maps"];
    const normals: TerrainKit["normals"] = {};
    for (const layer of LAYERS) {
      const n = makeNormalFromAlbedo(maps[layer]);
      if (n) normals[layer] = n;
    }
    return { biome, maps, normals };
  } catch (err) {
    console.warn("[terrain] texture kit skip", err);
    return null;
  }
}

const TINT: Record<
  Exclude<BiomeId, "default">,
  Record<TerrainLayer, number>
> = {
  jungle: {
    ground: 0x3a5a28,
    high: 0xe8d98a,
    cliff: 0x4a3c34,
    ramp: 0xffd27a,
  },
  desert: {
    ground: 0xb88848,
    high: 0xffe8b0,
    cliff: 0x6a4a30,
    ramp: 0xffc96a,
  },
  outpost: {
    ground: 0x4a5058,
    high: 0xc8d0d8,
    cliff: 0x2a2e34,
    ramp: 0xe8b060,
  },
};

export function createTerrainMaterials(kit: TerrainKit | null): THREE.Material[] {
  const biome: Exclude<BiomeId, "default"> =
    kit?.biome === "desert" || kit?.biome === "outpost" ? kit.biome : "jungle";
  const tint = TINT[biome];
  const roughness: Record<TerrainLayer, number> = {
    ground: 0.94,
    high: 0.82,
    cliff: 0.68,
    ramp: 0.88,
  };
  return LAYERS.map((layer) => {
    const map = kit?.maps[layer];
    const nrm = kit?.normals[layer];
    return new THREE.MeshStandardMaterial({
      map: map ?? null,
      normalMap: nrm ?? null,
      normalScale: new THREE.Vector2(1.4, 1.4),
      color: tint[layer],
      roughness: roughness[layer],
      metalness: layer === "cliff" ? 0.08 : 0.02,
      envMapIntensity: 0.35,
      vertexColors: true,
      emissive: layer === "ramp" ? 0x3a2208 : 0x000000,
      emissiveIntensity: layer === "ramp" ? 0.22 : 0,
    });
  });
}

export function disposeTerrainKit(kit: TerrainKit | null): void {
  if (!kit) return;
  for (const tex of Object.values(kit.maps)) tex.dispose();
  for (const tex of Object.values(kit.normals)) tex?.dispose();
}

/** Sobel normal map from an albedo so cliffs and turf pick up light. */
export function makeNormalFromAlbedo(tex: THREE.Texture): THREE.Texture | null {
  const img = tex.image as CanvasImageSource | undefined;
  if (!img || typeof document === "undefined") return null;
  const w = "width" in img ? Number(img.width) : 0;
  const h = "height" in img ? Number(img.height) : 0;
  if (w < 8 || h < 8) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);
  const s = src.data;
  const d = dst.data;
  const lum = (i: number) =>
    (s[i]! * 0.299 + s[i + 1]! * 0.587 + s[i + 2]! * 0.114) / 255;
  const at = (x: number, y: number) => {
    const xx = ((x % w) + w) % w;
    const yy = ((y % h) + h) % h;
    return lum((yy * w + xx) * 4);
  };
  const strength = 3.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        -at(x - 1, y - 1) -
        2 * at(x - 1, y) -
        at(x - 1, y + 1) +
        at(x + 1, y - 1) +
        2 * at(x + 1, y) +
        at(x + 1, y + 1);
      const dy =
        -at(x - 1, y - 1) -
        2 * at(x, y - 1) -
        at(x + 1, y - 1) +
        at(x - 1, y + 1) +
        2 * at(x, y + 1) +
        at(x + 1, y + 1);
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      const o = (y * w + x) * 4;
      d[o] = (nx * inv * 0.5 + 0.5) * 255;
      d[o + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[o + 2] = (nz * inv * 0.5 + 0.5) * 255;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(dst, 0, 0);
  const nrm = new THREE.CanvasTexture(canvas);
  nrm.wrapS = THREE.RepeatWrapping;
  nrm.wrapT = THREE.RepeatWrapping;
  nrm.colorSpace = THREE.NoColorSpace;
  nrm.anisotropy = 4;
  nrm.needsUpdate = true;
  return nrm;
}
