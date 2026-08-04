/**
 * Load game assets — crafted strategic maps + original SPR/SFX.
 * Phase 1: terrain bake + selected craft SPR
 * Phase 2: other craft, shots, FX, weapon bodies
 */
import {
  loadTil,
  mapUrl,
  getMapEntry,
  type TmMap,
  type TmTil,
} from "@/lib/map";
import {
  loadSpr,
  frameToRgba,
  getDefaultPalette,
  type SprSprite,
  type RgbaPalette,
} from "@/lib/spr";
import { sprUrl } from "@/lib/spr/catalog";
import { tilToSprPalette } from "@/lib/spr/tilPalette";
import type { VultureId } from "@/data/weapons";
import { WEAPONS } from "@/data/weapons";
import { getMap, type MapDef } from "@/data/maps";
import {
  buildStylizedTerrain,
  type StylizedTerrain,
} from "@/game/terrainStyle";

export interface TerrainAsset {
  map: TmMap;
  til: TmTil | null;
  tileCache: Map<number, HTMLCanvasElement>;
  tileIndices: Uint16Array;
  tileSize: number;
  style: StylizedTerrain;
}

export type VultureSpriteSet = {
  frames: HTMLCanvasElement[];
  frameCount: number;
};

export type ShotSpriteSet = {
  frames: HTMLCanvasElement[];
  frameCount: number;
};

export type FxSpriteSet = {
  frames: HTMLCanvasElement[];
  frameCount: number;
};

export interface GameAssets {
  terrain: TerrainAsset | null;
  style: StylizedTerrain | null;
  mapDef: MapDef;
  vultures: Partial<Record<VultureId, VultureSpriteSet>>;
  shots: Partial<Record<number, ShotSpriteSet>>;
  weaponBodies: Partial<Record<number, ShotSpriteSet>>;
  explode: FxSpriteSet | null;
  debris: FxSpriteSet | null;
  items: FxSpriteSet | null;
  palette: RgbaPalette;
  /** true when background extras finished */
  extrasReady: boolean;
}

const VULTURE_SPR: Record<VultureId, string> = {
  born_armor: "char1.spr",
  killers_pot: "char2.spr",
  sorcerer: "char3.spr",
};

function rgbaToCanvas(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (ctx) {
    // putImageData needs a stable buffer in some browsers
    const copy = new Uint8ClampedArray(data.length);
    copy.set(data);
    ctx.putImageData(new ImageData(copy, width, height), 0, 0);
  }
  return c;
}

/** Content bounds of opaque pixels (alpha > 8). */
function contentBounds(src: HTMLCanvasElement): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  const ctx = src.getContext("2d");
  if (!ctx) return null;
  const { width: W, height: H } = src;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3]! > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Rebuild craft yaw sheet from original SPR art:
 * 1) Pick the frame closest to facing east (+X) via calibrated map
 * 2) Center-crop that art
 * 3) Supersample-rotate into N clean direction frames
 *
 * Async + yields so loading UI stays responsive (this is the heavy path).
 */
export async function rebakeCraftDirections(
  rawFrames: HTMLCanvasElement[],
  dirCount = 72,
): Promise<VultureSpriteSet> {
  if (!rawFrames.length) {
    return { frames: [], frameCount: 0 };
  }

  // Original sheet: frame 0 ≈ SE (+45° in Y-down atan2); indices advance +angle.
  // East (0°) ≈ frame index -n/8 → for 120 frames, ~105.
  const nRaw = rawFrames.length;
  let eastIdx = Math.round(((-Math.PI / 4) / (Math.PI * 2)) * nRaw);
  eastIdx = ((eastIdx % nRaw) + nRaw) % nRaw;
  // Prefer a horizontal-ish frame near east; scan neighbors for cleaner base
  let best = rawFrames[eastIdx]!;
  let bestScore = -1;
  for (let d = -4; d <= 4; d++) {
    const fr = rawFrames[(eastIdx + d + nRaw) % nRaw]!;
    const b = contentBounds(fr);
    if (!b) continue;
    // Prefer wider-than-tall (side view / east-west) and decent size
    const score = b.w / Math.max(1, b.h) + b.w * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = fr;
    }
  }

  const bounds = contentBounds(best) ?? {
    x: 0,
    y: 0,
    w: best.width,
    h: best.height,
  };
  const pad = 2;
  const srcSize = Math.max(bounds.w, bounds.h) + pad * 2;
  const src = document.createElement("canvas");
  src.width = srcSize;
  src.height = srcSize;
  const sctx = src.getContext("2d");
  if (!sctx) {
    return { frames: rawFrames, frameCount: rawFrames.length };
  }
  sctx.clearRect(0, 0, srcSize, srcSize);
  // Center content; base image faces east after pick
  sctx.drawImage(
    best,
    bounds.x,
    bounds.y,
    bounds.w,
    bounds.h,
    ((srcSize - bounds.w) / 2) | 0,
    ((srcSize - bounds.h) / 2) | 0,
    bounds.w,
    bounds.h,
  );

  // Supersample bake: rotate east-facing art to each yaw
  const outSize = Math.max(48, Math.ceil(srcSize * 1.15));
  const frames: HTMLCanvasElement[] = [];
  const ss = 2; // 2× supersample
  const big = outSize * ss;
  const tmp = document.createElement("canvas");
  tmp.width = big;
  tmp.height = big;
  const tctx = tmp.getContext("2d");
  if (!tctx) {
    return { frames: rawFrames, frameCount: rawFrames.length };
  }

  for (let i = 0; i < dirCount; i++) {
    const ang = (i / dirCount) * Math.PI * 2;
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, big, big);
    tctx.imageSmoothingEnabled = false;
    tctx.translate(big / 2, big / 2);
    tctx.rotate(ang);
    tctx.drawImage(
      src,
      (-srcSize * ss) / 2,
      (-srcSize * ss) / 2,
      srcSize * ss,
      srcSize * ss,
    );

    const out = document.createElement("canvas");
    out.width = outSize;
    out.height = outSize;
    const octx = out.getContext("2d");
    if (octx) {
      octx.imageSmoothingEnabled = true;
      try {
        octx.imageSmoothingQuality = "high";
      } catch {
        /* ignore */
      }
      octx.clearRect(0, 0, outSize, outSize);
      octx.drawImage(tmp, 0, 0, big, big, 0, 0, outSize, outSize);
    }
    frames.push(out);
    // Keep UI responsive during heavy bake
    if ((i & 7) === 7) await yieldFrame();
  }

  return { frames, frameCount: frames.length };
}

export type AssetProgress = (info: { msg: string; pct: number }) => void;

export function bakeTilTile(til: TmTil, tileIndex: number): HTMLCanvasElement {
  const tw = til.tileWidth;
  const th = til.tileHeight;
  const tile = til.tiles[tileIndex] ?? til.tiles[0]!;
  const data = new Uint8ClampedArray(tw * th * 4);
  const pal = til.palette;
  for (let i = 0; i < tw * th; i++) {
    const idx = tile.indices[i]!;
    const p = idx * 4;
    const o = i * 4;
    data[o] = pal[p]!;
    data[o + 1] = pal[p + 1]!;
    data[o + 2] = pal[p + 2]!;
    data[o + 3] = 255;
  }
  return rgbaToCanvas(tw, th, data);
}

export function getCachedTile(
  terrain: TerrainAsset,
  tileIndex: number,
): HTMLCanvasElement | null {
  if (!terrain.til) return null;
  let c = terrain.tileCache.get(tileIndex);
  if (!c) {
    c = bakeTilTile(terrain.til, tileIndex);
    terrain.tileCache.set(tileIndex, c);
  }
  return c;
}

async function loadSprFrames(
  file: string,
  palette: RgbaPalette,
  /** Cap frames for huge yaw sheets if needed (0 = all) */
  maxFrames = 0,
): Promise<ShotSpriteSet | null> {
  try {
    const spr: SprSprite = await loadSpr(sprUrl(file));
    const n =
      maxFrames > 0
        ? Math.min(spr.frames.length, maxFrames)
        : spr.frames.length;
    const frames: HTMLCanvasElement[] = [];
    for (let i = 0; i < n; i++) {
      const fr = spr.frames[i]!;
      const { data, width, height } = frameToRgba(fr, palette);
      frames.push(rgbaToCanvas(width, height, data));
    }
    if (!frames.length) return null;
    return { frames, frameCount: frames.length };
  } catch {
    return null;
  }
}

/**
 * Map facing angle → direction frame index.
 * World/canvas: atan2(dy,dx) with +Y down → 0 = east, +π/2 = south.
 * Rebaked craft sheets: frame 0 faces east, indices advance with +angle.
 */
export function angleToSprFrame(angle: number, frameCount = 72): number {
  const n = Math.max(1, frameCount);
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return Math.round((a / twoPi) * n) % n;
}

/** Try exact client filename only (no multi-variant 404 storm). */
async function loadShotOnce(
  file: string,
  palette: RgbaPalette,
): Promise<ShotSpriteSet | null> {
  return loadSprFrames(file, palette);
}

/**
 * Fast path: terrain + selected craft only.
 * Progress pct range suggested: 8–40 when used inside loadGameAssets.
 */
export async function loadGameAssetsEssential(
  mapId: string,
  vultureId: VultureId,
  onProgress?: AssetProgress,
): Promise<GameAssets> {
  const progress = (msg: string, pct: number) => {
    onProgress?.({ msg, pct });
  };

  const base = getMap(mapId);
  const entry = getMapEntry(mapId);
  let terrain: TerrainAsset | null = null;
  let style: StylizedTerrain | null = null;
  let mapDef = base;
  let sprPalette: RgbaPalette = getDefaultPalette();

  progress("전략 맵 베이크…", 10);
  mapDef = base;
  await yieldFrame();
  style = buildStylizedTerrain(mapDef, mapId);
  await yieldFrame();

  if (entry.tilFile) {
    progress("팔레트 로딩…", 14);
    try {
      const til = await loadTil(mapUrl(entry.tilFile));
      sprPalette = tilToSprPalette(til);
    } catch {
      /* default palette */
    }
  }
  terrain = {
    map: {
      version: 2,
      flags: 0,
      width: mapDef.cols,
      height: mapDef.rows,
      sizeField: 0,
      nameTil: mapId,
      nameBob: "",
      heightmap: new Uint16Array(mapDef.cols * mapDef.rows),
      attrs: new Uint32Array(mapDef.cols * mapDef.rows),
      heightMin: 0,
      heightMax: 1,
    },
    til: null,
    tileCache: new Map(),
    tileIndices: new Uint16Array(mapDef.cols * mapDef.rows),
    tileSize: mapDef.cellSize ?? 20,
    style,
  };

  const vultures: Partial<Record<VultureId, VultureSpriteSet>> = {};
  progress("선택 기체 디코드…", 18);
  try {
    const set = await loadSprFrames(VULTURE_SPR[vultureId], sprPalette);
    progress("선택 기체 방향 시트 생성…", 24);
    if (set) vultures[vultureId] = await rebakeCraftDirections(set.frames, 72);
  } catch (e) {
    console.warn("[assets] vulture spr failed", e);
  }
  progress("필수 에셋 완료", 40);

  return {
    terrain,
    style,
    mapDef,
    vultures,
    shots: {},
    weaponBodies: {},
    explode: null,
    debris: null,
    items: null,
    palette: sprPalette,
    extrasReady: false,
  };
}

/**
 * Remaining craft / shots / FX. Mutates `assets` in place.
 * Progress pct range: 40–90.
 */
export async function loadGameAssetsExtras(
  assets: GameAssets,
  mapId: string,
  vultureId: VultureId,
  onProgress?: AssetProgress,
): Promise<void> {
  const progress = (msg: string, pct: number) => {
    onProgress?.({ msg, pct });
  };
  const palette = assets.palette;

  const others = (
    ["born_armor", "killers_pot", "sorcerer"] as VultureId[]
  ).filter((id) => id !== vultureId);

  for (let i = 0; i < others.length; i++) {
    const id = others[i]!;
    progress(`기체 준비 ${i + 1}/${others.length}…`, 42 + i * 10);
    const set = await loadSprFrames(VULTURE_SPR[id], palette);
    if (set) {
      progress(`기체 방향 시트 ${i + 1}/${others.length}…`, 46 + i * 10);
      assets.vultures[id] = await rebakeCraftDirections(set.frames, 72);
    }
    await yieldFrame();
  }

  progress("샷 스프라이트…", 68);
  const withShot = WEAPONS.filter((w) => w.shotSpr);
  const chunk = 6;
  for (let i = 0; i < withShot.length; i += chunk) {
    const batch = withShot.slice(i, i + chunk);
    await Promise.all(
      batch.map(async (w) => {
        const set = await loadShotOnce(w.shotSpr!, palette);
        if (set) assets.shots[w.id] = set;
      }),
    );
    const pct = 68 + Math.round(((i + chunk) / withShot.length) * 14);
    progress(`샷 스프라이트… (${Math.min(i + chunk, withShot.length)}/${withShot.length})`, Math.min(82, pct));
    await yieldFrame();
  }
  if (!assets.shots[16]) {
    const alt = await loadShotOnce("WP161SHT.SPR", palette);
    if (alt) assets.shots[16] = alt;
  }

  progress("무기·이펙트…", 84);
  await Promise.all([
    ...WEAPONS.filter((w) => w.bodySpr).map(async (w) => {
      const set = await loadShotOnce(w.bodySpr!, palette);
      if (set) assets.weaponBodies[w.id] = set;
    }),
    (async () => {
      assets.explode = await loadSprFrames("ef1.spr", palette);
    })(),
    (async () => {
      assets.debris = await loadSprFrames("piece.spr", palette);
    })(),
    (async () => {
      assets.items = await loadSprFrames("item.spr", palette);
    })(),
  ]);

  assets.extrasReady = true;
  progress("에셋 준비 완료", 90);
  void mapId;
}

/** Full blocking load for match start — essential + extras with progress. */
export async function loadGameAssets(
  mapId: string,
  vultureId: VultureId,
  onProgress?: AssetProgress,
): Promise<GameAssets> {
  const progress: AssetProgress = (info) => onProgress?.(info);
  const assets = await loadGameAssetsEssential(mapId, vultureId, progress);
  await loadGameAssetsExtras(assets, mapId, vultureId, progress);
  return assets;
}
