/**
 * Tactics Mercenary Revival — core arena simulation.
 * Quarter-view-ish top-down arena with height, weapon pickups, bots.
 */
import {
  getMap,
  sampleLevel,
  canTraverseHeight,
  canProjectilePath,
  type MapDef,
} from "@/data/maps";
import { getVulture, VULTURES, type VultureDef } from "@/data/vultures";
import {
  WEAPONS,
  weaponAllowed,
  type VultureId,
  type WeaponDef,
} from "@/data/weapons";
import { weaponById } from "./weaponLookup";

export type GamePhase = "boot" | "select" | "playing" | "paused" | "over";

export interface Pilot {
  id: string;
  name: string;
  isPlayer: boolean;
  vultureId: VultureId;
  x: number;
  y: number;
  angle: number;
  hp: number;
  maxHp: number;
  speedStat: number;
  radius: number;
  score: number;
  weaponIndex: number;
  /** Owned weapon ids (slot order) */
  weapons: number[];
  /** Remaining shots; -1 = unlimited (default weapon) */
  ammo: Record<number, number>;
  cooldown: number;
  respawn: number;
  color: string;
  accent: string;
  catchTimer: number;
  caughtBy: string | null;
  aiTarget: string | null;
  aiTimer: number;
  /** Phase offset for idle hover bob */
  hoverPhase: number;
  /** 0 = moving, 1 = fully still — drives hover intensity */
  stillness: number;
}

export interface Bullet {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Fixed fire heading — never rewritten; ballistic missiles stay straight */
  angle: number;
  life: number;
  /** Initial life for trail/fade */
  maxLife: number;
  damage: number;
  ownerId: string;
  weaponId: number;
  color: string;
  radius: number;
  /** Starting hit radius (cloud expands from this) */
  baseRadius: number;
  /** Cloud max radius; 0 = not a growing cloud */
  growTo: number;
  /** AoE damage tick countdown */
  tick: number;
  /** Per-pilot rehit cooldown remaining (cloud) */
  touch: Record<string, number>;
  catcher: boolean;
  /** missile / beam / shell / mine / cloud for render+sim */
  ammo: string;
}

export interface Pickup {
  alive: boolean;
  x: number;
  y: number;
  weaponId: number;
  bob: number;
  respawnIn: number;
}

export type ParticleKind = "spark" | "smoke" | "explode" | "debris" | "muzzle";

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: ParticleKind;
  /** frame offset into ef1/piece SPR */
  frame: number;
  angle: number;
}

export interface GameState {
  phase: GamePhase;
  mapId: string;
  map: MapDef;
  selectedVulture: VultureId;
  pilots: Pilot[];
  bullets: Bullet[];
  pickups: Pickup[];
  particles: Particle[];
  time: number;
  message: string;
  messageT: number;
  killLimit: number;
  shake: number;
  keys: Record<string, boolean>;
  /**
   * Mouse / touch aim point in world space.
   * Player facing + shots use this (continuous angle, not 8-way).
   */
  pointer: { x: number; y: number; active: boolean };
  /**
   * Optional fidelity assets (HTMLCanvasElement / sprite frames).
   * Populated by GameCanvas after loadGameAssets — kept loosely typed to
   * avoid circular imports with the renderer.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assets?: any;
}

const BULLET_POOL = 200;
const PARTICLE_POOL = 280;
const PICKUP_COUNT = 12;

export function createGame(mapId = "jungle", vulture: VultureId = "born_armor"): GameState {
  const map = getMap(mapId);
  const bullets: Bullet[] = Array.from({ length: BULLET_POOL }, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    life: 0,
    maxLife: 1,
    damage: 0,
    ownerId: "",
    weaponId: 1,
    color: "#fff",
    radius: 3,
    baseRadius: 3,
    growTo: 0,
    tick: 0,
    touch: {},
    catcher: false,
    ammo: "shell",
  }));
  const particles: Particle[] = Array.from({ length: PARTICLE_POOL }, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    color: "#fff",
    size: 2,
    kind: "spark",
    frame: 0,
    angle: 0,
  }));

  return {
    phase: "select",
    mapId,
    map,
    selectedVulture: vulture,
    pilots: [],
    bullets,
    pickups: [],
    particles,
    time: 0,
    message: "기체와 맵을 선택하세요",
    messageT: 3,
    killLimit: 10,
    shake: 0,
    keys: {},
    pointer: { x: map.width / 2, y: map.height / 2, active: false },
  };
}

function spawnPilot(
  state: GameState,
  opts: { id: string; name: string; isPlayer: boolean; vultureId: VultureId },
): Pilot {
  const v = getVulture(opts.vultureId);
  const cell = state.map.cellSize ?? 16;
  const margin = Math.max(80, cell * 4);
  // Prefer low ground spawn
  let x = margin + Math.random() * (state.map.width - margin * 2);
  let y = margin + Math.random() * (state.map.height - margin * 2);
  for (let t = 0; t < 24; t++) {
    const tx = margin + Math.random() * (state.map.width - margin * 2);
    const ty = margin + Math.random() * (state.map.height - margin * 2);
    if (sampleLevel(state.map, tx, ty) === 0) {
      x = tx;
      y = ty;
      break;
    }
  }
  const starter = v.starterWeaponId;
  return {
    id: opts.id,
    name: opts.name,
    isPlayer: opts.isPlayer,
    vultureId: opts.vultureId,
    x,
    y,
    angle: Math.random() * Math.PI * 2,
    hp: v.maxHp,
    maxHp: v.maxHp,
    speedStat: v.tilesPerSec * cell,
    radius: Math.max(8, v.radiusTiles * cell),
    score: 0,
    weaponIndex: 0,
    weapons: [starter],
    ammo: { [starter]: -1 }, // unlimited default
    cooldown: 0,
    respawn: 0,
    color: v.color,
    accent: v.accent,
    catchTimer: 0,
    caughtBy: null,
    aiTarget: null,
    aiTimer: 0,
    hoverPhase: Math.random() * Math.PI * 2,
    stillness: 1,
  };
}

export function startMatch(state: GameState): void {
  // Keep fidelity map if GameCanvas already injected original MAP/TIL assets.
  // Only fall back to procedural catalog when map was never upgraded.
  if (!state.map.fromOriginal) {
    state.map = getMap(state.mapId);
  }
  state.pilots = [
    spawnPilot(state, {
      id: "player",
      name: "YOU",
      isPlayer: true,
      vultureId: state.selectedVulture,
    }),
  ];
  const botVultures: VultureId[] = ["born_armor", "killers_pot", "sorcerer"];
  for (let i = 0; i < 5; i++) {
    state.pilots.push(
      spawnPilot(state, {
        id: `bot-${i}`,
        name: `BOT-${i + 1}`,
        isPlayer: false,
        vultureId: botVultures[i % 3]!,
      }),
    );
  }

  // Speed already set in spawnPilot from v.tilesPerSec × cell (per-craft).
  // Re-apply in case map was swapped after createGame.
  const cell = state.map.cellSize ?? 16;
  for (const p of state.pilots) {
    const v = getVulture(p.vultureId);
    p.speedStat = v.tilesPerSec * cell;
    p.radius = Math.max(8, v.radiusTiles * cell);
    p.maxHp = v.maxHp;
    p.hp = v.maxHp;
  }

  for (const b of state.bullets) b.alive = false;
  for (const p of state.particles) p.alive = false;
  spawnPickups(state);
  state.phase = "playing";
  state.time = 0;
  state.message = `${state.map.name} — 오르막 등반 · 절벽 하강 · 미사일도 절벽 불가`;
  state.messageT = 2.8;
  void import("@/lib/audio/sfx").then(({ playSfxUrl, SFX }) => {
    void playSfxUrl(SFX.rev, { volume: 0.45 });
  });
}

function spawnPickups(state: GameState): void {
  state.pickups = [];
  // Field pickups only (limited ammo weapons) — not starter defaults
  const starters = new Set(VULTURES.map((v) => v.starterWeaponId));
  const pool = WEAPONS.filter(
    (w) => w.bodySpr && w.maxAmmo != null && !starters.has(w.id),
  );
  const list = pool.length ? pool : WEAPONS.filter((w) => w.id > 1 && w.bodySpr);
  for (let i = 0; i < PICKUP_COUNT; i++) {
    const w = list[i % list.length]!;
    state.pickups.push({
      alive: true,
      x: 60 + Math.random() * (state.map.width - 120),
      y: 60 + Math.random() * (state.map.height - 120),
      weaponId: w.id,
      bob: Math.random() * Math.PI * 2,
      respawnIn: 0,
    });
  }
}

function spawnBullet(state: GameState, partial: Omit<Bullet, "alive">): void {
  const b = state.bullets.find((x) => !x.alive);
  if (!b) return;
  Object.assign(b, partial, { alive: true });
}

function spawnParticles(
  state: GameState,
  x: number,
  y: number,
  color: string,
  n: number,
  speed = 120,
  kind: ParticleKind = "spark",
): void {
  let left = n;
  for (const p of state.particles) {
    if (left <= 0) break;
    if (p.alive) continue;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random());
    const life =
      kind === "explode"
        ? 0.45 + Math.random() * 0.35
        : kind === "smoke"
          ? 0.5 + Math.random() * 0.6
          : kind === "debris"
            ? 0.4 + Math.random() * 0.5
            : 0.2 + Math.random() * 0.4;
    p.alive = true;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = life;
    p.maxLife = life;
    p.color = color;
    p.size =
      kind === "explode"
        ? 10 + Math.random() * 14
        : kind === "debris"
          ? 3 + Math.random() * 5
          : 1.5 + Math.random() * 2.5;
    p.kind = kind;
    p.frame = Math.floor(Math.random() * 8);
    p.angle = a;
    left--;
  }
}

/** Full death / impact burst using explode + debris + smoke. */
function spawnExplosion(
  state: GameState,
  x: number,
  y: number,
  color: string,
  scale = 1,
): void {
  spawnParticles(state, x, y, color, Math.round(6 * scale), 40, "explode");
  spawnParticles(state, x, y, "#fda4af", Math.round(10 * scale), 180, "spark");
  spawnParticles(state, x, y, "#94a3b8", Math.round(8 * scale), 70, "smoke");
  spawnParticles(state, x, y, color, Math.round(12 * scale), 200, "debris");
}

function ammoRadius(w: WeaponDef): number {
  if (w.ammo === "missile") return 5;
  if (w.ammo === "explosive") return 5;
  if (w.ammo === "beam") return 2.2;
  if (w.ammo === "shell") return 2.5;
  if (w.ammo === "mine") return 9;
  if (w.ammo === "cloud") return 14;
  return 3.5;
}

/** Cloud expands to this world radius by end of life. */
function cloudGrowTo(w: WeaponDef, planeSpd: number): number {
  // Scale with craft speed so storm covers a readable arena chunk
  return Math.max(48, Math.min(96, planeSpd * 0.22 + w.damage * 2.5));
}

function tryFire(state: GameState, pilot: Pilot): void {
  if (pilot.respawn > 0 || pilot.cooldown > 0 || pilot.catchTimer > 0) return;
  const wid = pilot.weapons[pilot.weaponIndex] ?? getVulture(pilot.vultureId).starterWeaponId;
  const w = weaponById(wid);
  if (!weaponAllowed(w, pilot.vultureId)) return;

  // Ammo: -1 unlimited; 0 empty
  const left = pilot.ammo[wid];
  if (left !== undefined && left === 0) {
    if (pilot.isPlayer) {
      state.message = "탄약 없음 — 기본 무기로 전환";
      state.messageT = 1.2;
      // switch to starter if empty
      const starter = getVulture(pilot.vultureId).starterWeaponId;
      const si = pilot.weapons.indexOf(starter);
      if (si >= 0) pilot.weaponIndex = si;
    }
    return;
  }

  pilot.cooldown = 1 / w.fireRate;
  if (left !== undefined && left > 0) {
    pilot.ammo[wid] = left - 1;
  }

  const base = pilot.angle;
  const planeSpd = Math.max(40, pilot.speedStat);
  const vDef = getVulture(pilot.vultureId);
  const dmg = Math.max(1, Math.round(w.damage * vDef.damageMul));

  // --- Air mine: drop in place slightly ahead, never flies ---
  if (w.ammo === "mine") {
    const drop = pilot.radius + 10;
    const life = Math.max(4, w.range); // range = arm duration
    const r0 = ammoRadius(w);
    spawnBullet(state, {
      x: pilot.x + Math.cos(base) * drop,
      y: pilot.y + Math.sin(base) * drop,
      vx: 0,
      vy: 0,
      angle: base,
      life,
      maxLife: life,
      damage: dmg,
      ownerId: pilot.id,
      weaponId: w.id,
      color: w.color,
      radius: r0,
      baseRadius: r0,
      growTo: 0,
      tick: 0,
      touch: {},
      catcher: false,
      ammo: "mine",
    });
    spawnParticles(state, pilot.x + Math.cos(base) * drop, pilot.y + Math.sin(base) * drop, w.color, 4, 40, "muzzle");
    if (pilot.isPlayer) {
      state.shake = Math.min(2, state.shake + 0.35);
      playShootSfx(w.sfxId ?? wid, wid);
    }
    return;
  }

  // --- Expanding cloud storm (slow crawl + growing AoE) ---
  if (w.ammo === "cloud") {
    const life = Math.max(1.4, w.range);
    const crawl = planeSpd * Math.max(0.12, w.bulletSpeed);
    const r0 = ammoRadius(w);
    const growTo = cloudGrowTo(w, planeSpd);
    const c = Math.cos(base);
    const s = Math.sin(base);
    spawnBullet(state, {
      x: pilot.x + c * (pilot.radius + 12),
      y: pilot.y + s * (pilot.radius + 12),
      vx: c * crawl,
      vy: s * crawl,
      angle: base,
      life,
      maxLife: life,
      damage: dmg,
      ownerId: pilot.id,
      weaponId: w.id,
      color: w.color,
      radius: r0,
      baseRadius: r0,
      growTo,
      tick: 0.05,
      touch: {},
      catcher: false,
      ammo: "cloud",
    });
    spawnParticles(
      state,
      pilot.x + c * 16,
      pilot.y + s * 16,
      w.color,
      6,
      50,
      "smoke",
    );
    if (pilot.isPlayer) {
      state.shake = Math.min(3, state.shake + 0.5);
      playShootSfx(w.sfxId ?? wid, wid);
    }
    return;
  }

  const bulletSpd = planeSpd * w.bulletSpeed;
  // range is plane-seconds → life so max travel ≈ planeSpd * range
  const life = w.range / Math.max(0.05, w.bulletSpeed);

  for (let i = 0; i < w.pellets; i++) {
    // Twin / multi: fixed angular offset only (no random drift)
    const spread =
      w.pellets > 1
        ? (i - (w.pellets - 1) / 2) * (w.spread || 0.12)
        : 0;
    const ang = base + spread;
    // Twin laser offset from centerline (position only — velocity stays on ang)
    const side =
      w.pellets === 2 ? (i === 0 ? -1 : 1) * (pilot.radius * 0.35) : 0;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const px = -s; // perpendicular
    const py = c;
    const ox = c * (pilot.radius + 6) + px * side;
    const oy = s * (pilot.radius + 6) + py * side;
    const r0 = ammoRadius(w);
    spawnBullet(state, {
      x: pilot.x + ox,
      y: pilot.y + oy,
      vx: c * bulletSpd,
      vy: s * bulletSpd,
      angle: ang,
      life,
      maxLife: life,
      damage: dmg,
      ownerId: pilot.id,
      weaponId: w.id,
      color: w.color,
      radius: r0,
      baseRadius: r0,
      growTo: 0,
      tick: 0,
      touch: {},
      catcher: false,
      ammo: w.ammo,
    });
  }
  spawnParticles(
    state,
    pilot.x + Math.cos(base) * 14,
    pilot.y + Math.sin(base) * 14,
    w.color,
    2,
    60,
    "muzzle",
  );
  if (pilot.isPlayer) {
    state.shake = Math.min(3, state.shake + 0.6);
    // Fire SFX without dynamic import every shot (cached module)
    playShootSfx(w.sfxId ?? wid, wid);
  }
}

let sfxMod: typeof import("@/lib/audio/sfx") | null = null;
function playShootSfx(prefer: number, wid: number): void {
  const run = (mod: typeof import("@/lib/audio/sfx")) => {
    // Prefer sync cache hit (preloadCombatSfx) — no microtask per shot
    for (const n of [prefer, wid, 1]) {
      const buf = mod.getCachedSfx(mod.SFX.shoot(n));
      if (buf) {
        mod.playSfx(buf, { volume: 0.4 });
        return;
      }
    }
    // Cold path only
    void mod.playSfxUrl(mod.SFX.shoot(prefer), { volume: 0.4 });
  };
  if (sfxMod) {
    run(sfxMod);
    return;
  }
  void import("@/lib/audio/sfx").then((mod) => {
    sfxMod = mod;
    run(mod);
  });
}

/**
 * StarCraft-style height:
 * - Same level free · high→low free · low→high only on ramps
 * - No other blockers
 */
function inMapBounds(state: GameState, x: number, y: number): boolean {
  const map = state.map;
  const margin = Math.max(4, (map.cellSize ?? 16) * 0.2);
  return (
    x >= margin &&
    y >= margin &&
    x <= map.width - margin &&
    y <= map.height - margin
  );
}

function canFlyTo(
  state: GameState,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (!inMapBounds(state, toX, toY)) return false;
  return canTraverseHeight(state.map, fromX, fromY, toX, toY);
}

function applyMove(
  state: GameState,
  pilot: Pilot,
  mx: number,
  my: number,
  speed: number,
  dt: number,
): boolean {
  const step = speed * dt;
  const len = Math.hypot(mx, my);
  if (len < 1e-6) return false;
  const dx = (mx / len) * step;
  const dy = (my / len) * step;

  const attempts: [number, number][] = [
    [dx, dy],
    [dx, 0],
    [0, dy],
  ];
  for (const [ax, ay] of attempts) {
    if (ax === 0 && ay === 0) continue;
    const nx = pilot.x + ax;
    const ny = pilot.y + ay;
    if (!canFlyTo(state, pilot.x, pilot.y, nx, ny)) continue;
    pilot.x = nx;
    pilot.y = ny;
    return true;
  }
  return false;
}

function updateStillness(pilot: Pilot, moved: boolean, dt: number): void {
  if (moved) {
    pilot.stillness = Math.max(0, pilot.stillness - dt * 7);
  } else {
    pilot.stillness = Math.min(1, pilot.stillness + dt * 2.8);
  }
}

function damagePilot(state: GameState, target: Pilot, amount: number, attackerId: string): void {
  if (target.respawn > 0) return;
  target.hp -= amount;
  spawnParticles(state, target.x, target.y, "#fda4af", 4, 120, "spark");
  if (target.hp <= 0) {
    target.hp = 0;
    target.respawn = 2.5;
    const killer = state.pilots.find((p) => p.id === attackerId);
    if (killer && killer.id !== target.id) {
      killer.score += 1;
      state.message = `${killer.name} crushed ${target.name}`;
      state.messageT = 2;
      if (killer.isPlayer) state.shake = 8;
      if (killer.score >= state.killLimit) {
        state.phase = "over";
        state.message = killer.isPlayer ? "MISSION COMPLETE" : `${killer.name} WINS`;
        state.messageT = 99;
      }
    }
    spawnExplosion(state, target.x, target.y, target.accent, 1.0);
    if (killer?.isPlayer || target.isPlayer) {
      void import("@/lib/audio/sfx").then(({ playSfxUrl, SFX }) => {
        void playSfxUrl(SFX.over, { volume: 0.5 });
      });
    }
  }
}

function updateAI(state: GameState, pilot: Pilot, dt: number): void {
  pilot.aiTimer -= dt;
  if (pilot.aiTimer <= 0 || !pilot.aiTarget) {
    pilot.aiTimer = 0.4 + Math.random() * 0.8;
    let best: Pilot | null = null;
    let bestD = Infinity;
    for (const o of state.pilots) {
      if (o.id === pilot.id || o.respawn > 0) continue;
      const d = (o.x - pilot.x) ** 2 + (o.y - pilot.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    pilot.aiTarget = best?.id ?? null;
    if (pilot.weapons.length > 1 && Math.random() < 0.3) {
      pilot.weaponIndex = Math.floor(Math.random() * pilot.weapons.length);
    }
  }
  const target = state.pilots.find((p) => p.id === pilot.aiTarget);
  if (!target || target.respawn > 0) return;
  const dx = target.x - pilot.x;
  const dy = target.y - pilot.y;
  const dist = Math.hypot(dx, dy) || 1;
  pilot.angle = Math.atan2(dy, dx);
  const w = weaponById(pilot.weapons[pilot.weaponIndex] ?? 1);
  // range is plane-seconds → preferred engage distance in world units
  const engage = pilot.speedStat * w.range * 0.45;
  let mx = 0;
  let my = 0;
  if (dist > engage + 40) {
    mx = dx / dist;
    my = dy / dist;
  } else if (dist < engage * 0.45) {
    mx = -dx / dist;
    my = -dy / dist;
  } else {
    mx = -dy / dist;
    my = dx / dist;
  }
  const speed =
    pilot.speedStat * (0.9 + 0.1 * Math.sin(state.time * 3 + pilot.score));
  const moved = applyMove(state, pilot, mx, my, speed, dt);
  updateStillness(pilot, moved, dt);
  const fireRange =
    w.ammo === "mine"
      ? 90
      : w.ammo === "cloud"
        ? pilot.speedStat * 1.15
        : pilot.speedStat * w.range * 0.95;
  if (dist < fireRange && Math.random() < 0.04 + dt * 2) {
    tryFire(state, pilot);
  }
}

function updatePlayer(state: GameState, pilot: Pilot, dt: number): void {
  const k = state.keys;

  // --- Aim: continuous angle toward mouse (or last pointer) ---
  // Not snapped to 45°; SPR sheet still quantizes display to 3° (120 frames).
  const aimX = state.pointer.x;
  const aimY = state.pointer.y;
  const adx = aimX - pilot.x;
  const ady = aimY - pilot.y;
  if (adx * adx + ady * ady > 4) {
    // Full-precision facing for shots (~sub-degree; Math.atan2 float)
    pilot.angle = Math.atan2(ady, adx);
  }

  // --- Move: WASD / arrows only — independent of aim (strafe ok) ---
  let mx = 0;
  let my = 0;
  if (k["KeyW"] || k["ArrowUp"]) my -= 1;
  if (k["KeyS"] || k["ArrowDown"]) my += 1;
  if (k["KeyA"] || k["ArrowLeft"]) mx -= 1;
  if (k["KeyD"] || k["ArrowRight"]) mx += 1;
  const len = Math.hypot(mx, my);
  let moved = false;
  if (len > 0) {
    mx /= len;
    my /= len;
    moved = applyMove(state, pilot, mx, my, pilot.speedStat, dt);
  }
  updateStillness(pilot, moved, dt);

  // Fire: mouse click primary; Ctrl kept as original-doc alternate
  if (k["Mouse0"] || k["ControlLeft"] || k["ControlRight"]) {
    tryFire(state, pilot);
  }
}

/** Update aim point from canvas mouse / touch (world coords). */
export function setPointerWorld(
  state: GameState,
  x: number,
  y: number,
  active = true,
): void {
  state.pointer.x = x;
  state.pointer.y = y;
  state.pointer.active = active;
}

export function setKey(state: GameState, code: string, down: boolean): void {
  // Pause is handled by GameCanvas UI (Esc menu). Only KeyP still toggles here
  // if UI did not intercept — avoid double-toggle with Escape.
  if (down) {
    if (code === "KeyP" && (state.phase === "playing" || state.phase === "paused")) {
      state.phase = state.phase === "paused" ? "playing" : "paused";
    }
    if (code === "KeyR" && state.phase === "over") {
      startMatch(state);
    }
  }
  state.keys[code] = down;
  if (!down || state.phase !== "playing") return;
  const player = state.pilots.find((p) => p.isPlayer);
  if (!player || player.respawn > 0) return;
  if (code.startsWith("Digit")) {
    const d = code === "Digit0" ? 9 : Number(code.slice(5)) - 1;
    if (d >= 0 && d < player.weapons.length) player.weaponIndex = d;
  }
}

export function update(state: GameState, dt: number): void {
  const cap = Math.min(dt, 0.05);
  if (state.phase === "over") {
    state.shake = Math.max(0, state.shake - cap * 20);
    return;
  }
  if (state.phase !== "playing") {
    state.messageT = Math.max(0, state.messageT - cap);
    state.shake = Math.max(0, state.shake - cap * 20);
    return;
  }
  state.time += cap;
  state.messageT = Math.max(0, state.messageT - cap);
  state.shake = Math.max(0, state.shake - cap * 18);

  for (const pilot of state.pilots) {
    pilot.cooldown = Math.max(0, pilot.cooldown - cap);
    if (pilot.respawn > 0) {
      pilot.respawn -= cap;
      if (pilot.respawn <= 0) {
        const v = getVulture(pilot.vultureId);
        pilot.hp = v.maxHp;
        pilot.x = 60 + Math.random() * (state.map.width - 120);
        pilot.y = 60 + Math.random() * (state.map.height - 120);
        pilot.caughtBy = null;
        pilot.catchTimer = 0;
      }
      continue;
    }
    if (pilot.catchTimer > 0) {
      pilot.catchTimer -= cap;
      const captor = state.pilots.find((p) => p.id === pilot.caughtBy);
      if (captor && captor.respawn <= 0) {
        const dx = captor.x - pilot.x;
        const dy = captor.y - pilot.y;
        const d = Math.hypot(dx, dy) || 1;
        pilot.x += (dx / d) * pilot.speedStat * 0.9 * cap;
        pilot.y += (dy / d) * pilot.speedStat * 0.9 * cap;
        pilot.angle = Math.atan2(dy, dx);
      }
      if (pilot.catchTimer <= 0) pilot.caughtBy = null;
      continue;
    }
    if (pilot.isPlayer) updatePlayer(state, pilot, cap);
    else updateAI(state, pilot, cap);

    for (const pk of state.pickups) {
      if (!pk.alive) continue;
      const d = Math.hypot(pk.x - pilot.x, pk.y - pilot.y);
      if (d < pilot.radius + 14) {
        const w = weaponById(pk.weaponId);
        if (!weaponAllowed(w, pilot.vultureId)) continue;
        const add = w.maxAmmo ?? 8;
        if (!pilot.weapons.includes(w.id)) {
          pilot.weapons.push(w.id);
          if (pilot.weapons.length > 8) {
            // keep starter, drop oldest limited gun
            const starter = getVulture(pilot.vultureId).starterWeaponId;
            const drop = pilot.weapons.find((id) => id !== starter);
            if (drop != null) {
              pilot.weapons = pilot.weapons.filter((id) => id !== drop);
              delete pilot.ammo[drop];
            }
          }
          pilot.ammo[w.id] = add;
        } else {
          // restock limited ammo
          const cur = pilot.ammo[w.id] ?? 0;
          if (cur >= 0) pilot.ammo[w.id] = Math.min(99, cur + add);
        }
        pilot.weaponIndex = pilot.weapons.indexOf(w.id);
        pk.alive = false;
        pk.respawnIn = 10;
        if (pilot.isPlayer) {
          const left = pilot.ammo[w.id];
          state.message =
            left != null && left >= 0
              ? `획득: ${w.name} ×${left}`
              : `획득: ${w.name}`;
          state.messageT = 1.5;
          if (sfxMod) {
            void sfxMod.playSfxUrl(sfxMod.SFX.item, { volume: 0.65 });
          } else {
            void import("@/lib/audio/sfx").then((mod) => {
              sfxMod = mod;
              void mod.playSfxUrl(mod.SFX.item, { volume: 0.65 });
            });
          }
        }
      }
    }
  }

  // Bob + respawn once per frame (was incorrectly updated per-pilot)
  for (const pk of state.pickups) {
    if (pk.alive) {
      pk.bob += cap * 3;
      continue;
    }
    if (pk.respawnIn > 0) {
      pk.respawnIn -= cap;
      if (pk.respawnIn <= 0) {
        pk.alive = true;
        pk.x = 60 + Math.random() * (state.map.width - 120);
        pk.y = 60 + Math.random() * (state.map.height - 120);
      }
    }
  }

  const mapW = state.map.width;
  const mapH = state.map.height;
  const pilots = state.pilots;
  for (const b of state.bullets) {
    if (!b.alive) continue;
    const owner = b.ownerId;

    // ---- Stationary air mine ----
    if (b.ammo === "mine") {
      b.vx = 0;
      b.vy = 0;
      b.life -= cap;
      if (b.life <= 0) {
        // Soft despawn — no full boom (player can re-seed area)
        spawnParticles(state, b.x, b.y, b.color, 5, 40, "smoke");
        b.alive = false;
        continue;
      }
      // Arm delay: first 0.35s can't detonate (owner clear)
      const armed = b.maxLife - b.life > 0.35;
      if (!armed) continue;
      for (let pi = 0; pi < pilots.length; pi++) {
        const pilot = pilots[pi]!;
        if (pilot.id === owner || pilot.respawn > 0) continue;
        const dx = pilot.x - b.x;
        const dy = pilot.y - b.y;
        const rr = pilot.radius + b.radius;
        if (dx * dx + dy * dy < rr * rr) {
          damagePilot(state, pilot, b.damage, owner);
          spawnExplosion(state, b.x, b.y, b.color, 0.9);
          b.alive = false;
          break;
        }
      }
      continue;
    }

    // ---- Expanding cloud AoE ----
    if (b.ammo === "cloud") {
      // Slow crawl along fire angle (can stop on cliff)
      const spd = Math.hypot(b.vx, b.vy);
      if (spd > 0.5) {
        b.vx = Math.cos(b.angle) * spd;
        b.vy = Math.sin(b.angle) * spd;
        const nx = b.x + b.vx * cap;
        const ny = b.y + b.vy * cap;
        if (
          nx >= 0 &&
          ny >= 0 &&
          nx <= mapW &&
          ny <= mapH &&
          canProjectilePath(state.map, b.x, b.y, nx, ny)
        ) {
          b.x = nx;
          b.y = ny;
        } else {
          b.vx = 0;
          b.vy = 0;
        }
      }
      b.life -= cap;
      // Grow radius over lifetime
      const t = b.maxLife > 0 ? 1 - Math.max(0, b.life) / b.maxLife : 1;
      const ease = t * t * (3 - 2 * t); // smoothstep
      b.radius = b.baseRadius + (b.growTo - b.baseRadius) * ease;

      if (b.life <= 0) {
        spawnParticles(state, b.x, b.y, b.color, 8, 50, "smoke");
        b.alive = false;
        continue;
      }

      // Decay per-target cooldowns
      for (const id of Object.keys(b.touch)) {
        b.touch[id] = (b.touch[id] ?? 0) - cap;
        if ((b.touch[id] ?? 0) <= 0) delete b.touch[id];
      }

      b.tick -= cap;
      if (b.tick <= 0) {
        b.tick = 0.28;
        const hitR = b.radius;
        for (let pi = 0; pi < pilots.length; pi++) {
          const pilot = pilots[pi]!;
          if (pilot.id === owner || pilot.respawn > 0) continue;
          if ((b.touch[pilot.id] ?? 0) > 0) continue;
          const dx = pilot.x - b.x;
          const dy = pilot.y - b.y;
          const rr = pilot.radius + hitR;
          if (dx * dx + dy * dy < rr * rr) {
            damagePilot(state, pilot, b.damage, owner);
            b.touch[pilot.id] = 0.45;
            spawnParticles(state, pilot.x, pilot.y, b.color, 3, 60, "spark");
          }
        }
        // Ambient cloud wisps
        if (Math.random() < 0.35) {
          spawnParticles(state, b.x, b.y, b.color, 1, 25, "smoke");
        }
      }
      continue;
    }

    // ---- Ballistic (locked heading) ----
    const spd = Math.hypot(b.vx, b.vy) || 1;
    b.vx = Math.cos(b.angle) * spd;
    b.vy = Math.sin(b.angle) * spd;
    const nx = b.x + b.vx * cap;
    const ny = b.y + b.vy * cap;
    if (!canProjectilePath(state.map, b.x, b.y, nx, ny)) {
      spawnParticles(state, b.x, b.y, b.color, 3, 70, "spark");
      if (b.ammo === "explosive" || b.ammo === "missile") {
        spawnExplosion(state, b.x, b.y, b.color, 0.35);
      }
      b.alive = false;
      continue;
    }
    b.x = nx;
    b.y = ny;
    b.life -= cap;
    if (b.life <= 0 || nx < 0 || ny < 0 || nx > mapW || ny > mapH) {
      if (b.ammo === "explosive") {
        spawnExplosion(state, b.x, b.y, b.color, 0.45);
      }
      b.alive = false;
      continue;
    }
    const hitR = b.radius;
    for (let pi = 0; pi < pilots.length; pi++) {
      const pilot = pilots[pi]!;
      if (pilot.id === owner || pilot.respawn > 0) continue;
      const dx = pilot.x - nx;
      const dy = pilot.y - ny;
      const rr = pilot.radius + hitR;
      if (dx * dx + dy * dy < rr * rr) {
        b.alive = false;
        if (b.catcher) {
          pilot.caughtBy = owner;
          pilot.catchTimer = 2.5;
          state.message = `${pilot.name} caught!`;
          state.messageT = 1.2;
          spawnParticles(state, b.x, b.y, "#34d399", 10, 80, "spark");
        } else {
          damagePilot(state, pilot, b.damage, owner);
          if (b.ammo === "explosive" || b.ammo === "missile") {
            spawnExplosion(state, b.x, b.y, b.color, 0.85);
          } else {
            spawnParticles(state, b.x, b.y, b.color, 8, 120, "spark");
          }
        }
        break;
      }
    }
  }

  for (const p of state.particles) {
    if (!p.alive) continue;
    p.x += p.vx * cap;
    p.y += p.vy * cap;
    p.vx *= p.kind === "smoke" ? 0.96 : 0.9;
    p.vy *= p.kind === "smoke" ? 0.96 : 0.9;
    if (p.kind === "smoke") p.vy -= 12 * cap;
    p.angle += cap * 4;
    p.life -= cap;
    if (p.life <= 0) p.alive = false;
  }
}

export function getPlayer(state: GameState): Pilot | undefined {
  return state.pilots.find((p) => p.isPlayer);
}

export function currentWeapon(pilot: Pilot): WeaponDef {
  return weaponById(pilot.weapons[pilot.weaponIndex] ?? 1);
}

export type { VultureDef, WeaponDef, MapDef };
