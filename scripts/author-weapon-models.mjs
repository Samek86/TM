/**
 * Generates the authored, multi-part PBR weapon GLBs used by the play view.
 * The source cards are visual references; models are intentionally assembled
 * as separate machined parts (rather than a single low-poly primitive) so
 * their barrels, rails, fins, coils, and housings retain readable depth.
 */
import { mkdir, writeFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
};

const steel = new THREE.MeshStandardMaterial({
  color: 0x38434a,
  metalness: 0.9,
  roughness: 0.3,
});
const dark = new THREE.MeshStandardMaterial({
  color: 0x111820,
  metalness: 0.75,
  roughness: 0.24,
});
const gunmetal = new THREE.MeshStandardMaterial({
  color: 0x58636a,
  metalness: 0.88,
  roughness: 0.34,
});
const brass = new THREE.MeshStandardMaterial({
  color: 0xb78335,
  metalness: 0.85,
  roughness: 0.28,
});
const orange = new THREE.MeshStandardMaterial({
  color: 0xc55b2b,
  metalness: 0.65,
  roughness: 0.34,
});
const cyan = new THREE.MeshStandardMaterial({
  color: 0x1bc9ed,
  metalness: 0.45,
  roughness: 0.18,
  emissive: 0x06759b,
  emissiveIntensity: 1.8,
});
const violet = new THREE.MeshStandardMaterial({
  color: 0x924cff,
  metalness: 0.3,
  roughness: 0.2,
  emissive: 0x3c0875,
  emissiveIntensity: 1.5,
});
const frost = new THREE.MeshStandardMaterial({
  color: 0x9cecff,
  metalness: 0.35,
  roughness: 0.16,
  emissive: 0x155c7b,
  emissiveIntensity: 1.2,
});
const warning = new THREE.MeshStandardMaterial({
  color: 0xe0b62d,
  metalness: 0.55,
  roughness: 0.36,
});

function part(
  group,
  geometry,
  material,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function box(group, size, material, pos, rot = [0, 0, 0], radius = 0.08) {
  return part(
    group,
    new RoundedBoxGeometry(...size, 3, radius),
    material,
    pos,
    rot,
  );
}
function tube(group, radius, length, material, pos, rot = [0, 0, Math.PI / 2]) {
  return part(
    group,
    new THREE.CylinderGeometry(radius, radius, length, 28),
    material,
    pos,
    rot,
  );
}
function cone(group, r1, r2, length, material, pos, rot = [0, 0, Math.PI / 2]) {
  return part(
    group,
    new THREE.CylinderGeometry(r1, r2, length, 28),
    material,
    pos,
    rot,
  );
}
function ring(
  group,
  radius,
  tubeRadius,
  material,
  pos,
  rot = [0, Math.PI / 2, 0],
) {
  return part(
    group,
    new THREE.TorusGeometry(radius, tubeRadius, 10, 32),
    material,
    pos,
    rot,
  );
}
function fin(group, pos, yaw = 0, material = steel) {
  const mesh = box(group, [1.1, 0.08, 0.62], material, pos, [0, yaw, 0], 0.025);
  mesh.rotation.z = yaw;
}
function bolts(group, start, count = 6, spacing = 0.42) {
  for (let i = 0; i < count; i++) {
    const x = start + i * spacing;
    part(group, new THREE.SphereGeometry(0.06, 12, 8), brass, [x, 0.43, 0.48]);
    part(group, new THREE.SphereGeometry(0.06, 12, 8), brass, [x, -0.43, 0.48]);
  }
}

function vulcan() {
  const g = new THREE.Group();
  box(g, [3.2, 1.3, 1.45], dark, [-0.8, 0, 0]);
  box(g, [1.5, 1.65, 1.7], gunmetal, [-2.25, 0, 0]);
  ring(g, 0.87, 0.11, brass, [0.85, 0, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    tube(g, 0.16, 3.15, steel, [1.75, Math.cos(a) * 0.56, Math.sin(a) * 0.56]);
    ring(g, 0.19, 0.04, dark, [3.3, Math.cos(a) * 0.56, Math.sin(a) * 0.56]);
  }
  box(g, [1.2, 0.48, 1.8], steel, [-1.7, -0.93, 0]);
  bolts(g, -2.6, 7);
  return g;
}
function ati() {
  const g = new THREE.Group();
  box(g, [3.4, 1.05, 1.3], gunmetal, [-0.85, 0, 0]);
  box(g, [1.8, 1.35, 1.45], dark, [-2.4, 0, 0]);
  tube(g, 0.31, 4.1, steel, [1.35, 0, 0]);
  tube(g, 0.42, 0.62, brass, [3.28, 0, 0]);
  box(g, [2.7, 0.18, 0.22], warning, [-0.5, 0.64, 0]);
  for (const z of [-0.52, 0.52])
    box(g, [2.1, 0.18, 0.15], steel, [-0.55, 0, z]);
  bolts(g, -2.6, 7);
  return g;
}
function emGun() {
  const g = new THREE.Group();
  box(g, [2.7, 1.25, 1.35], dark, [-1.3, 0, 0]);
  tube(g, 0.32, 3.7, gunmetal, [1.15, 0, 0]);
  for (const x of [-0.25, 0.25, 0.75, 1.25])
    ring(g, 0.55, 0.075, cyan, [x, 0, 0]);
  box(g, [1.5, 0.28, 1.8], steel, [-1.85, -0.72, 0]);
  box(g, [1.4, 0.18, 0.42], violet, [-1.1, 0.7, 0]);
  bolts(g, -2.4, 5);
  return g;
}
function sorcerer() {
  const g = new THREE.Group();
  box(g, [2.7, 1.25, 1.4], dark, [-1.2, 0, 0]);
  for (const y of [-0.38, 0.38]) {
    tube(g, 0.19, 3.45, steel, [1.05, y, 0]);
    ring(g, 0.25, 0.045, violet, [1.05, y, 0]);
  }
  box(g, [1.45, 0.32, 1.9], gunmetal, [-1.8, -0.7, 0]);
  bolts(g, -2.3, 5);
  return g;
}
function energy() {
  const g = new THREE.Group();
  box(g, [2.4, 1.45, 1.5], dark, [-1.15, 0, 0]);
  for (const z of [-0.45, 0.45]) {
    tube(g, 0.26, 3.2, steel, [0.95, 0, z]);
    ring(g, 0.35, 0.07, cyan, [1.15, 0, z]);
  }
  box(g, [1.5, 0.55, 1.7], gunmetal, [-1.9, -0.55, 0]);
  box(g, [1.9, 0.18, 0.32], cyan, [-0.5, 0.78, 0]);
  return g;
}
function bomb() {
  const g = new THREE.Group();
  cone(g, 0.67, 0.56, 3.1, gunmetal, [0, 0, 0]);
  cone(g, 0.22, 0.56, 0.75, dark, [1.9, 0, 0]);
  ring(g, 0.59, 0.08, orange, [-0.62, 0, 0]);
  ring(g, 0.59, 0.08, warning, [0.32, 0, 0]);
  for (let i = 0; i < 4; i++) fin(g, [-1.35, 0, 0], (i * Math.PI) / 2, steel);
  part(g, new THREE.SphereGeometry(0.16, 20, 12), brass, [2.2, 0, 0]);
  return g;
}
function missile(kind) {
  const g = new THREE.Group();
  const body = kind === "tomahawk" ? 4.9 : kind === "tow" ? 4.1 : 3.55;
  const radius = kind === "tomahawk" ? 0.47 : kind === "tow" ? 0.38 : 0.32;
  cone(g, radius, radius * 0.9, body, gunmetal, [0, 0, 0]);
  cone(g, 0.08, radius, 1.15, kind === "stinger" ? orange : steel, [
    body / 2 + 0.55,
    0,
    0,
  ]);
  ring(g, radius + 0.025, 0.06, warning, [-body * 0.12, 0, 0]);
  ring(g, radius + 0.025, 0.045, dark, [-body * 0.38, 0, 0]);
  for (let i = 0; i < 4; i++)
    fin(g, [-body / 2 + 0.35, 0, 0], (i * Math.PI) / 2, steel);
  box(g, [0.8, 0.12, 0.1], cyan, [body * 0.15, 0, radius + 0.03]);
  return g;
}
function projectile(kind) {
  if (kind === "bomb") return bomb();
  if (kind === "stinger" || kind === "tow" || kind === "tomahawk")
    return missile(kind);
  const g = new THREE.Group();
  const color =
    kind === "em-gun"
      ? frost
      : kind === "energy"
        ? cyan
        : kind === "sorcerer-cannon"
          ? violet
          : orange;
  cone(g, 0.22, 0.17, 2.1, gunmetal, [0, 0, 0]);
  cone(g, 0.05, 0.22, 0.62, color, [1.35, 0, 0]);
  ring(g, 0.23, 0.05, color, [-0.35, 0, 0]);
  for (const x of [-0.55, -0.1, 0.35]) ring(g, 0.19, 0.03, steel, [x, 0, 0]);
  return g;
}

const factories = {
  vulcan,
  "ati-gun": ati,
  "em-gun": emGun,
  "sorcerer-cannon": sorcerer,
  energy,
  "fire-bomb": bomb,
  stinger: () => missile("stinger"),
  tow: () => missile("tow"),
  tomahawk: () => missile("tomahawk"),
};

async function exportGlb(scene, destination) {
  const exporter = new GLTFExporter();
  const binary = await exporter.parseAsync(scene, {
    binary: true,
    onlyVisible: true,
  });
  await writeFile(destination, new Uint8Array(binary));
}

for (const [slug, factory] of Object.entries(factories)) {
  const dir = new URL(`../public/assets/weapons/${slug}/`, import.meta.url);
  await mkdir(dir, { recursive: true });
  await exportGlb(factory(), new URL("model.glb", dir));
  await exportGlb(projectile(slug), new URL("shot.glb", dir));
}

// Every revival weapon receives its own authored export.  The later weapons
// are designed from their combat identity rather than inheriting an older
// official-card model: their housings, emitters, payloads, and silhouettes
// deliberately differ at match-camera distance.
function decorated(id, shot = false) {
  const bases = {
    1: "vulcan",
    2: "ati-gun",
    3: "em-gun",
    4: "sorcerer-cannon",
    5: "ati-gun",
    6: "energy",
    7: "energy",
    8: "energy",
    9: "vulcan",
    10: "fire-bomb",
    11: "fire-bomb",
    12: "stinger",
    13: "stinger",
    14: "tow",
    15: "tomahawk",
    16: "fire-bomb",
    17: "energy",
    18: "fire-bomb",
    19: "stinger",
    20: "em-gun",
    21: "sorcerer-cannon",
  };
  const kind = bases[id];
  const g = shot ? projectile(kind) : factories[kind]();
  if (id === 5) {
    tube(g, 0.25, 4.6, brass, [1.1, 0.38, 0]);
    tube(g, 0.25, 4.6, brass, [1.1, -0.38, 0]);
  } else if (id === 6) {
    // Laser Cannon: unmistakable paired aperture rails.
    for (const z of [-0.62, 0.62]) tube(g, 0.13, 4.7, cyan, [1.3, 0, z]);
  } else if (id === 7) {
    // Spiner: rotating energy drum and cyan flywheel.
    ring(g, 0.82, 0.13, cyan, [-0.1, 0, 0]);
    ring(g, 0.62, 0.08, violet, [0.42, 0, 0]);
  } else if (id === 8) {
    // Slayer: heavy, slab-sided energy penetrator.
    box(g, [2.6, 1.15, 1.9], gunmetal, [0.35, 0, 0]);
    cone(g, 0.48, 0.18, 1.25, orange, [2.45, 0, 0]);
  } else if (id === 9) {
    // Paranoid Shooter: offset sensor fork and defensive emitter.
    box(g, [2.2, 0.24, 0.18], cyan, [0.4, 0.86, 0]);
    box(g, [1.1, 0.7, 0.2], steel, [1.3, 0.55, 0]);
  } else if (id === 10) {
    // S-mine: radial proximity spikes, distinct from every bomb.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cone(
        g,
        0.06,
        0.2,
        1.1,
        brass,
        [0, Math.cos(a) * 0.7, Math.sin(a) * 0.7],
        [0, -a, Math.PI / 2],
      );
    }
  } else if (id === 13) {
    // Multi Missiler: three staggered micro-missiles in a launch cradle.
    for (const z of [-0.52, 0, 0.52]) {
      cone(g, 0.11, 0.18, 2.7, warning, [0.2, 0, z]);
      fin(g, [-0.95, 0, z], 0, steel);
    }
  } else if (id === 16) {
    // Burst Apocalypse: oversized warhead with warning belts and arming fins.
    ring(g, 0.83, 0.12, warning, [-0.8, 0, 0]);
    ring(g, 0.83, 0.12, orange, [0.2, 0, 0]);
    for (let i = 0; i < 4; i++) fin(g, [-1.9, 0, 0], (i * Math.PI) / 2, orange);
  } else if (id === 17) {
    // Blazing Beam: hot dual-core emitter.
    for (const z of [-0.26, 0.26]) tube(g, 0.14, 5.2, orange, [1.25, 0, z]);
  } else if (id === 18) {
    // Fire Bault: incandescent napalm pressure cells.
    for (const z of [-0.36, 0.36])
      part(g, new THREE.SphereGeometry(0.36, 24, 16), orange, [-0.1, 0, z]);
  } else if (id === 19) {
    // Burst Launcher: six micro-rocket bores around a compact launcher.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      tube(g, 0.12, 2.7, steel, [0.3, Math.cos(a) * 0.38, Math.sin(a) * 0.38]);
    }
  } else if (id === 20) {
    // Ice Bault: frost crystal caps around a cryogenic core.
    for (const x of [-0.45, 0.15, 0.75]) {
      part(g, new THREE.OctahedronGeometry(0.42, 2), frost, [x, 0, 0]);
    }
  } else if (id === 21) {
    // Lust Cannon: magenta three-prong pulse muzzle.
    for (const y of [-0.42, 0, 0.42]) tube(g, 0.12, 3.9, violet, [1.1, y, 0]);
    ring(g, 0.64, 0.1, violet, [0.95, 0, 0]);
  }
  return g;
}

for (let id = 1; id <= 21; id++) {
  const dir = new URL(
    `../public/assets/weapons/${String(id).padStart(2, "0")}/`,
    import.meta.url,
  );
  await mkdir(dir, { recursive: true });
  await exportGlb(decorated(id), new URL("model.glb", dir));
  await exportGlb(decorated(id, true), new URL("shot.glb", dir));
}
