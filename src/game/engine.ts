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
  FIELD_LOADOUT_WEAPON_IDS,
  pickupAmmoAmount,
  type VultureId,
  type WeaponDef,
} from "@/data/weapons";
import { weaponById } from "./weaponLookup";
import { craftWorldRadius, craftWorldSpeed } from "./viewScale";
import { approachVelocity, tryStep } from "./movement";
import { AIM_LEAD } from "./touchStick";

export type GamePhase = "boot" | "select" | "playing" | "paused" | "over";

export interface Pilot {
  id: string;
  name: string;
  isPlayer: boolean;
  vultureId: VultureId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  speedStat: number;
  radius: number;
  score: number;
  /**
   * Active slot index into `weapons` (keys 1–4 map to 0–3).
   * 0 = default unlimited · 1–3 = field loadout (0 ammo = not selectable).
   */
  weaponIndex: number;
  /**
   * Always length 4: [starter, field2, field3, field4] for keys 1–4.
   * Field weapons are fixed per craft; ammo starts at 0 until pickup.
   */
  weapons: number[];
  /** Remaining shots; -1 = unlimited (default weapon only) */
  ammo: Record<number, number>;
  cooldown: number;
  respawn: number;
  color: string;
  accent: string;
  catchTimer: number;
  caughtBy: string | null;
  aiTarget: string | null;
  aiTimer: number;
  /** Previous target pos for lead aiming */
  aiMemX: number;
  aiMemY: number;
  /** engage = fight · loot = grab ammo · flee = low HP */
  aiMode: "engage" | "loot" | "flee";
  /**
   * Bot skill tier 1–5 (player always 0).
   * 1 초보 · 2 견습 · 3 숙련 · 4 정예 · 5 에이스
   */
  aiSkill: 0 | 1 | 2 | 3 | 4 | 5;
  /** Phase offset for idle hover bob */
  hoverPhase: number;
  /** 0 = moving, 1 = fully still — drives hover intensity */
  stillness: number;
}

/** Human-readable bot skill labels (index = aiSkill). */
export const AI_SKILL_LABELS = [
  "",
  "초보",
  "견습",
  "숙련",
  "정예",
  "에이스",
] as const;

type AiProfile = {
  /** Thinking interval scale (higher = slower retarget) */
  thinkMul: number;
  /** Aim turn rate rad/s */
  turnRate: number;
  /** Lead prediction factor 0–1 */
  leadMul: number;
  /** Aim error tolerance scale (higher = looser) */
  aimLoose: number;
  /** Chance to fire when lined up 0–1 */
  fireChance: number;
  /** Dodge blend weight 0–1 */
  dodgeMul: number;
  /** Smart weapon pick vs random */
  smartWeapon: number;
  /** Use player bias / LOS scoring in target pick */
  smartTarget: number;
  /** Seek pickups / flee intelligence */
  tactics: number;
  /** Movement skill: strafe/kite quality */
  moveSkill: number;
  /** Random aim jitter (radians) */
  aimJitter: number;
};

/** Skill 1 = weak · 5 = strong. Tuned so a lobby has mixed challenge. */
function aiProfile(skill: number): AiProfile {
  const s = Math.max(1, Math.min(5, skill | 0));
  const t = (s - 1) / 4; // 0..1
  return {
    thinkMul: 1.7 - t * 1.05,
    turnRate: 3.2 + t * 8.5,
    leadMul: 0.08 + t * 0.95,
    aimLoose: 2.6 - t * 1.85,
    fireChance: 0.28 + t * 0.7,
    dodgeMul: t < 0.2 ? 0 : 0.15 + t * 0.9,
    smartWeapon: 0.1 + t * 0.9,
    smartTarget: 0.15 + t * 0.9,
    tactics: 0.1 + t * 0.95,
    moveSkill: 0.2 + t * 0.85,
    aimJitter: 0.38 - t * 0.34,
  };
}

function rollBotSkill(): 1 | 2 | 3 | 4 | 5 {
  // Slightly favor mid tiers so not all ace / all noob
  const r = Math.random();
  if (r < 0.18) return 1;
  if (r < 0.38) return 2;
  if (r < 0.62) return 3;
  if (r < 0.84) return 4;
  return 5;
}

export interface Bullet {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * Flight heading. Ballistic shots keep the fire angle;
   * homing shots rewrite this each frame toward a target.
   */
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
  /** Extra targets this shot may still pierce after the current hit */
  pierceLeft: number;
  /** Splash radius on impact / timeout (0 = none) */
  splashR: number;
  /** Splash damage multiplier vs main damage */
  splashMul: number;
  /** Draw size multiplier (from weapon hitScale) */
  drawScale: number;
  /** Weapon style key for render / sim quirks */
  style: string;
  /** Homing turn rate rad/s (0 = no tracking) */
  homing: number;
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
   * While the mouse is still, the engine translates this with the craft so
   * heading stays put (a frozen map pin would swing the nose as you fly).
   */
  pointer: { x: number; y: number; active: boolean };
  /**
   * Twin-stick override. Screen/engine Y-down, −1..1. Null = keyboard / mouse.
   * Aim stick also writes `pointer` so the neon cue stays on the nose line.
   */
  moveStick: { x: number; y: number } | null;
  aimStick: { x: number; y: number } | null;
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

export function createGame(
  mapId = "jungle",
  vulture: VultureId = "born_armor",
): GameState {
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
    pierceLeft: 0,
    splashR: 0,
    splashMul: 0,
    drawScale: 1,
    style: "default",
    homing: 0,
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
    moveStick: null,
    aimStick: null,
  };
}

/**
 * Pick a random spawn on the map.
 * Prefers low ground, stays away from death location and living pilots.
 */
function pickSpawnPoint(
  state: GameState,
  opts: {
    /** Exclude this pilot when measuring distance to others */
    selfId?: string;
    /** Death / previous position — must not respawn nearby */
    avoidX?: number;
    avoidY?: number;
  } = {},
): { x: number; y: number } {
  const map = state.map;
  const cell = map.cellSize ?? 16;
  const margin = Math.max(80, cell * 4);
  const spanX = Math.max(40, map.width - margin * 2);
  const spanY = Math.max(40, map.height - margin * 2);
  // At least ~28% of shorter map axis away from death spot
  const minDeathAway = Math.max(180, Math.min(map.width, map.height) * 0.28);
  const minPilotAway = Math.max(100, cell * 8);

  let bestX = margin + Math.random() * spanX;
  let bestY = margin + Math.random() * spanY;
  let bestScore = -Infinity;

  for (let t = 0; t < 64; t++) {
    const tx = margin + Math.random() * spanX;
    const ty = margin + Math.random() * spanY;
    let score = Math.random() * 0.5; // break ties → more true randomness

    // Prefer open low ground
    const lvl = sampleLevel(map, tx, ty);
    if (lvl === 0) score += 4;
    else if (lvl === 1) score += 1;
    else score -= 2;

    // Far from death / previous location
    if (opts.avoidX != null && opts.avoidY != null) {
      const d = Math.hypot(tx - opts.avoidX, ty - opts.avoidY);
      if (d < minDeathAway) {
        // Hard reject near death site
        score -= 50 + (1 - d / minDeathAway) * 40;
      } else {
        score += Math.min(6, (d - minDeathAway) / minDeathAway);
      }
    }

    // Spread from living pilots (and not on top of them)
    for (const p of state.pilots) {
      if (opts.selfId && p.id === opts.selfId) continue;
      if (p.respawn > 0) continue;
      const d = Math.hypot(tx - p.x, ty - p.y);
      if (d < minPilotAway) score -= 25 * (1 - d / minPilotAway);
      else if (d < minPilotAway * 2) score -= 4;
    }

    if (score > bestScore) {
      bestScore = score;
      bestX = tx;
      bestY = ty;
    }
  }

  return { x: bestX, y: bestY };
}

function spawnPilot(
  state: GameState,
  opts: {
    id: string;
    name: string;
    isPlayer: boolean;
    vultureId: VultureId;
    /** If omitted, bots roll 1–5; player forced 0 */
    aiSkill?: 0 | 1 | 2 | 3 | 4 | 5;
  },
): Pilot {
  const v = getVulture(opts.vultureId);
  // Place after other pilots already in state so we can spread out
  const pos = pickSpawnPoint(state, { selfId: opts.id });
  const starter = v.starterWeaponId;
  const loadout = v.loadoutWeaponIds;
  const weapons = [starter, loadout[0], loadout[1], loadout[2]];
  const ammo: Record<number, number> = { [starter]: -1 };
  for (const id of loadout) ammo[id] = 0;
  const aiSkill: 0 | 1 | 2 | 3 | 4 | 5 = opts.isPlayer
    ? 0
    : (opts.aiSkill ?? rollBotSkill());
  const label =
    !opts.isPlayer && aiSkill >= 1
      ? `${opts.name}·${AI_SKILL_LABELS[aiSkill]}`
      : opts.name;
  return {
    id: opts.id,
    name: label,
    isPlayer: opts.isPlayer,
    vultureId: opts.vultureId,
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    angle: Math.random() * Math.PI * 2,
    hp: v.maxHp,
    maxHp: v.maxHp,
    // Speed & radius use fixed view ref — not map.cellSize (keeps craft size stable)
    speedStat: craftWorldSpeed(v.tilesPerSec),
    radius: craftWorldRadius(v.radiusTiles),
    score: 0,
    weaponIndex: 0,
    weapons,
    ammo,
    cooldown: 0,
    respawn: 0,
    color: v.color,
    accent: v.accent,
    catchTimer: 0,
    caughtBy: null,
    aiTarget: null,
    aiTimer: 0,
    aiMemX: pos.x,
    aiMemY: pos.y,
    aiMode: "engage",
    aiSkill,
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

  // Re-apply craft stats (map-independent size/speed) after map swap.
  for (const p of state.pilots) {
    const v = getVulture(p.vultureId);
    p.speedStat = craftWorldSpeed(v.tilesPerSec);
    p.radius = craftWorldRadius(v.radiusTiles);
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
  if (!sfxMuted) {
    if (sfxMod) {
      void sfxMod.playSfxUrl(sfxMod.SFX.rev, { volume: 0.45 });
    } else {
      void import("@/lib/audio/sfx").then((mod) => {
        sfxMod = mod;
        void mod.playSfxUrl(mod.SFX.rev, { volume: 0.45 });
      });
    }
  }
}

function spawnPickups(state: GameState): void {
  state.pickups = [];
  // Only weapons that appear in some craft's fixed field loadout
  const fieldIds = new Set(FIELD_LOADOUT_WEAPON_IDS);
  for (const v of VULTURES) {
    for (const id of v.loadoutWeaponIds) fieldIds.add(id);
  }
  const list = WEAPONS.filter((w) => fieldIds.has(w.id));
  const pool = list.length
    ? list
    : WEAPONS.filter((w) => w.id > 1 && w.bodySpr);
  for (let i = 0; i < PICKUP_COUNT; i++) {
    const w = pool[i % pool.length]!;
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

/** Switch pilot to default (unlimited) weapon at slot 0. */
function selectDefaultWeapon(pilot: Pilot): void {
  pilot.weaponIndex = 0;
}

/** True if this slot index is selectable (default always; field only with ammo > 0). */
function canSelectWeaponSlot(pilot: Pilot, slot: number): boolean {
  if (slot < 0 || slot >= pilot.weapons.length) return false;
  if (slot === 0) return true;
  const wid = pilot.weapons[slot]!;
  return (pilot.ammo[wid] ?? 0) > 0;
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

/**
 * Light cloud puffs — few particles, short life (keep screen readable).
 */
function spawnCloudPuffs(
  state: GameState,
  x: number,
  y: number,
  color: string,
  n: number,
  angle: number,
  speed = 40,
): void {
  let left = Math.min(n, 4);
  for (const p of state.particles) {
    if (left <= 0) break;
    if (p.alive) continue;
    const a = angle + (Math.random() - 0.5) * 0.9;
    const s = speed * (0.35 + Math.random() * 0.65);
    const life = 0.28 + Math.random() * 0.28;
    p.alive = true;
    p.x = x + (Math.random() - 0.5) * 6;
    p.y = y + (Math.random() - 0.5) * 6;
    p.vx = Math.cos(a) * s;
    p.vy = Math.sin(a) * s;
    p.life = life;
    p.maxLife = life;
    p.color = color;
    p.size = 4 + Math.random() * 5;
    p.kind = "smoke";
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
  let base = 3.5;
  if (w.ammo === "missile") base = 6;
  else if (w.ammo === "explosive") base = 8;
  else if (w.ammo === "beam") base = 2.2;
  else if (w.ammo === "shell") base = 2.5;
  else if (w.ammo === "mine") base = 9;
  else if (w.ammo === "cloud") base = 14;
  else if (w.ammo === "special" || w.ammo === "energy") base = 3.8;
  return Math.max(2, base * (w.hitScale ?? 1));
}

/** Cloud expands to this world radius by end of life. */
function cloudGrowTo(w: WeaponDef, planeSpd: number): number {
  // Frost = huge area deny; storm = mid roaming cloud
  if (w.style === "frost") {
    return Math.max(100, Math.min(160, planeSpd * 0.38 + w.damage * 5));
  }
  if (w.style === "storm") {
    return Math.max(48, Math.min(92, planeSpd * 0.22 + w.damage * 2.4));
  }
  return Math.max(48, Math.min(96, planeSpd * 0.22 + w.damage * 2.5));
}

function combatProps(w: WeaponDef): {
  pierceLeft: number;
  splashR: number;
  splashMul: number;
  drawScale: number;
  style: string;
  homing: number;
} {
  return {
    pierceLeft: Math.max(0, w.pierce ?? 0),
    splashR: Math.max(0, w.splashRadius ?? 0),
    splashMul: w.splashMul ?? 0.55,
    drawScale: w.hitScale ?? 1,
    style: w.style ?? "default",
    homing: Math.max(0, w.homing ?? 0),
  };
}

/** Nearest living enemy for homing projectiles (squared distance). */
function findHomingTarget(
  state: GameState,
  ownerId: string,
  x: number,
  y: number,
): Pilot | null {
  let best: Pilot | null = null;
  let bestD = Infinity;
  const pilots = state.pilots;
  for (let i = 0; i < pilots.length; i++) {
    const p = pilots[i]!;
    if (p.id === ownerId || p.respawn > 0) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** AoE around a detonation. `skipId` already took full direct damage. */
function applySplash(
  state: GameState,
  x: number,
  y: number,
  ownerId: string,
  damage: number,
  radius: number,
  mul: number,
  color: string,
  skipId?: string,
): void {
  if (radius <= 0 || mul <= 0) return;
  const dmg = Math.max(1, Math.round(damage * mul));
  const r2 = radius * radius;
  for (let pi = 0; pi < state.pilots.length; pi++) {
    const pilot = state.pilots[pi]!;
    if (pilot.id === ownerId || pilot.respawn > 0) continue;
    if (skipId && pilot.id === skipId) continue;
    const dx = pilot.x - x;
    const dy = pilot.y - y;
    const pr = pilot.radius;
    if (dx * dx + dy * dy <= r2 + pr * pr + 2 * radius * pr) {
      damagePilot(state, pilot, dmg, ownerId);
    }
  }
  const boom = Math.min(2.4, 0.45 + radius / 70);
  spawnExplosion(state, x, y, color, boom);
}

function tryFire(state: GameState, pilot: Pilot): void {
  if (pilot.respawn > 0 || pilot.cooldown > 0 || pilot.catchTimer > 0) return;
  // Empty field slot → force default (should not be selected, but guard anyway)
  if (!canSelectWeaponSlot(pilot, pilot.weaponIndex)) {
    selectDefaultWeapon(pilot);
  }
  const wid =
    pilot.weapons[pilot.weaponIndex] ??
    getVulture(pilot.vultureId).starterWeaponId;
  const w = weaponById(wid);

  // Ammo: -1 unlimited; 0 empty
  const left = pilot.ammo[wid];
  if (left !== undefined && left === 0) {
    selectDefaultWeapon(pilot);
    if (pilot.isPlayer) {
      state.message = "탄약 없음 — 기본 무기로 전환";
      state.messageT = 1.2;
    }
    return;
  }

  pilot.cooldown = 1 / w.fireRate;
  if (left !== undefined && left > 0) {
    pilot.ammo[wid] = left - 1;
    // Last shot spent → fall back to default weapon
    if (pilot.ammo[wid] === 0 && pilot.weaponIndex !== 0) {
      selectDefaultWeapon(pilot);
      if (pilot.isPlayer) {
        state.message = `${w.name} 소진 — 기본 무기`;
        state.messageT = 1.2;
      }
    }
  }

  const base = pilot.angle;
  const planeSpd = Math.max(40, pilot.speedStat);
  const vDef = getVulture(pilot.vultureId);
  const dmg = Math.max(1, Math.round(w.damage * vDef.damageMul));

  const props = combatProps(w);

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
      ...props,
    });
    spawnParticles(
      state,
      pilot.x + Math.cos(base) * drop,
      pilot.y + Math.sin(base) * drop,
      w.color,
      4,
      40,
      "muzzle",
    );
    if (pilot.isPlayer) {
      state.shake = Math.min(2, state.shake + 0.35);
      playShootSfx(w.sfxId ?? wid, wid);
    }
    return;
  }

  // --- Expanding cloud storm / frost zone ---
  if (w.ammo === "cloud") {
    const life = Math.max(1.1, w.range);
    const crawl = planeSpd * Math.max(0.08, w.bulletSpeed);
    const r0 = Math.max(8, ammoRadius(w) * (w.style === "frost" ? 0.7 : 0.55));
    const growTo = cloudGrowTo(w, planeSpd);
    const c = Math.cos(base);
    const s = Math.sin(base);
    const ox = pilot.x + c * (pilot.radius + 10);
    const oy = pilot.y + s * (pilot.radius + 10);
    spawnBullet(state, {
      x: ox,
      y: oy,
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
      // Frost ticks slower but sticks longer; storm ticks faster
      tick: w.style === "frost" ? 0.12 : 0.05,
      touch: {},
      catcher: false,
      ammo: "cloud",
      ...props,
    });
    spawnCloudPuffs(
      state,
      ox,
      oy,
      w.color,
      w.style === "frost" ? 4 : 3,
      base,
      crawl * 0.22,
    );
    if (pilot.isPlayer) {
      state.shake = Math.min(
        3,
        state.shake + (w.style === "frost" ? 0.75 : 0.5),
      );
      playShootSfx(w.sfxId ?? wid, wid);
    }
    return;
  }

  const bulletSpd = planeSpd * w.bulletSpeed;
  // range is plane-seconds → life so max travel ≈ planeSpd * range
  const life = w.range / Math.max(0.05, w.bulletSpeed);

  for (let i = 0; i < w.pellets; i++) {
    // Twin / multi: fixed angular offset only (no random drift)
    // Scatter uses wider fan; twin_beam uses side offset + modest angle
    const spread =
      w.pellets > 1 ? (i - (w.pellets - 1) / 2) * (w.spread || 0.12) : 0;
    const ang = base + spread;
    // Twin laser offset from centerline (position only — velocity stays on ang)
    const side =
      w.pellets === 2
        ? (i === 0 ? -1 : 1) * (pilot.radius * 0.35)
        : w.style === "scatter"
          ? (i - (w.pellets - 1) / 2) * (pilot.radius * 0.12)
          : 0;
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
      ...props,
    });
  }
  spawnParticles(
    state,
    pilot.x + Math.cos(base) * 14,
    pilot.y + Math.sin(base) * 14,
    w.color,
    w.style === "nuke" || w.style === "cruise" ? 5 : 2,
    w.style === "nuke" ? 90 : 60,
    "muzzle",
  );
  if (pilot.isPlayer) {
    const kick =
      w.style === "nuke" || w.style === "cruise"
        ? 1.4
        : w.style === "lob"
          ? 1.0
          : 0.55;
    state.shake = Math.min(5, state.shake + kick);
    playShootSfx(w.sfxId ?? wid, wid);
  }
}

let sfxMod: typeof import("@/lib/audio/sfx") | null = null;
/** Mute combat SFX during load/settle warm-up (still exercises code paths). */
let sfxMuted = false;

/** Bind preloaded audio module so first real shot never does dynamic import. */
export function bindSfxModule(mod: typeof import("@/lib/audio/sfx")): void {
  sfxMod = mod;
}

export function setSfxMuted(muted: boolean): void {
  sfxMuted = muted;
}

function playShootSfx(prefer: number, wid: number): void {
  if (sfxMuted) return;
  const run = (mod: typeof import("@/lib/audio/sfx")) => {
    void mod.resumeAudio();
    const vol = mod.SHOOT_VOLUME ?? 0.26;
    const rate = 0.94 + Math.random() * 0.12;
    // Prefer combat pack, then original client WAV
    for (const n of [prefer, wid, 1, 6]) {
      const buf =
        mod.getCachedSfx(mod.SFX.shoot(n)) ??
        mod.getCachedSfx(mod.SFX.shootOriginal(n));
      if (buf) {
        mod.playSfx(buf, { volume: vol, playbackRate: rate });
        return;
      }
    }
    void mod.playSfxUrl(mod.SFX.shoot(prefer), { volume: vol }).then(() => {
      // If combat URL empty, try original
      if (!mod.getCachedSfx(mod.SFX.shoot(prefer))) {
        void mod.playSfxUrl(mod.SFX.shootOriginal(prefer), { volume: vol });
      }
    });
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

/** Damage-taken / soft hit confirmation (player-centric). */
let lastHitSfxAt = 0;
function playHitSfx(kind: "hurt" | "confirm" = "hurt"): void {
  if (sfxMuted) return;
  // Throttle cloud AoE tick spam (~max 8/sec hurt, 12/sec confirm)
  const now = performance.now();
  const minGap = kind === "hurt" ? 90 : 55;
  if (now - lastHitSfxAt < minGap) return;
  lastHitSfxAt = now;

  const run = (mod: typeof import("@/lib/audio/sfx")) => {
    void mod.resumeAudio();
    const vol =
      kind === "hurt"
        ? (mod.HIT_VOLUME ?? 0.42)
        : (mod.HIT_VOLUME ?? 0.42) * 0.55;
    const url = kind === "hurt" ? mod.SFX.hit : mod.SFX.hitAlt;
    const buf =
      mod.getCachedSfx(url) ??
      mod.getCachedSfx(mod.SFX.gx1) ??
      mod.getCachedSfx(mod.SFX.gx2);
    if (buf) {
      mod.playSfx(buf, {
        volume: vol,
        playbackRate: 0.92 + Math.random() * 0.16,
      });
      return;
    }
    void mod.playSfxUrl(url, { volume: vol });
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
function inMapBounds(
  state: GameState,
  x: number,
  y: number,
  /** Extra inset (e.g. craft radius) so bodies don't sit on the lip */
  pad = 0,
): boolean {
  const map = state.map;
  const margin = Math.max(4, (map.cellSize ?? 16) * 0.2) + pad;
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
  pad = 0,
): boolean {
  if (!inMapBounds(state, toX, toY, pad)) return false;
  return canTraverseHeight(state.map, fromX, fromY, toX, toY);
}

function padFor(pilot: Pilot): number {
  return Math.max(2, pilot.radius * 0.45);
}

/** Relative yaw offsets for obstacle sliding (desired → side → reverse). */
const MOVE_SLIDE_YAW = [
  0,
  0.32,
  -0.32,
  0.64,
  -0.64,
  0.95,
  -0.95,
  1.3,
  -1.3,
  1.57,
  -1.57,
  Math.PI,
] as const;

/**
 * Move with wall/cliff sliding. Tries angled offsets then half-steps so
 * craft don't pin themselves on map edges or plateau faces.
 */
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
  if (len < 1e-6 || step < 1e-8) return false;
  const ux = mx / len;
  const uy = my / len;
  // Keep hull off the absolute map border
  const pad = padFor(pilot);
  const ox = pilot.x;
  const oy = pilot.y;

  for (let pass = 0; pass < 2; pass++) {
    const s = pass === 0 ? step : step * 0.42;
    for (let i = 0; i < MOVE_SLIDE_YAW.length; i++) {
      const a = MOVE_SLIDE_YAW[i]!;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      // Rotate desired unit vector by yaw offset
      const dx = (ux * c - uy * sn) * s;
      const dy = (ux * sn + uy * c) * s;
      if (dx * dx + dy * dy < 1e-12) continue;
      const nx = ox + dx;
      const ny = oy + dy;
      if (!canFlyTo(state, ox, oy, nx, ny, pad)) continue;
      pilot.x = nx;
      pilot.y = ny;
      return true;
    }
    // Axis + perpendicular fallbacks (classic slide)
    const candX = [ux * s, 0, -uy * s, uy * s, -ux * s * 0.5];
    const candY = [0, uy * s, ux * s, -ux * s, -uy * s * 0.5];
    for (let i = 0; i < candX.length; i++) {
      const dx = candX[i]!;
      const dy = candY[i]!;
      if (dx * dx + dy * dy < 1e-12) continue;
      const nx = ox + dx;
      const ny = oy + dy;
      if (!canFlyTo(state, ox, oy, nx, ny, pad)) continue;
      pilot.x = nx;
      pilot.y = ny;
      return true;
    }
  }
  return false;
}

/**
 * Soft push away from map borders / corners so AI doesn't grind the wall.
 * Strength 0 in the open, up to ~1 near edges.
 */
function borderAvoidVector(
  state: GameState,
  pilot: Pilot,
): { x: number; y: number; strength: number } {
  const map = state.map;
  const zone = Math.max(70, (map.cellSize ?? 30) * 3.2);
  let ax = 0;
  let ay = 0;
  if (pilot.x < zone) ax += (zone - pilot.x) / zone;
  if (pilot.x > map.width - zone) ax -= (pilot.x - (map.width - zone)) / zone;
  if (pilot.y < zone) ay += (zone - pilot.y) / zone;
  if (pilot.y > map.height - zone) ay -= (pilot.y - (map.height - zone)) / zone;
  // Corners: amplify so they don't slide along one wall into a pin
  if (ax !== 0 && ay !== 0) {
    ax *= 1.4;
    ay *= 1.4;
  }
  const strength = Math.min(1.15, Math.hypot(ax, ay));
  return { x: ax, y: ay, strength };
}

/** When blocked, fan toward map center / free headings until a step lands. */
function tryUnstickMove(
  state: GameState,
  pilot: Pilot,
  preferX: number,
  preferY: number,
  speed: number,
  dt: number,
): boolean {
  const map = state.map;
  const cx = map.width * 0.5 - pilot.x;
  const cy = map.height * 0.5 - pilot.y;
  const cd = Math.hypot(cx, cy) || 1;
  // Blend preferred escape with center pull
  let bx = preferX + (cx / cd) * 0.85;
  let by = preferY + (cy / cd) * 0.85;
  const bl = Math.hypot(bx, by);
  if (bl > 1e-6) {
    bx /= bl;
    by /= bl;
  } else {
    bx = cx / cd;
    by = cy / cd;
  }
  const base = Math.atan2(by, bx);
  // 12 directions around preferred escape (no alloc beyond loop)
  for (let i = 0; i < 12; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const k = Math.ceil(i / 2);
    const a = base + sign * k * (Math.PI / 6);
    if (applyMove(state, pilot, Math.cos(a), Math.sin(a), speed, dt)) {
      return true;
    }
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

function damagePilot(
  state: GameState,
  target: Pilot,
  amount: number,
  attackerId: string,
): void {
  if (target.respawn > 0) return;
  target.hp -= amount;
  spawnParticles(state, target.x, target.y, "#fda4af", 4, 120, "spark");
  const killer = state.pilots.find((p) => p.id === attackerId);

  if (target.hp <= 0) {
    target.hp = 0;
    target.respawn = 2.5;
    if (killer && killer.id !== target.id) {
      killer.score += 1;
      state.message = `${killer.name} crushed ${target.name}`;
      state.messageT = 2;
      if (killer.isPlayer) state.shake = 8;
      if (killer.score >= state.killLimit) {
        state.phase = "over";
        state.message = killer.isPlayer
          ? "MISSION COMPLETE"
          : `${killer.name} WINS`;
        state.messageT = 99;
      }
    }
    spawnExplosion(state, target.x, target.y, target.accent, 1.0);
    if (!sfxMuted && (killer?.isPlayer || target.isPlayer)) {
      if (sfxMod) {
        void sfxMod.resumeAudio();
        const buf = sfxMod.getCachedSfx(sfxMod.SFX.over);
        if (buf) sfxMod.playSfx(buf, { volume: 0.55 });
        else void sfxMod.playSfxUrl(sfxMod.SFX.over, { volume: 0.55 });
      } else {
        void import("@/lib/audio/sfx").then((mod) => {
          sfxMod = mod;
          void mod.playSfxUrl(mod.SFX.over, { volume: 0.55 });
        });
      }
    }
  } else {
    // Non-lethal hit feedback
    if (target.isPlayer) {
      // Player took damage
      playHitSfx("hurt");
      state.shake = Math.min(5, state.shake + 1.2);
    } else if (killer?.isPlayer) {
      // Player landed a hit on someone
      playHitSfx("confirm");
    }
  }
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Closest intersection of segment (x0,y0)→(x1,y1) with circle (cx,cy,r).
 * Returns parametric t in [0,1] or -1 if no hit.
 */
function segmentCircleHitT(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  r: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const r2 = r * r;
  if (a < 1e-10) {
    // Stationary — point-in-circle
    return fx * fx + fy * fy <= r2 ? 0 : -1;
  }
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r2;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  // Prefer earliest entry along the segment
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t2 >= 0 && t2 <= 1) return t2;
  // Segment fully inside circle (both ends inside)
  if (fx * fx + fy * fy <= r2) return 0;
  return -1;
}

/** Score enemies — skill scales how smart the pick is. */
function pickAiTarget(state: GameState, pilot: Pilot): Pilot | null {
  const prof = aiProfile(pilot.aiSkill || 1);
  const living: Pilot[] = [];
  for (const o of state.pilots) {
    if (o.id === pilot.id || o.respawn > 0) continue;
    living.push(o);
  }
  if (!living.length) return null;

  // Low skill: often just nearest
  if (Math.random() > prof.smartTarget) {
    let nearest = living[0]!;
    let bestD = Infinity;
    for (const o of living) {
      const d = (o.x - pilot.x) ** 2 + (o.y - pilot.y) ** 2;
      if (d < bestD) {
        bestD = d;
        nearest = o;
      }
    }
    return nearest;
  }

  let best: Pilot | null = null;
  let bestScore = -Infinity;
  for (const o of living) {
    const dist = Math.hypot(o.x - pilot.x, o.y - pilot.y) || 1;
    const hpFrac = o.hp / Math.max(1, o.maxHp);
    let score = 1400 / dist + (1 - hpFrac) * 42 * prof.smartTarget;
    if (o.isPlayer) score += 18 * prof.smartTarget;
    if (canProjectilePath(state.map, pilot.x, pilot.y, o.x, o.y)) {
      score += 28 * prof.smartTarget;
    }
    if (dist > pilot.speedStat * 4.5) score -= 20;
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}

/** Choose weapon by range band; low skill often random. */
function pickAiWeapon(state: GameState, pilot: Pilot, dist: number): void {
  const prof = aiProfile(pilot.aiSkill || 1);
  const usable: number[] = [];
  for (let i = 0; i < pilot.weapons.length; i++) {
    if (canSelectWeaponSlot(pilot, i)) usable.push(i);
  }
  if (!usable.length) {
    pilot.weaponIndex = 0;
    return;
  }
  // Random loadout pick for noobs
  if (Math.random() > prof.smartWeapon) {
    pilot.weaponIndex = usable[Math.floor(Math.random() * usable.length)]!;
    return;
  }

  type Cand = { slot: number; score: number };
  const cands: Cand[] = [];
  for (const i of usable) {
    const w = weaponById(pilot.weapons[i]!);
    const reach = pilot.speedStat * Math.max(0.4, w.range);
    let score = 1;
    const fit = 1 - Math.min(1, Math.abs(dist - reach * 0.55) / (reach + 80));
    score += fit * 40;
    score += w.damage * w.fireRate * 0.08 * (w.pellets || 1);
    if (w.style === "dart" && dist > reach * 0.4) score += 18;
    if (w.style === "cruise" && dist > reach * 0.5) score += 22;
    if (w.style === "scatter" && dist < reach * 0.7) score += 16;
    if (w.style === "pierce" && dist > 80) score += 14;
    if (w.style === "nuke" || w.style === "lob") {
      score += dist < reach * 0.75 ? 24 : -8;
    }
    if (w.style === "frost" || w.style === "storm" || w.ammo === "cloud") {
      score += dist < reach * 0.9 ? 20 : -10;
    }
    if (w.style === "heavy" && dist < reach * 0.85) score += 12;
    if (i > 0) score += 10;
    if (i === 0 && dist > pilot.speedStat * 2.2) score += 8;
    if (
      (w.style === "nuke" || w.style === "cruise") &&
      (pilot.ammo[w.id] ?? 0) <= 2
    ) {
      score -= dist > reach * 0.5 ? 0 : 6;
    }
    cands.push({ slot: i, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const top = cands.slice(0, Math.min(2, cands.length));
  pilot.weaponIndex =
    top.length > 1 && Math.random() < 0.22 ? top[1]!.slot : top[0]!.slot;
}

function findUsefulPickup(
  state: GameState,
  pilot: Pilot,
): { x: number; y: number; weaponId: number } | null {
  let best: { x: number; y: number; weaponId: number } | null = null;
  let bestD = Infinity;
  for (const pk of state.pickups) {
    if (!pk.alive) continue;
    const slot = pilot.weapons.indexOf(pk.weaponId);
    if (slot < 1) continue;
    const cur = pilot.ammo[pk.weaponId] ?? 0;
    if (cur >= 40) continue;
    const d = (pk.x - pilot.x) ** 2 + (pk.y - pilot.y) ** 2;
    // Prefer emptier slots
    const bias = cur <= 0 ? 0.55 : 1;
    const scoreD = d * bias;
    if (scoreD < bestD) {
      bestD = scoreD;
      best = pk;
    }
  }
  return best;
}

/** Incoming bullet dodge vector (away from nearest threat shot). */
function dodgeVector(state: GameState, pilot: Pilot): { x: number; y: number } {
  let bx = 0;
  let by = 0;
  let danger = 0;
  for (const b of state.bullets) {
    if (!b.alive || b.ownerId === pilot.id) continue;
    if (b.ammo === "mine") continue;
    const dx = pilot.x - b.x;
    const dy = pilot.y - b.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 160 || dist < 1) continue;
    // Is bullet roughly heading toward us?
    const spd = Math.hypot(b.vx, b.vy) || 1;
    const closing = -(dx * b.vx + dy * b.vy) / (dist * spd);
    if (closing < 0.35) continue;
    const weight = (closing * 140) / dist;
    // Perpendicular escape
    const px = -b.vy / spd;
    const py = b.vx / spd;
    // Pick side that increases separation
    const side = dx * px + dy * py >= 0 ? 1 : -1;
    bx += px * side * weight;
    by += py * side * weight;
    danger += weight;
  }
  if (danger < 0.15) return { x: 0, y: 0 };
  const len = Math.hypot(bx, by) || 1;
  return { x: bx / len, y: by / len };
}

function updateAI(state: GameState, pilot: Pilot, dt: number): void {
  if (pilot.catchTimer > 0) return;

  const prof = aiProfile(pilot.aiSkill || 1);
  pilot.aiTimer -= dt;
  const hpFrac = pilot.hp / Math.max(1, pilot.maxHp);

  // --- Mode / retarget (slower thinkers at low skill) ---
  if (pilot.aiTimer <= 0 || !pilot.aiTarget) {
    pilot.aiTimer = (0.2 + Math.random() * 0.35) * prof.thinkMul;
    const tgt = pickAiTarget(state, pilot);
    pilot.aiTarget = tgt?.id ?? null;
    if (tgt) {
      pickAiWeapon(state, pilot, Math.hypot(tgt.x - pilot.x, tgt.y - pilot.y));
    }
    const fieldAmmo = pilot.weapons
      .slice(1)
      .reduce((s, id) => s + Math.max(0, pilot.ammo[id] ?? 0), 0);
    const loot = findUsefulPickup(state, pilot);
    if (hpFrac < 0.22 + 0.08 * prof.tactics && Math.random() < prof.tactics) {
      pilot.aiMode = "flee";
    } else if (
      loot &&
      fieldAmmo < 8 &&
      Math.random() < 0.25 + 0.45 * prof.tactics
    ) {
      pilot.aiMode = "loot";
    } else if (loot && fieldAmmo < 3 && prof.tactics > 0.35) {
      pilot.aiMode = "loot";
    } else {
      pilot.aiMode = "engage";
    }
  }

  const target = state.pilots.find(
    (p) => p.id === pilot.aiTarget && p.respawn <= 0,
  );
  const loot =
    pilot.aiMode === "loot" || pilot.aiMode === "flee"
      ? findUsefulPickup(state, pilot)
      : hpFrac < 0.35 + 0.1 * prof.tactics && prof.tactics > 0.3
        ? findUsefulPickup(state, pilot)
        : null;

  // Estimate target velocity for lead (scaled by skill)
  let tvx = 0;
  let tvy = 0;
  if (target) {
    const idt = Math.max(0.008, dt);
    tvx = ((target.x - pilot.aiMemX) / idt) * prof.leadMul;
    tvy = ((target.y - pilot.aiMemY) / idt) * prof.leadMul;
    const tSpd = Math.hypot(tvx, tvy);
    if (tSpd > pilot.speedStat * 2.5) {
      tvx = 0;
      tvy = 0;
    }
    pilot.aiMemX = target.x;
    pilot.aiMemY = target.y;
  }

  if (target && Math.random() < dt * (0.4 + 1.1 * prof.smartWeapon)) {
    pickAiWeapon(
      state,
      pilot,
      Math.hypot(target.x - pilot.x, target.y - pilot.y),
    );
  }

  const w = weaponById(
    pilot.weapons[pilot.weaponIndex] ??
      getVulture(pilot.vultureId).starterWeaponId,
  );
  const planeSpd = Math.max(40, pilot.speedStat);
  const bulletSpd = Math.max(40, planeSpd * Math.max(0.15, w.bulletSpeed || 1));
  const maxReach =
    w.ammo === "mine"
      ? 100
      : w.ammo === "cloud"
        ? planeSpd * Math.max(1.0, w.range * 0.85)
        : planeSpd * w.range * 0.98;
  const engage = Math.max(70, maxReach * 0.48);

  // --- Aim ---
  let aimX = pilot.x + Math.cos(pilot.angle) * 40;
  let aimY = pilot.y + Math.sin(pilot.angle) * 40;
  if (target) {
    const dx0 = target.x - pilot.x;
    const dy0 = target.y - pilot.y;
    const dist0 = Math.hypot(dx0, dy0) || 1;
    const eta = dist0 / bulletSpd;
    const leadBase =
      w.ammo === "beam" || w.style === "poke"
        ? 0.35
        : w.ammo === "cloud"
          ? 0.55
          : 0.92;
    const leadT = eta * leadBase * prof.leadMul;
    aimX = target.x + tvx * leadT;
    aimY = target.y + tvy * leadT;
    // Skill-based aim jitter
    if (prof.aimJitter > 0.02) {
      const j = (Math.random() - 0.5) * 2 * prof.aimJitter;
      const j2 = (Math.random() - 0.5) * 2 * prof.aimJitter;
      aimX += Math.cos(pilot.angle + Math.PI / 2) * j * dist0 * 0.15;
      aimY += Math.sin(pilot.angle + Math.PI / 2) * j2 * dist0 * 0.15;
    }
    const desired = Math.atan2(aimY - pilot.y, aimX - pilot.x);
    const err = angleDiff(desired, pilot.angle);
    const maxTurn = prof.turnRate * dt;
    pilot.angle += Math.max(-maxTurn, Math.min(maxTurn, err));
  }

  // --- Movement ---
  let mx = 0;
  let my = 0;
  const rawDodge = dodgeVector(state, pilot);
  const dodge =
    prof.dodgeMul <= 0.05
      ? { x: 0, y: 0 }
      : Math.random() < prof.dodgeMul
        ? rawDodge
        : { x: 0, y: 0 };

  if (pilot.aiMode === "flee") {
    if (target) {
      const dx = pilot.x - target.x;
      const dy = pilot.y - target.y;
      const d = Math.hypot(dx, dy) || 1;
      mx = dx / d;
      my = dy / d;
    }
    if (loot) {
      const lx = loot.x - pilot.x;
      const ly = loot.y - pilot.y;
      const ld = Math.hypot(lx, ly) || 1;
      mx = mx * 0.45 + (lx / ld) * 0.55;
      my = my * 0.45 + (ly / ld) * 0.55;
    }
  } else if (pilot.aiMode === "loot" && loot) {
    const lx = loot.x - pilot.x;
    const ly = loot.y - pilot.y;
    const ld = Math.hypot(lx, ly) || 1;
    mx = lx / ld;
    my = ly / ld;
    if (target && prof.moveSkill > 0.35) {
      const dx = target.x - pilot.x;
      const dy = target.y - pilot.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < engage * 1.1) {
        mx = mx * 0.55 + (-dy / dist) * 0.45;
        my = my * 0.55 + (dx / dist) * 0.45;
      }
    }
  } else if (target) {
    const dx = target.x - pilot.x;
    const dy = target.y - pilot.y;
    const dist = Math.hypot(dx, dy) || 1;
    const orbit = state.time * 1.7 + pilot.hoverPhase;
    const side = Math.sin(orbit) >= 0 ? 1 : -1;
    const ms = prof.moveSkill;
    if (dist > engage + 50) {
      // Low skill: rush straight; high skill: weave
      mx = dx / dist + (-dy / dist) * 0.3 * side * ms;
      my = dy / dist + (dx / dist) * 0.3 * side * ms;
    } else if (dist < engage * 0.42) {
      if (ms < 0.35) {
        // Noobs keep pushing in
        mx = (dx / dist) * 0.4;
        my = (dy / dist) * 0.4;
      } else {
        mx = -dx / dist + (-dy / dist) * 0.55 * side;
        my = -dy / dist + (dx / dist) * 0.55 * side;
      }
    } else {
      // Strafe quality scales with skill
      const radial = dist > engage ? 0.2 : dist < engage * 0.75 ? -0.25 : 0;
      mx = (-dy / dist) * side * (0.35 + 0.65 * ms) + (dx / dist) * radial * ms;
      my = (dx / dist) * side * (0.35 + 0.65 * ms) + (dy / dist) * radial * ms;
      // Low skill still drifts toward target
      if (ms < 0.5) {
        mx += (dx / dist) * (0.5 - ms);
        my += (dy / dist) * (0.5 - ms);
      }
    }
    if (ms > 0.55) {
      const elevHere = sampleLevel(state.map, pilot.x, pilot.y);
      const elevT = sampleLevel(state.map, target.x, target.y);
      if (elevT > elevHere + 0.15 && dist < engage * 1.6) {
        mx = mx * 0.7 + (dx / dist) * 0.3;
        my = my * 0.7 + (dy / dist) * 0.3;
      }
    }
  }

  if (dodge.x !== 0 || dodge.y !== 0) {
    const dw = 0.35 + 0.45 * prof.dodgeMul;
    mx = mx * (1 - dw) + dodge.x * dw;
    my = my * (1 - dw) + dodge.y * dw;
  }

  // Steer off map edges / corners before they pin against the wall
  const avoid = borderAvoidVector(state, pilot);
  if (avoid.strength > 0.04) {
    const al = Math.hypot(avoid.x, avoid.y) || 1;
    // Near a wall: dominate intent so chase/flee stop driving into the border
    const w = Math.min(0.95, 0.35 + avoid.strength * 0.7);
    mx = mx * (1 - w) + (avoid.x / al) * w;
    my = my * (1 - w) + (avoid.y / al) * w;
  }

  // Idle wander if no goal — keeps bots from camping corners after a kill
  if (Math.hypot(mx, my) < 1e-4) {
    const wander = state.time * 0.55 + pilot.hoverPhase * 2.1;
    mx = Math.cos(wander);
    my = Math.sin(wander * 0.87);
    if (avoid.strength > 0.1) {
      const al = Math.hypot(avoid.x, avoid.y) || 1;
      mx = avoid.x / al;
      my = avoid.y / al;
    }
  }

  const mlen = Math.hypot(mx, my);
  if (mlen > 1e-4) {
    mx /= mlen;
    my /= mlen;
  }

  const speedMul =
    pilot.aiMode === "flee"
      ? 0.9 + 0.18 * prof.tactics
      : dodge.x !== 0
        ? 1.0 + 0.1 * prof.dodgeMul
        : 0.88 + 0.12 * prof.moveSkill;
  const moveSpd = pilot.speedStat * speedMul;
  const wishX = mx * moveSpd;
  const wishY = my * moveSpd;
  const nextV = approachVelocity(pilot.vx, pilot.vy, wishX, wishY, moveSpd, dt);
  pilot.vx = nextV.vx;
  pilot.vy = nextV.vy;
  const stepped = tryStep(
    pilot.x,
    pilot.y,
    pilot.vx,
    pilot.vy,
    dt,
    (x0, y0, x1, y1) => canFlyTo(state, x0, y0, x1, y1, padFor(pilot)),
  );
  pilot.x = stepped.x;
  pilot.y = stepped.y;
  pilot.vx = stepped.vx;
  pilot.vy = stepped.vy;
  let moved = stepped.moved;
  if (!moved) {
    const map = state.map;
    const toCx = map.width * 0.5 - pilot.x;
    const toCy = map.height * 0.5 - pilot.y;
    moved = tryUnstickMove(state, pilot, toCx, toCy, pilot.speedStat, dt);
    if (!moved) {
      pilot.vx = 0;
      pilot.vy = 0;
    }
  }
  updateStillness(pilot, moved, dt);

  // --- Fire ---
  if (!target || pilot.cooldown > 0) return;
  const dx = aimX - pilot.x;
  const dy = aimY - pilot.y;
  const distAim = Math.hypot(target.x - pilot.x, target.y - pilot.y) || 1;
  const face = Math.atan2(dy, dx);
  const aimErr = Math.abs(angleDiff(face, pilot.angle));
  const fireRange =
    maxReach * (w.style === "cruise" || w.style === "dart" ? 1.02 : 0.96);
  const baseTol =
    w.style === "dart" || w.style === "pierce"
      ? 0.12
      : w.style === "scatter" || w.ammo === "cloud"
        ? 0.38
        : w.style === "nuke" || w.style === "lob"
          ? 0.22
          : 0.18;
  const aimTol = baseTol * prof.aimLoose;
  const linedUp = aimErr < aimTol;
  const hasLos =
    prof.smartTarget < 0.35
      ? true
      : canProjectilePath(
          state.map,
          pilot.x,
          pilot.y,
          pilot.x + Math.cos(pilot.angle) * Math.min(distAim, 120),
          pilot.y + Math.sin(pilot.angle) * Math.min(distAim, 120),
        );

  if (distAim < fireRange && linedUp && hasLos) {
    if (
      pilot.aiMode === "flee" &&
      distAim > engage * 0.7 &&
      prof.tactics > 0.4
    ) {
      return;
    }
    // Skill gates fire rate / trigger discipline
    if (Math.random() <= prof.fireChance) {
      tryFire(state, pilot);
    }
  } else if (
    distAim < fireRange * 0.85 &&
    aimErr < aimTol * 1.8 &&
    w.style === "scatter" &&
    Math.random() < dt * (1 + 3 * prof.fireChance)
  ) {
    tryFire(state, pilot);
  }
}

function updatePlayer(state: GameState, pilot: Pilot, dt: number): void {
  const k = state.keys;

  // --- Aim: right stick first, otherwise mouse / last pointer ---
  const aimStick = state.aimStick;
  if (aimStick) {
    const sl = Math.hypot(aimStick.x, aimStick.y);
    if (sl > 1e-6) {
      pilot.angle = Math.atan2(aimStick.y, aimStick.x);
      state.pointer.x = pilot.x + (aimStick.x / sl) * AIM_LEAD;
      state.pointer.y = pilot.y + (aimStick.y / sl) * AIM_LEAD;
      state.pointer.active = true;
    }
  } else {
    const aimX = state.pointer.x;
    const aimY = state.pointer.y;
    const adx = aimX - pilot.x;
    const ady = aimY - pilot.y;
    if (adx * adx + ady * ady > 4) {
      pilot.angle = Math.atan2(ady, adx);
    }
  }

  // --- Move: left stick, else WASD / arrows (independent of aim) ---
  let mx = 0;
  let my = 0;
  const moveStick = state.moveStick;
  if (
    moveStick &&
    moveStick.x * moveStick.x + moveStick.y * moveStick.y > 1e-6
  ) {
    const sl = Math.hypot(moveStick.x, moveStick.y);
    const mag = Math.min(1, sl);
    mx = (moveStick.x / sl) * mag;
    my = (moveStick.y / sl) * mag;
  } else {
    if (k["KeyW"] || k["ArrowUp"]) my -= 1;
    if (k["KeyS"] || k["ArrowDown"]) my += 1;
    if (k["KeyA"] || k["ArrowLeft"]) mx -= 1;
    if (k["KeyD"] || k["ArrowRight"]) mx += 1;
    const len = Math.hypot(mx, my);
    if (len > 0) {
      mx /= len;
      my /= len;
    }
  }
  const wishX = mx * pilot.speedStat;
  const wishY = my * pilot.speedStat;
  const nextV = approachVelocity(
    pilot.vx,
    pilot.vy,
    wishX,
    wishY,
    pilot.speedStat,
    dt,
  );
  pilot.vx = nextV.vx;
  pilot.vy = nextV.vy;
  const stepped = tryStep(
    pilot.x,
    pilot.y,
    pilot.vx,
    pilot.vy,
    dt,
    (x0, y0, x1, y1) => canFlyTo(state, x0, y0, x1, y1, padFor(pilot)),
  );
  // Mouse aim is a heading, not a world pin. Without this, a still cursor
  // leaves pointer frozen on the map and the nose swings as the craft flies.
  if (!aimStick && state.pointer.active) {
    state.pointer.x += stepped.x - pilot.x;
    state.pointer.y += stepped.y - pilot.y;
  }
  pilot.x = stepped.x;
  pilot.y = stepped.y;
  pilot.vx = stepped.vx;
  pilot.vy = stepped.vy;
  updateStillness(pilot, stepped.moved, dt);

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

export function setMoveStick(
  state: GameState,
  stick: { x: number; y: number } | null,
): void {
  state.moveStick = stick;
}

export function setAimStick(
  state: GameState,
  stick: { x: number; y: number } | null,
): void {
  state.aimStick = stick;
}

export function setKey(state: GameState, code: string, down: boolean): void {
  // Pause is handled by GameCanvas UI (Esc menu). Only KeyP still toggles here
  // if UI did not intercept — avoid double-toggle with Escape.
  if (down) {
    if (
      code === "KeyP" &&
      (state.phase === "playing" || state.phase === "paused")
    ) {
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
  // Keys 1–4: 1 = default (∞), 2–4 = fixed loadout (ammo > 0 only)
  if (code.startsWith("Digit")) {
    const n = Number(code.slice(5));
    if (n >= 1 && n <= 4) {
      const slot = n - 1; // Digit1 → weapons[0], Digit4 → weapons[3]
      if (canSelectWeaponSlot(player, slot)) {
        player.weaponIndex = slot;
      } else if (slot > 0) {
        state.message = "탄약 없음";
        state.messageT = 0.8;
      }
    }
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
        // Death position is still pilot.x/y — respawn far from it
        const pos = pickSpawnPoint(state, {
          selfId: pilot.id,
          avoidX: pilot.x,
          avoidY: pilot.y,
        });
        pilot.hp = v.maxHp;
        pilot.x = pos.x;
        pilot.y = pos.y;
        pilot.vx = 0;
        pilot.vy = 0;
        pilot.angle = Math.random() * Math.PI * 2;
        pilot.caughtBy = null;
        pilot.catchTimer = 0;
        pilot.weaponIndex = 0;
        pilot.cooldown = 0;
        pilot.stillness = 1;
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
      if (pilot.catchTimer <= 0) {
        pilot.caughtBy = null;
        pilot.vx = 0;
        pilot.vy = 0;
      }
      continue;
    }
    if (pilot.isPlayer) updatePlayer(state, pilot, cap);
    else updateAI(state, pilot, cap);

    for (const pk of state.pickups) {
      if (!pk.alive) continue;
      const d = Math.hypot(pk.x - pilot.x, pk.y - pilot.y);
      if (d < pilot.radius + 14) {
        const w = weaponById(pk.weaponId);
        // Only weapons in this craft's fixed loadout (slots 1–3 / keys 2–4)
        const slot = pilot.weapons.indexOf(w.id);
        if (slot < 1) continue;
        const add = pickupAmmoAmount(w);
        const cur = pilot.ammo[w.id] ?? 0;
        // Stack ammo only — never auto-switch weapon
        pilot.ammo[w.id] = Math.min(99, Math.max(0, cur) + add);
        pk.alive = false;
        pk.respawnIn = 10;
        if (pilot.isPlayer) {
          const left = pilot.ammo[w.id] ?? 0;
          state.message = `획득: ${w.name} ×${left}  [키 ${slot + 1}]`;
          state.messageT = 1.5;
          if (!sfxMuted) {
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

    // ---- Expanding cloud AoE (storm vs frost personality) ----
    if (b.ammo === "cloud") {
      let spd = Math.hypot(b.vx, b.vy);
      // Frost nearly parks and grows; storm keeps crawling longer
      const drag = b.style === "frost" ? 0.96 : 0.991;
      if (spd > 0.5) {
        spd *= Math.pow(drag, cap * 60);
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
      const t = b.maxLife > 0 ? 1 - Math.max(0, b.life) / b.maxLife : 1;
      const ease =
        b.style === "frost"
          ? 1 - Math.pow(1 - t, 1.15)
          : 1 - Math.pow(1 - t, 1.6);
      b.radius = b.baseRadius + (b.growTo - b.baseRadius) * ease;

      if (b.life <= 0) {
        spawnCloudPuffs(state, b.x, b.y, b.color, 2, b.angle, 22);
        b.alive = false;
        continue;
      }

      for (const id of Object.keys(b.touch)) {
        b.touch[id] = (b.touch[id] ?? 0) - cap;
        if ((b.touch[id] ?? 0) <= 0) delete b.touch[id];
      }

      b.tick -= cap;
      if (b.tick <= 0) {
        // Frost: slower ticks, longer stick; storm: snappier
        b.tick = b.style === "frost" ? 0.38 : 0.28;
        const rehit = b.style === "frost" ? 0.62 : 0.45;
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
            b.touch[pilot.id] = rehit;
          }
        }
      }
      continue;
    }

    // ---- Flight + style quirks (ballistic or homing) ----
    let spd = Math.hypot(b.vx, b.vy) || 1;
    // Lob bombs decelerate (arc feel without gravity)
    if (b.style === "lob") {
      spd *= Math.pow(0.978, cap * 60);
      spd = Math.max(28, spd);
    }
    // Cruise stays nearly constant (heavy inertia)
    if (b.style === "cruise") {
      spd *= Math.pow(0.998, cap * 60);
    }
    // Seek nearest enemy when weapon has homing turn rate
    if (b.homing > 0) {
      const tgt = findHomingTarget(state, owner, b.x, b.y);
      if (tgt) {
        const desired = Math.atan2(tgt.y - b.y, tgt.x - b.x);
        const err = angleDiff(desired, b.angle);
        const maxTurn = b.homing * cap;
        b.angle += Math.max(-maxTurn, Math.min(maxTurn, err));
      }
    }
    b.vx = Math.cos(b.angle) * spd;
    b.vy = Math.sin(b.angle) * spd;
    const nx = b.x + b.vx * cap;
    const ny = b.y + b.vy * cap;

    const detonate = (skipId?: string) => {
      if (b.splashR > 0) {
        applySplash(
          state,
          b.x,
          b.y,
          owner,
          b.damage,
          b.splashR,
          b.splashMul,
          b.color,
          skipId,
        );
      } else if (b.ammo === "explosive" || b.ammo === "missile") {
        spawnExplosion(
          state,
          b.x,
          b.y,
          b.color,
          b.style === "nuke" ? 1.6 : 0.55,
        );
      }
    };

    if (!canProjectilePath(state.map, b.x, b.y, nx, ny)) {
      spawnParticles(state, b.x, b.y, b.color, 3, 70, "spark");
      // Nuke / lob / cruise explode on wall
      if (b.splashR > 0 || b.ammo === "explosive") {
        detonate();
      } else if (b.ammo === "missile") {
        spawnExplosion(state, b.x, b.y, b.color, 0.35);
      }
      b.alive = false;
      continue;
    }
    b.x = nx;
    b.y = ny;
    b.life -= cap;
    if (b.life <= 0 || nx < 0 || ny < 0 || nx > mapW || ny > mapH) {
      // Timeout detonation for bombs / cruise / nuke
      if (b.splashR > 0 || b.ammo === "explosive") {
        detonate();
      }
      b.alive = false;
      continue;
    }

    // Segment vs craft discs — prevents fast missiles tunneling through ships.
    // Any craft hit destroys the projectile (no pierce-through).
    const ox = b.x - b.vx * cap; // position before this step (we already wrote nx into b.x)
    const oy = b.y - b.vy * cap;
    // b.x/b.y already advanced to nx/ny above
    const x0 = ox;
    const y0 = oy;
    const x1 = b.x;
    const y1 = b.y;
    const hitR = Math.max(2.5, b.radius);

    let hitPilot: Pilot | null = null;
    let hitT = 2; // parametric t along segment [0,1]
    for (let pi = 0; pi < pilots.length; pi++) {
      const pilot = pilots[pi]!;
      if (pilot.id === owner || pilot.respawn > 0) continue;
      const rr = pilot.radius + hitR;
      const t = segmentCircleHitT(x0, y0, x1, y1, pilot.x, pilot.y, rr);
      if (t >= 0 && t <= 1 && t < hitT) {
        hitT = t;
        hitPilot = pilot;
      }
    }

    if (hitPilot) {
      // Snap impact point onto the segment for FX
      b.x = x0 + (x1 - x0) * hitT;
      b.y = y0 + (y1 - y0) * hitT;

      if (b.catcher) {
        hitPilot.caughtBy = owner;
        hitPilot.catchTimer = 2.5;
        hitPilot.vx = 0;
        hitPilot.vy = 0;
        state.message = `${hitPilot.name} caught!`;
        state.messageT = 1.2;
        spawnParticles(state, b.x, b.y, "#34d399", 10, 80, "spark");
        b.alive = false;
        continue;
      }

      damagePilot(state, hitPilot, b.damage, owner);

      if (b.splashR > 0) {
        detonate(hitPilot.id);
      } else if (b.ammo === "explosive" || b.ammo === "missile") {
        spawnExplosion(
          state,
          b.x,
          b.y,
          b.color,
          b.style === "dart" ? 0.4 : 0.85,
        );
      } else {
        spawnParticles(state, b.x, b.y, b.color, 8, 120, "spark");
      }
      // Always consume projectile on craft impact (user rule: no pass-through)
      b.alive = false;
      b.pierceLeft = 0;
      continue;
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

/**
 * Exercise combat hot paths (fire all slots, explosions, particles) so the
 * first real match frames stay smooth after loading.
 * Restores ammo / weapon selection afterward.
 */
export function warmupCombat(state: GameState): void {
  for (const pilot of state.pilots) {
    if (pilot.respawn > 0) continue;
    const savedIndex = pilot.weaponIndex;
    const savedAmmo = { ...pilot.ammo };
    const savedCd = pilot.cooldown;
    for (let i = 0; i < pilot.weapons.length; i++) {
      const wid = pilot.weapons[i]!;
      if ((pilot.ammo[wid] ?? 0) === 0) pilot.ammo[wid] = 3;
      pilot.weaponIndex = i;
      pilot.cooldown = 0;
      tryFire(state, pilot);
      pilot.cooldown = 0;
    }
    pilot.weaponIndex = savedIndex;
    pilot.ammo = savedAmmo;
    pilot.cooldown = savedCd;
  }
  // Cover explosion / debris particle paths
  const cx = state.map.width * 0.5;
  const cy = state.map.height * 0.5;
  spawnExplosion(state, cx, cy, "#22d3ee", 0.7);
  spawnCloudPuffs(state, cx, cy, "#22d3ee", 3, 0, 40);
  spawnParticles(state, cx, cy, "#fbbf24", 6, 100, "spark");
}

export type { VultureDef, WeaponDef, MapDef };
