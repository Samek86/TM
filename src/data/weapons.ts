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
    damage: 16,
    fireRate: 4,
    bulletSpeed: 1.15,
    spread: 0.02,
    pellets: 1,
    range: 2.55,
    note: "Born 전용 · Vulcan 개량",
    color: "#f97316",
    bodySpr: "wp2.spr",
    shotSpr: "WP2SHT.SPR",
    sfxId: 2,
  },
  {
    id: 3,
    name: "EM-Gun",
    ammo: "cloud",
    allowed: allow(false, true, false),
    /** Killers default — expanding storm cloud, continuous AoE, unlimited */
    damage: 7,
    fireRate: 1.65,
    bulletSpeed: 0.22,
    spread: 0,
    pellets: 1,
    /** For cloud: life duration (seconds) */
    range: 2.6,
    note: "Killers 기본 · 구름 확산 광역 (무제한)",
    color: "#22d3ee",
    bodySpr: "wp3.spr",
    shotSpr: "WP3SHT.SPR",
    sfxId: 3,
    maxAmmo: null,
  },
  {
    id: 4,
    name: "Plazma Shooter",
    ammo: "special",
    allowed: allow(false, false, true),
    /** Sorcerer default — weak, unlimited */
    damage: 6,
    fireRate: 5.5,
    bulletSpeed: 1.14,
    spread: 0.04,
    pellets: 1,
    range: 2.1,
    note: "Sorcerer 기본 · 약하지만 빠른 연사 (무제한)",
    color: "#a78bfa",
    bodySpr: "wp4.spr",
    shotSpr: "wp4sht.spr",
    sfxId: 4,
    maxAmmo: null,
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
    /** Born Armor default — twin laser, unlimited */
    damage: 11,
    fireRate: 4.2,
    bulletSpeed: 1.35,
    spread: 0.1,
    pellets: 2,
    range: 3.15,
    note: "Born 기본 · 2연 레이저 (무제한)",
    color: "#4ade80",
    bodySpr: "wp6.spr",
    shotSpr: "WP6SHT.SPR",
    sfxId: 6,
    maxAmmo: null,
  },
  {
    id: 7,
    name: "Spiner",
    ammo: "energy",
    allowed: allow(true, true, false),
    damage: 12,
    fireRate: 3.0,
    bulletSpeed: 1.08,
    spread: 0.06,
    pellets: 2,
    range: 2.35,
    note: "Born+Killers · energy",
    color: "#34d399",
    bodySpr: "wp7.spr",
    shotSpr: "WP7SHT.SPR",
    sfxId: 7,
  },
  {
    id: 8,
    name: "Slayer",
    ammo: "special",
    allowed: allow(false, false, true),
    damage: 26,
    fireRate: 1.8,
    bulletSpeed: 1.0,
    spread: 0,
    pellets: 1,
    range: 2.25,
    note: "Sorcerer",
    color: "#c084fc",
    bodySpr: "wp8.spr",
    shotSpr: "wp8sht.spr",
    sfxId: 8,
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
    damage: 34,
    fireRate: 1.2,
    bulletSpeed: 0.88,
    spread: 0.04,
    pellets: 1,
    range: 2.2,
    note: "Killers · 폭발 · 중거리",
    color: "#ef4444",
    bodySpr: "wp11.spr",
    shotSpr: "WP11SHT.SPR",
    sfxId: 11,
  },
  {
    id: 12,
    name: "Stinger",
    ammo: "missile",
    allowed: allow(true, false, true),
    damage: 22,
    fireRate: 1.8,
    bulletSpeed: 1.12,
    spread: 0.01,
    pellets: 1,
    range: 3.0,
    note: "Born+Sorcerer · 경미사일 · 중장거리",
    color: "#e11d48",
    bodySpr: "wp12.spr",
    shotSpr: "WP12SHT.SPR",
    sfxId: 12,
  },
  {
    id: 13,
    name: "Multi Missiler",
    ammo: "missile",
    allowed: allow(false, true, true),
    damage: 12,
    fireRate: 1.5,
    bulletSpeed: 1.06,
    spread: 0.12,
    pellets: 3,
    range: 2.6,
    note: "Killers+Sorcerer · 다연장 · 살포형",
    color: "#f43f5e",
    bodySpr: "wp13.spr",
    shotSpr: "WP13SHT.SPR",
    sfxId: 13,
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
    damage: 48,
    fireRate: 0.65,
    bulletSpeed: 0.8,
    spread: 0,
    pellets: 1,
    range: 3.9,
    note: "Born · 대형 순항 미사일 · 최장",
    color: "#f43f5e",
    bodySpr: "wp15.spr",
    shotSpr: "WP15SHT.SPR",
    sfxId: 15,
  },
  {
    id: 16,
    name: "Burst Apocalypse",
    ammo: "explosive",
    allowed: allow(false, true, false),
    damage: 45,
    fireRate: 0.7,
    bulletSpeed: 0.9,
    spread: 0.05,
    pellets: 1,
    range: 2.45,
    note: "Killers · WP16 폭발",
    color: "#dc2626",
    bodySpr: "WP16.SPR",
    shotSpr: "WP16SHT.SPR",
    sfxId: 16,
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
    damage: 5,
    fireRate: 1.5,
    bulletSpeed: 0.2,
    spread: 0,
    pellets: 1,
    range: 2.5,
    note: "Sorcerer · 냉기 구름 확산",
    color: "#67e8f9",
    bodySpr: "wp4.spr",
    shotSpr: "wp4sht.spr",
    sfxId: 4,
    maxAmmo: 10,
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

export function weaponAllowed(w: WeaponDef, vulture: VultureId): boolean {
  return w.allowed.length === 0 || w.allowed.includes(vulture);
}

export function getWeaponById(id: number): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0]!;
}
