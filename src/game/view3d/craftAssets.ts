import * as THREE from "three";
import type { VultureId } from "@/data/weapons";

export const CRAFT_YAW_DIRS = 16;

export type CraftArtKit = Partial<Record<VultureId, THREE.Texture[]>>;

const IDS: VultureId[] = ["born_armor", "killers_pot", "sorcerer"];

export function yawFrameIndex(angle: number, dirs = CRAFT_YAW_DIRS): number {
  const tau = Math.PI * 2;
  const u = ((angle % tau) + tau) % tau;
  return Math.round(u / (tau / dirs)) % dirs;
}

function keyBlackToAlpha(img: HTMLImageElement, cut = 22): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const l = 0.299 * p[i]! + 0.587 * p[i + 1]! + 0.114 * p[i + 2]!;
    if (l < cut) {
      p[i + 3] = 0;
    } else if (l < cut + 18) {
      p[i + 3] = Math.round(((l - cut) / 18) * 255);
    }
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function loadKeyed(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tex = new THREE.CanvasTexture(keyBlackToAlpha(img));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      resolve(tex);
    };
    img.onerror = () => reject(new Error(`craft art ${url}`));
    img.src = url;
  });
}

export async function loadCraftArt(): Promise<CraftArtKit> {
  const kit: CraftArtKit = {};
  await Promise.all(
    IDS.map(async (id) => {
      const frames: THREE.Texture[] = [];
      for (let i = 0; i < CRAFT_YAW_DIRS; i++) {
        const n = String(i).padStart(2, "0");
        try {
          frames.push(await loadKeyed(`/assets/crafts/${id}/yaw_${n}.jpg`));
        } catch {
          break;
        }
      }
      if (frames.length === 0) {
        try {
          frames.push(await loadKeyed(`/assets/crafts/${id}/hero.jpg`));
        } catch (err) {
          console.warn("[craft-art] skip", id, err);
        }
      }
      if (frames.length) kit[id] = frames;
    }),
  );
  return kit;
}

export function disposeCraftArt(kit: CraftArtKit): void {
  for (const frames of Object.values(kit)) {
    for (const tex of frames ?? []) tex.dispose();
  }
}
