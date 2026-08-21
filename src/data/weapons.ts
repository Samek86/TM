/**
 * Weapon definitions — names & vulture masks from Tm.run 0x39C20 (23-byte records).
 * Numeric combat values are revival-tuned until .data tables are recovered from BSS/runtime.
 * See docs/reversing/WEAPON_TABLE.json
 */

export type AmmoType =
  | "shell"
  | "special"
  | "energy"
  | "explosive"
  | "missile"
  | "beam"
  | "mine"
  | "cloud";

export type VultureId = "born_armor" | "killers_pot" | "sorcerer";

/**
 * Combat personality — drives hit rules, splash, pierce, and projectile silhouette.
 * Every active loadout weapon should use a distinct style.
 */
export type WeaponStyle =
  | "default"
  /** Twin parallel beams (Born baseline) */
  | "twin_beam"
  /** Fast weak poke bolts (Sorcerer baseline) */
  | "poke"
  /** Expanding storm cloud (Killers baseline) */
  | "storm"
  /** High-rate bolt that pierces through targets */
  | "pierce"
  /** Thin, very fast interceptor missile */
  | "dart"
  /** Fat cruise missile + impact splash */
  | "cruise"
  /** Wide multi-rocket volley */
  | "scatter"
  /** Slow lob bomb + medium splash */
  | "lob"
  /** Huge detonation splash (direct + timeout) */
  | "nuke"
  /** Heavy single energy bolt */
  | "heavy"
  /** Large slow frost cloud (area deny) */
  | "frost";

export interface WeaponDef {
  id: number;
  name: string;
  ammo: AmmoType;
  /** Empty = all vultures (from binary B/K/S all 1 or treated as universal) */
  allowed: VultureId[];
  damage: number;
  fireRate: number;
  /** Ratio of firer speed (~0.82–1.18) */
  bulletSpeed: number;
  spread: number;
  pellets: number;
  /** Max distance in plane-seconds */
  range: number;
  note: string;
  color: string;
  /** Client body sprite filename (null = missing from pack) */
  bodySpr: string | null;
  /** Client shot FX sprite (null = missing) */
  shotSpr: string | null;
  /** shootN.wav index or null */
  sfxId: number | null;
  /**
   * Pickup restock amount. `null` / omit = unlimited (starter defaults).
   * Field weapons always have a finite maxAmmo.
   */
  maxAmmo?: number | null;
  /** Distinct combat identity (see WeaponStyle) */
  style?: WeaponStyle;
  /** Extra targets the projectile may pass through after the first hit */
  pierce?: number;
  /** Splash radius in world units on impact / timeout (0 = none) */
  splashRadius?: number;
  /** Splash damage as a fraction of main damage (default 0.55) */
  splashMul?: number;
  /** Multiplier on projectile hitbox / draw size */
  hitScale?: number;
  /**
   * Homing turn rate in rad/s. `0` / omit = ballistic (no tracking).
   * Higher = snappier pursuit of nearest living enemy.
   */
  homing?: number;
}

function allow(B: boolean, K: boolean, S: boolean): VultureId[] {
  const a: VultureId[] = [];
  if (B) a.push("born_armor");
  if (K) a.push("killers_pot");
  if (S) a.push("sorcerer");
  // all three → treat as universal (empty)
  if (a.length === 3) return [];
  return a;
}

/**
 * Full 21-name table from Tm.run.
 *
 * `range` = plane-seconds of flight (life = range / bulletSpeed).
 * World distance ≈ speedStat × range. Map ~1280u, Born speed ~290u/s →
 * range 1.0 ≈ 290u (~¼ map diagonal short), 3.0 ≈ 870u (long lane).
 *
 * Missile ladder (max reach, seconds):
 *   Multi 2.6 < Stinger 3.0 < Burst 2.9 < Tow 3.5 < Tomahawk 3.9
 * Shells/beams shorter or longer by class for readable counterplay.
 */
export const WEAPONS: WeaponDef[] = [
  {
    id: 1,
    name: "Vulcan Cannon",
    ammo: "shell",
    allowed: allow(true, true, true),
    damage: 7,
    fireRate: 7,
    bulletSpeed: 1.18,
    spread: 0.06,
    pellets: 2,
    range: 2.15,
    note: "공통 기관포 · 근접 연사",
    color: "#fbbf24",
    bodySpr: "wp1.spr",
    shotSpr: "WP1SHT.SPR",
    sfxId: 1,
    maxAmmo: 40,
  },
  {
    id: 2,
    name: "ATi-Gun",
    ammo: "special",
    allowed: allow(true, false, false),
    /** Born exclusive — piercing line rifle (unique: goes through 2 targets) */
    damage: 18,
    fireRate: 5.2,
    bulletSpeed: 1.28,
    spread: 0.01,
    pellets: 1,
    range: 3.0,
    note: "Born 전용 · 고속 관통형 외형 · 명중 시 소멸",
    color: "#f97316",
    bodySpr: "wp2.spr",
    shotSpr: "WP2SHT.SPR",
    sfxId: 2,
    maxAmmo: 32,
    style: "pierce",
    pierce: 0,
    hitScale: 0.85,
  },
  {
    id: 3,
    name: "EM-Gun",
    ammo: "cloud",
    allowed: allow(false, true, false),
    /** Killers default — mid storm cloud (weaker than frost field) */
    damage: 6,
    fireRate: 5,
    bulletSpeed: 1.404, // was 1.08 · ×1.3 cloud travel speed
    spread: 0,
    pellets: 1,
    range: 2.08,
    note: "Killers 기본 · 이동형 번개 구름 (무제한)",
    color: "#22d3ee",
    bodySpr: "wp3.spr",
    shotSpr: "WP3SHT.SPR",
    sfxId: 3,
    maxAmmo: null,
    style: "storm",
    hitScale: 1.0,
  },
  {
    id: 4,
    name: "Plazma Shooter",
    ammo: "special",
    allowed: allow(false, false, true),
    /** Sorcerer default — fastest poke, lowest chunk damage */
    damage: 7, // was 5 · ×1.4
    fireRate: 6, // Born laser 3.6 · faster poke, not a hose (was 10.2)
    bulletSpeed: 2.015, // was 1.55 · ×1.3
    spread: 0.03,
    pellets: 1,
    range: 2.0,
    note: "Sorcerer 기본 · 초고속 견제 볼트 (무제한)",
    color: "#a78bfa",
    bodySpr: "wp4.spr",
    shotSpr: "wp4sht.spr",
    sfxId: 4,
    maxAmmo: null,
    style: "poke",
    hitScale: 0.7,
  },
  {
    id: 5,
    name: "Gun Cannon",
    ammo: "shell",
    allowed: allow(true, false, false),
    damage: 20,
    fireRate: 2.5,
    bulletSpeed: 1.12,
    spread: 0.03,
    pellets: 1,
    range: 2.85,
    note: "Born · 중장거리 포",
    color: "#fb923c",
    bodySpr: "wp5.spr",
    shotSpr: "wp5sht.spr",
    sfxId: 5,
  },
  {
    id: 6,
    name: "Laser Cannon",
    ammo: "beam",
    allowed: allow(true, false, false),
    /** Born default — twin parallel beams, longest baseline reach */
    damage: 7,
    fireRate: 3.6,
    bulletSpeed: 1.35,
    spread: 0.1,
    pellets: 2,
    range: 3.15,
    note: "Born 기본 · 2연 평행 레이저 · 장거리 안정 (무제한)",
    color: "#4ade80",
    bodySpr: "wp6.spr",
    shotSpr: "WP6SHT.SPR",
    sfxId: 6,
    maxAmmo: null,
    style: "twin_beam",
    hitScale: 0.9,
  },
  {
    id: 7,
    name: "Spiner",
    ammo: "energy",
    allowed: allow(true, true, false),
    damage: 14,
    fireRate: 3.2,
    bulletSpeed: 1.1,
    spread: 0.05,
    pellets: 2,
    range: 2.4,
    note: "레거시 공유 (현재 로드아웃 미사용)",
    color: "#34d399",
    bodySpr: "wp7.spr",
    shotSpr: "WP7SHT.SPR",
    sfxId: 7,
    maxAmmo: 28,
  },
  {
    id: 8,
    name: "Slayer",
    ammo: "special",
    allowed: allow(false, false, true),
    /** Sorcerer exclusive — chunky energy slug, big hitbox, mid speed */
    damage: 44,
    fireRate: 1.9,
    bulletSpeed: 1.02,
    spread: 0,
    pellets: 1,
    range: 2.7,
    note: "Sorcerer 전용 · 대형 에너지 탄 · 두꺼운 히트박스",
    color: "#c084fc",
    bodySpr: "wp8.spr",
    shotSpr: "wp8sht.spr",
    sfxId: 8,
    maxAmmo: 16,
    style: "heavy",
    hitScale: 1.65,
  },
  {
    id: 9,
    name: "Paranoid Shooter",
    ammo: "special",
    allowed: allow(false, true, true),
    damage: 18,
    fireRate: 2.4,
    bulletSpeed: 1.08,
    spread: 0.04,
    pellets: 1,
    range: 2.5,
    note: "Killers+Sorcerer",
    color: "#e879f9",
    bodySpr: "wp9.spr",
    shotSpr: "WP9SHT.SPR",
    sfxId: 9,
  },
  {
    id: 10,
    name: "S-mine",
    ammo: "mine",
    allowed: allow(true, true, true),
    damage: 36,
    fireRate: 1.15,
    /** mines do not travel — speed ignored */
    bulletSpeed: 0,
    spread: 0,
    pellets: 1,
    /** For mine: arm lifetime (seconds) before auto-despawn */
    range: 9.5,
    note: "공통 · 공중 지뢰 (제자리 체류 · 접촉 기폭)",
    color: "#a3e635",
    bodySpr: "wp10.spr",
    shotSpr: "WP10SHT.SPR",
    sfxId: 10,
    maxAmmo: 8,
  },
  {
    id: 11,
    name: "Fire Bomb",
    ammo: "explosive",
    allowed: allow(false, true, false),
    /** Killers exclusive — slow lob bomb, medium splash (not full nuke) */
    damage: 57, // was 38 · ×1.5
    fireRate: 1.25,
    bulletSpeed: 0.72,
    spread: 0,
    pellets: 1,
    range: 2.35,
    note: "Killers 전용 · 저속 투척 폭탄 · 중간 스플래시",
    color: "#ef4444",
    bodySpr: "wp11.spr",
    shotSpr: "WP11SHT.SPR",
    sfxId: 11,
    maxAmmo: 12,
    style: "lob",
    splashRadius: 72,
    splashMul: 0.7,
    hitScale: 1.35,
  },
  {
    id: 12,
    name: "Stinger",
    ammo: "missile",
    allowed: allow(true, false, true),
    /** Shared — thinnest/fastest interceptor, no splash */
    damage: 28,
    fireRate: 2.9,
    bulletSpeed: 1.48,
    spread: 0,
    pellets: 1,
    range: 3.4,
    note: "공유 · 초고속 세침 미사일 · 스플래시 없음",
    color: "#e11d48",
    bodySpr: "wp12.spr",
    shotSpr: "WP12SHT.SPR",
    sfxId: 12,
    maxAmmo: 22,
    style: "dart",
    hitScale: 0.55,
  },
  {
    id: 13,
    name: "Multi Missiler",
    ammo: "missile",
    allowed: allow(false, true, true),
    /** Killers shared — widest fan, many small rockets */
    damage: 11,
    fireRate: 1.7,
    bulletSpeed: 1.05,
    spread: 0.2,
    pellets: 5,
    range: 2.55,
    note: "Killers 공유 · 5연장 부채꼴 살포",
    color: "#f43f5e",
    bodySpr: "wp13.spr",
    shotSpr: "WP13SHT.SPR",
    sfxId: 13,
    maxAmmo: 20,
    style: "scatter",
    hitScale: 0.65,
  },
  {
    id: 14,
    name: "Tow Missile",
    ammo: "missile",
    allowed: allow(false, true, true),
    damage: 40,
    fireRate: 0.8,
    bulletSpeed: 0.92,
    spread: 0,
    pellets: 1,
    range: 3.5,
    note: "Killers+Sorcerer · 중미사일 · 장거리",
    color: "#fb7185",
    bodySpr: "wp14.spr",
    shotSpr: "WP14SHT.SPR",
    sfxId: 14,
  },
  {
    id: 15,
    name: "Tomahawk",
    ammo: "missile",
    allowed: allow(true, false, false),
    /** Born exclusive — slowest fat cruise + big splash, longest reach */
    damage: 58,
    fireRate: 0.7,
    bulletSpeed: 0.68,
    spread: 0,
    pellets: 1,
    range: 4.4,
    note: "Born 전용 · 저속 대형 순항 · 최장거리 + 광역 폭발",
    color: "#f43f5e",
    bodySpr: "wp15.spr",
    shotSpr: "WP15SHT.SPR",
    sfxId: 15,
    maxAmmo: 7,
    style: "cruise",
    splashRadius: 88,
    splashMul: 0.65,
    hitScale: 1.9,
  },
  {
    id: 16,
    name: "Burst Apocalypse",
    ammo: "explosive",
    allowed: allow(false, true, false),
    /** Killers exclusive — biggest blast radius (impact + timeout), seeks targets */
    damage: 48,
    fireRate: 0.72,
    /** Ratio of firer cruise — slightly under Killers Pot (~0.92×) */
    bulletSpeed: 0.92,
    spread: 0,
    pellets: 1,
    range: 2.5,
    note: "Killers 전용 · 유도 초광역 핵폭발 · 명중·소멸 모두 폭발",
    color: "#dc2626",
    bodySpr: "WP16.SPR",
    shotSpr: "WP16SHT.SPR",
    sfxId: 16,
    maxAmmo: 6,
    style: "nuke",
    splashRadius: 125,
    splashMul: 0.85,
    hitScale: 1.5,
    /** Aggressive pursuit so the fat nuke can still catch strafe */
    homing: 3.8,
  },
  {
    id: 17,
    name: "Blazing Beam",
    ammo: "beam",
    allowed: allow(true, false, true),
    damage: 18,
    fireRate: 2.8,
    bulletSpeed: 1.28,
    spread: 0,
    pellets: 1,
    range: 3.35,
    note: "Born+Sorcerer · 장거리 빔",
    color: "#fbbf24",
    bodySpr: "wp17.spr",
    shotSpr: "WP17SHT.SPR",
    sfxId: 17,
  },
  {
    id: 18,
    name: "Fire Bault",
    ammo: "cloud",
    allowed: allow(true, false, false),
    damage: 6,
    fireRate: 1.4,
    bulletSpeed: 0.18,
    spread: 0,
    pellets: 1,
    range: 2.4,
    note: "Born · 화염 구름 확산",
    color: "#f97316",
    bodySpr: "wp11.spr",
    shotSpr: "WP11SHT.SPR",
    sfxId: 11,
    maxAmmo: 10,
  },
  {
    id: 19,
    name: "Burst Launcher",
    ammo: "missile",
    allowed: allow(false, true, false),
    damage: 32,
    fireRate: 1.2,
    bulletSpeed: 0.98,
    spread: 0.08,
    pellets: 2,
    range: 2.9,
    note: "Killers · 중형 2연장",
    color: "#ef4444",
    bodySpr: null,
    shotSpr: null,
    sfxId: null,
  },
  {
    id: 20,
    name: "Ice Bault",
    ammo: "cloud",
    allowed: allow(false, false, true),
    /** Sorcerer exclusive — huge slow frost zone (area deny vs EM storm) */
    damage: 12,
    fireRate: 1.35,
    bulletSpeed: 0.16,
    spread: 0,
    pellets: 1,
    range: 3.4,
    note: "Sorcerer 전용 · 거대 저속 냉기 장판 · 영역 봉쇄",
    color: "#67e8f9",
    bodySpr: "wp4.spr",
    shotSpr: "wp4sht.spr",
    sfxId: 4,
    maxAmmo: 12,
    style: "frost",
    hitScale: 1.25,
  },
  {
    id: 21,
    name: "Lust Cannon",
    ammo: "special",
    allowed: allow(false, true, false),
    damage: 36,
    fireRate: 1.4,
    bulletSpeed: 1.05,
    spread: 0.02,
    pellets: 1,
    range: 2.7,
    note: "Killers",
    color: "#e11d48",
    bodySpr: "wp21.spr",
    shotSpr: "wp21sht.spr",
    sfxId: 21,
  },
];

/** Weapons that have pickup/body assets in the extracted client */
export const PICKUP_WEAPONS = WEAPONS.filter((w) => w.id !== 1 && w.bodySpr);

export const FULL_WEAPON_ROSTER = WEAPONS.map((w) => w.name);

/** All weapon ids that appear in any craft's fixed field loadout (pickups). */
export const FIELD_LOADOUT_WEAPON_IDS: readonly number[] = [
  2, // ATi-Gun (Born exclusive)
  8, // Slayer (Sorcerer exclusive)
  11, // Fire Bomb (Killers exclusive)
  12, // Stinger (Born+Sorcerer shared)
  13, // Multi Missiler (Killers shared)
  15, // Tomahawk (Born exclusive)
  16, // Burst Apocalypse (Killers exclusive)
  20, // Ice Bault (Sorcerer exclusive)
];

/**
 * Whether this craft may use the weapon.
 * Starter defaults and fixed loadout slots only — not the full legacy table.
 */
export function weaponAllowed(w: WeaponDef, vulture: VultureId): boolean {
  // Lazy import avoided: callers pass craft loadout via engine; here keep table mask
  // as secondary check. Primary gate is pilot.weapons membership in engine.
  return w.allowed.length === 0 || w.allowed.includes(vulture);
}

export function getWeaponById(id: number): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0]!;
}

/** Restock amount when picking up a field weapon. */
export function pickupAmmoAmount(w: WeaponDef): number {
  if (w.maxAmmo != null && w.maxAmmo > 0) return w.maxAmmo;
  return 8;
}
