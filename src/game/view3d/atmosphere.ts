import * as THREE from "three";
import type { BiomeId } from "@/game/terrainStyle";
import { PLAY_LOOK } from "./look";

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SKY_FRAG = /* glsl */ `
  varying vec3 vWorld;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  void main() {
    vec3 n = normalize(vWorld);
    float h = n.y;
    vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.72, h));
    col = mix(uGround, col, smoothstep(-0.35, 0.08, h));
    float sun = pow(max(dot(n, normalize(uSunDir)), 0.0), 72.0);
    float haze = pow(max(dot(n, normalize(uSunDir)), 0.0), 8.0);
    col += uSunColor * sun * ${PLAY_LOOK.skySunDisc.toFixed(2)};
    col += uSunColor * haze * ${PLAY_LOOK.skySunHaze.toFixed(2)};
    gl_FragColor = vec4(col, 1.0);
  }
`;

const PALETTE: Record<
  Exclude<BiomeId, "default">,
  { zenith: number; horizon: number; ground: number; sun: number }
> = {
  jungle: {
    zenith: 0x4ea0d9,
    horizon: 0xc9e4c4,
    ground: 0x2a3a22,
    sun: 0xfff0c8,
  },
  desert: {
    zenith: 0x6eb3e0,
    horizon: 0xf3d5a2,
    ground: 0x8a6a3a,
    sun: 0xffe0a0,
  },
  outpost: {
    zenith: 0x3a5070,
    horizon: 0x8a9bb0,
    ground: 0x1a1e24,
    sun: 0xdde6f5,
  },
};

/** Haze color where land meets sky — fog must match it to hide the horizon. */
export function horizonColor(biome: BiomeId): THREE.Color {
  const pal = PALETTE[biome === "default" ? "jungle" : biome];
  return new THREE.Color(pal.horizon);
}

export function createSkyDome(
  biome: BiomeId,
  sunDir: THREE.Vector3,
): THREE.Mesh {
  const pal = PALETTE[biome === "default" ? "jungle" : biome];
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(pal.zenith) },
      uHorizon: { value: new THREE.Color(pal.horizon) },
      uGround: { value: new THREE.Color(pal.ground) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(pal.sun) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 20), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = "sky";
  return mesh;
}
