import * as THREE from "three";
import type { VultureId } from "@/data/weapons";

export type CraftArtKit = Partial<Record<VultureId, THREE.Texture>>;

const IDS: VultureId[] = ["born_armor", "killers_pot", "sorcerer"];

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
      const canvas = keyBlackToAlpha(img);
      const tex = new THREE.CanvasTexture(canvas);
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
      try {
        kit[id] = await loadKeyed(`/assets/crafts/${id}/hero.jpg`);
      } catch (err) {
        console.warn("[craft-art] skip", id, err);
      }
    }),
  );
  return kit;
}

export function disposeCraftArt(kit: CraftArtKit): void {
  for (const tex of Object.values(kit)) tex?.dispose();
}
