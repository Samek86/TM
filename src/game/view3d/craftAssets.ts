import * as THREE from "three";
import type { VultureId } from "@/data/weapons";

/**
 * How in-match crafts are drawn.
 *
 * - "gltf": use `model.glb` where present, sprites everywhere else. Preferred:
 *   real geometry yaws continuously instead of stepping through 16 frames.
 * - "art": always the baked yaw sprite sheets.
 * - "model": always the procedural block-built crafts.
 */
export const CRAFT_RENDER_MODE: "gltf" | "art" | "model" = "gltf";

/**
 * Highest frame count the loader probes for. The renderer uses the sheet's
 * actual `frames.length` as the direction count, so raising this only takes
 * effect once the extra `yaw_NN.jpg` files exist.
 */
export const CRAFT_YAW_DIRS = 16;

export type CraftArtKit = Partial<Record<VultureId, THREE.Texture[]>>;

const IDS: VultureId[] = ["born_armor", "killers_pot", "sorcerer"];

export function yawFrameSample(
  angle: number,
  dirs = CRAFT_YAW_DIRS,
): { index: number; residual: number } {
  const tau = Math.PI * 2;
  const n = Math.max(1, dirs);
  const u = ((angle % tau) + tau) % tau;
  const step = tau / n;
  const rounded = Math.round(u / step);
  return {
    index: ((rounded % n) + n) % n,
    residual: u - rounded * step,
  };
}

export function yawFrameIndex(angle: number, dirs = CRAFT_YAW_DIRS): number {
  return yawFrameSample(angle, dirs).index;
}

export function yawFrameResidual(angle: number, dirs = CRAFT_YAW_DIRS): number {
  return yawFrameSample(angle, dirs).residual;
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

/**
 * Leading run of `yaw_NN.jpg`. A short sheet is fine — the renderer treats
 * `frames.length` as the direction count — but it has to be a prefix, so any
 * frame loaded past the first gap is dropped.
 */
async function loadYawFrames(id: VultureId): Promise<THREE.Texture[]> {
  const slots = await Promise.all(
    Array.from({ length: CRAFT_YAW_DIRS }, (_, i) =>
      loadKeyed(
        `/assets/crafts/${id}/yaw_${String(i).padStart(2, "0")}.jpg`,
      ).catch(() => null),
    ),
  );
  const gap = slots.findIndex((tex) => tex === null);
  const end = gap === -1 ? slots.length : gap;
  for (let i = end; i < slots.length; i++) slots[i]?.dispose();
  return slots.slice(0, end) as THREE.Texture[];
}

/** Sheets for the crafts that still need them; `ids` skips ones with a GLB. */
export async function loadCraftArt(
  ids: readonly VultureId[] = IDS,
): Promise<CraftArtKit> {
  const kit: CraftArtKit = {};
  if (CRAFT_RENDER_MODE === "model") return kit;
  await Promise.all(
    ids.map(async (id) => {
      const frames = await loadYawFrames(id);
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
