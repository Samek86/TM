import * as THREE from "three";
import { biomeForMapId, type BiomeId } from "@/game/terrainStyle";

export type TerrainLayer = "ground" | "high" | "cliff" | "ramp";

export type TerrainKit = {
  biome: BiomeId;
  maps: Record<TerrainLayer, THREE.Texture>;
  normals: Partial<Record<TerrainLayer, THREE.Texture>>;
  /** Mean linear luminance per layer, so height blending stays unbiased. */
  luma: Record<TerrainLayer, number>;
};

const DEFAULT_LUMA = 0.25;

/** World units covered by one texture tile. Geometry UVs must match. */
export const TERRAIN_TILE = 120;

/** Slabs need room; a tight tile turns the rock map into cobblestone. */
const CLIFF_TILE = TERRAIN_TILE * 0.85;

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

/**
 * Divide out each map's own shading gradient. A photo that is a shade
 * brighter in the middle turns into a visible grid once it tiles across a
 * hillside, and no amount of blending in the shader hides that.
 */
export function flattenTiling(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as CanvasImageSource | undefined;
  if (!img || typeof document === "undefined") return tex;
  const w = "width" in img ? Number(img.width) : 0;
  const h = "height" in img ? Number(img.height) : 0;
  if (w < 64 || h < 64) return tex;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const fctx = full.getContext("2d");
  if (!fctx) return tex;
  fctx.drawImage(img, 0, 0);
  const src = fctx.getImageData(0, 0, w, h);

  const low = 16;
  const small = document.createElement("canvas");
  small.width = low;
  small.height = low;
  const sctx = small.getContext("2d");
  if (!sctx) return tex;
  sctx.drawImage(img, 0, 0, low, low);
  const lowData = sctx.getImageData(0, 0, low, low).data;
  const lumOf = (i: number) =>
    Math.max(
      1,
      lowData[i]! * 0.299 + lowData[i + 1]! * 0.587 + lowData[i + 2]! * 0.114,
    );
  let mean = 0;
  for (let i = 0; i < lowData.length; i += 4) mean += lumOf(i);
  mean /= low * low;

  const wrap = (v: number) => ((v % low) + low) % low;
  const sampleLow = (fx: number, fy: number) => {
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = lumOf((wrap(y0) * low + wrap(x0)) * 4);
    const b = lumOf((wrap(y0) * low + wrap(x0 + 1)) * 4);
    const c = lumOf((wrap(y0 + 1) * low + wrap(x0)) * 4);
    const d = lumOf((wrap(y0 + 1) * low + wrap(x0 + 1)) * 4);
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  };

  const px = src.data;
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * low - 0.5;
    for (let x = 0; x < w; x++) {
      const gain = Math.min(
        1.45,
        Math.max(0.68, mean / sampleLow((x / w) * low - 0.5, fy)),
      );
      const o = (y * w + x) * 4;
      px[o] = Math.min(255, px[o]! * gain);
      px[o + 1] = Math.min(255, px[o + 1]! * gain);
      px[o + 2] = Math.min(255, px[o + 2]! * gain);
    }
  }
  fctx.putImageData(src, 0, 0);
  const flat = new THREE.CanvasTexture(full);
  flat.wrapS = THREE.RepeatWrapping;
  flat.wrapT = THREE.RepeatWrapping;
  flat.colorSpace = THREE.SRGBColorSpace;
  flat.anisotropy = 8;
  flat.needsUpdate = true;
  tex.dispose();
  return flat;
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
        return [layer, flattenTiling(tex)] as const;
      }),
    );
    const maps = Object.fromEntries(entries) as TerrainKit["maps"];
    const normals: TerrainKit["normals"] = {};
    const luma = {} as TerrainKit["luma"];
    for (const layer of LAYERS) {
      const n = makeNormalFromAlbedo(maps[layer]);
      if (n) normals[layer] = n;
      luma[layer] = meanLuminance(maps[layer]);
    }
    return { biome, maps, normals, luma };
  } catch (err) {
    console.warn("[terrain] texture kit skip", err);
    return null;
  }
}

/** Near-white so albedo photos keep their own color. Slight bias only. */
const TINT: Record<
  Exclude<BiomeId, "default">,
  Record<TerrainLayer, number>
> = {
  jungle: {
    ground: 0xe4f0d4,
    high: 0xe6e2b8,
    cliff: 0xd8c8a8,
    ramp: 0xe8d4b0,
  },
  desert: {
    ground: 0xf2e4c4,
    high: 0xf8ecd0,
    cliff: 0xefe0c4,
    ramp: 0xf4e2bc,
  },
  outpost: {
    ground: 0xd8dce0,
    high: 0xe8ecee,
    cliff: 0xd4d0c8,
    ramp: 0xe8dcc8,
  },
};

const ROUGHNESS: Record<TerrainLayer, number> = {
  ground: 0.95,
  high: 0.88,
  cliff: 0.72,
  ramp: 0.9,
};

const VERT_PARS = /* glsl */ `
  attribute vec4 aSplat;
  varying vec4 vSplat;
  varying vec3 vTmWorld;
  varying vec3 vTmNormal;
`;

const VERT_BODY = /* glsl */ `
  vSplat = aSplat;
  vTmWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vTmNormal = normalize( mat3( modelMatrix ) * objectNormal );
`;

const FRAG_PARS = /* glsl */ `
  uniform sampler2D tmHigh;
  uniform sampler2D tmCliff;
  uniform sampler2D tmRamp;
  uniform vec3 tmTintGround;
  uniform vec3 tmTintHigh;
  uniform vec3 tmTintCliff;
  uniform vec3 tmTintRamp;
  uniform vec4 tmRoughness;
  uniform vec4 tmLumaMean;
  uniform float tmCliffTile;
  varying vec4 vSplat;
  varying vec3 vTmWorld;
  varying vec3 vTmNormal;

  float tmHash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  }

  float tmNoise( vec2 p ) {
    vec2 i = floor( p );
    vec2 f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( tmHash( i ), tmHash( i + vec2( 1.0, 0.0 ) ), u.x ),
      mix( tmHash( i + vec2( 0.0, 1.0 ) ), tmHash( i + vec2( 1.0, 1.0 ) ), u.x ),
      u.y
    );
  }

  /** Rotating each octave hides the square lattice of the value noise. */
  float tmFbm( vec2 p ) {
    mat2 rot = mat2( 0.80, 0.60, -0.60, 0.80 );
    float v = tmNoise( p ) * 0.55;
    p = rot * p * 2.13;
    v += tmNoise( p ) * 0.30;
    p = rot * p * 2.07;
    v += tmNoise( p ) * 0.15;
    return v;
  }

  /**
   * Height-aware splat: within the blend band the texture with the taller
   * detail wins, so layers interlock along grass and rock instead of a line.
   * Luminance is centered per layer, otherwise the brightest map creeps out.
   */
  vec4 tmHeightBlend( vec4 w, vec4 lum ) {
    vec4 hgt = clamp( lum - tmLumaMean + 0.5, 0.0, 1.0 );
    vec4 s = w * ( 0.7 + 0.6 * hgt );
    float peak = max( max( s.x, s.y ), max( s.z, s.w ) ) - 0.12;
    vec4 b = max( s - peak, 0.0 );
    return b / max( b.x + b.y + b.z + b.w, 1e-5 );
  }

  /** Same map at a rotated second scale — hides the 120-unit tile repeat. */
  vec3 tmVaried( sampler2D tex, vec2 uv, float mixer ) {
    vec3 a = texture2D( tex, uv ).rgb;
    vec3 b = texture2D( tex, vec2( uv.y, -uv.x ) * 0.53 + 7.3 ).rgb;
    return mix( a, b, 0.15 + 0.4 * mixer );
  }

  /** Rock projected on all three axes so steep banks never smear. */
  vec3 tmTriplanar( sampler2D tex, vec3 pos, vec3 nrm, float tile ) {
    vec3 w = pow( abs( nrm ), vec3( 4.0 ) );
    w /= max( w.x + w.y + w.z, 1e-4 );
    return texture2D( tex, pos.zy / tile ).rgb * w.x
      + texture2D( tex, pos.xz / tile ).rgb * w.y
      + texture2D( tex, pos.xy / tile ).rgb * w.z;
  }
`;

const FRAG_MAP = /* glsl */ `
  vec3 tmNrmW = normalize( vTmNormal );
  float tmMacro = tmFbm( vTmWorld.xz * 0.0042 );
  vec3 tmGround = tmVaried( map, vMapUv, tmMacro );
  vec3 tmPlateau = tmVaried( tmHigh, vMapUv, 1.0 - tmMacro );
  vec3 tmRock = tmTriplanar( tmCliff, vTmWorld, tmNrmW, tmCliffTile );
  vec3 tmSlope = tmVaried( tmRamp, vMapUv, tmMacro );
  const vec3 tmLuma = vec3( 0.299, 0.587, 0.114 );
  vec4 tmW = tmHeightBlend(
    vSplat,
    vec4(
      dot( tmGround, tmLuma ),
      dot( tmPlateau, tmLuma ),
      dot( tmRock, tmLuma ),
      dot( tmSlope, tmLuma )
    )
  );
  vec3 tmAlbedo = tmGround * tmTintGround * tmW.x
    + tmPlateau * tmTintHigh * tmW.y
    + tmRock * tmTintCliff * tmW.z
    + tmSlope * tmTintRamp * tmW.w;

  // Large drifting patches keep big flats from reading as one paint fill.
  tmAlbedo *= 0.9 + 0.2 * tmMacro;
  // Photo turf comes back neon once tone mapping lifts it; pulling a little
  // toward its own grey keeps the field readable under bright sun.
  tmAlbedo = mix( vec3( dot( tmAlbedo, tmLuma ) ), tmAlbedo, 0.86 );

  diffuseColor.rgb *= tmAlbedo;
`;

const FRAG_ROUGHNESS = /* glsl */ `
  float roughnessFactor = dot( vSplat, tmRoughness );
`;

const FRAG_NORMAL = /* glsl */ `
  vec3 tmMapN = ( texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0 ) * vSplat.x
    + ( texture2D( tmNormalHigh, vNormalMapUv ).xyz * 2.0 - 1.0 ) * vSplat.y
    + vec3( 0.0, 0.0, 1.0 ) * vSplat.z
    + ( texture2D( tmNormalRamp, vNormalMapUv ).xyz * 2.0 - 1.0 ) * vSplat.w;
  tmMapN = normalize( tmMapN + vec3( 0.0, 0.0, 1e-4 ) );
  tmMapN.xy *= normalScale;
  normal = normalize( tbn * tmMapN );
`;

/**
 * One material for the whole landscape: per-vertex splat weights cross-fade
 * turf, plateau, rock and ramp so layers meet in soft organic bands instead
 * of triangle-shaped patches.
 */
export function createTerrainMaterial(
  kit: TerrainKit | null,
): THREE.MeshStandardMaterial {
  const biome: Exclude<BiomeId, "default"> =
    kit?.biome === "desert" || kit?.biome === "outpost" ? kit.biome : "jungle";
  const tint = TINT[biome];
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: ROUGHNESS.ground,
    metalness: 0.02,
    envMapIntensity: 0.3,
    // Geometry bakes cavity shading into vertex colors.
    vertexColors: true,
  });
  if (!kit) {
    material.color = new THREE.Color(tint.ground);
    return material;
  }

  material.map = kit.maps.ground;
  const blendNormals =
    kit.normals.ground && kit.normals.high && kit.normals.ramp
      ? {
          ground: kit.normals.ground,
          high: kit.normals.high,
          ramp: kit.normals.ramp,
        }
      : null;
  if (blendNormals) {
    material.normalMap = blendNormals.ground;
    material.normalScale = new THREE.Vector2(0.6, 0.6);
  }

  const linear = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tmHigh = { value: kit.maps.high };
    shader.uniforms.tmCliff = { value: kit.maps.cliff };
    shader.uniforms.tmRamp = { value: kit.maps.ramp };
    shader.uniforms.tmTintGround = { value: linear(tint.ground) };
    shader.uniforms.tmTintHigh = { value: linear(tint.high) };
    shader.uniforms.tmTintCliff = { value: linear(tint.cliff) };
    shader.uniforms.tmTintRamp = { value: linear(tint.ramp) };
    shader.uniforms.tmCliffTile = { value: CLIFF_TILE };
    shader.uniforms.tmLumaMean = {
      value: new THREE.Vector4(
        kit.luma.ground,
        kit.luma.high,
        kit.luma.cliff,
        kit.luma.ramp,
      ),
    };
    shader.uniforms.tmRoughness = {
      value: new THREE.Vector4(
        ROUGHNESS.ground,
        ROUGHNESS.high,
        ROUGHNESS.cliff,
        ROUGHNESS.ramp,
      ),
    };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <map_fragment>", FRAG_MAP)
      .replace("#include <roughnessmap_fragment>", FRAG_ROUGHNESS);
    if (blendNormals) {
      shader.uniforms.tmNormalHigh = { value: blendNormals.high };
      shader.uniforms.tmNormalRamp = { value: blendNormals.ramp };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform sampler2D tmNormalHigh;\nuniform sampler2D tmNormalRamp;",
        )
        .replace("#include <normal_fragment_maps>", FRAG_NORMAL);
    }
  };
  material.customProgramCacheKey = () =>
    blendNormals ? "tm-terrain-splat-n" : "tm-terrain-splat";
  return material;
}

export function disposeTerrainKit(kit: TerrainKit | null): void {
  if (!kit) return;
  for (const tex of Object.values(kit.maps)) tex.dispose();
  for (const tex of Object.values(kit.normals)) tex?.dispose();
}

/** Average linear-space luminance of an albedo, sampled from a small copy. */
export function meanLuminance(tex: THREE.Texture): number {
  const img = tex.image as CanvasImageSource | undefined;
  if (!img || typeof document === "undefined") return DEFAULT_LUMA;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return DEFAULT_LUMA;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum +=
      toLinear(data[i]!) * 0.299 +
      toLinear(data[i + 1]!) * 0.587 +
      toLinear(data[i + 2]!) * 0.114;
  }
  const mean = sum / (size * size);
  return mean > 0 ? mean : DEFAULT_LUMA;
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
