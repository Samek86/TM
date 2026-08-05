import type { VultureId } from "./weapons";

export interface VultureDef {
  id: VultureId;
  order: number;
  name: string;
  codeName: string;
  spriteHint: string;
  /**
   * Cruise speed in map tiles per second (× cellSize → world units).
   * Born medium · Killers slightly slow · Sorcerer fast.
   */
  tilesPerSec: number;
  maxHp: number;
  /** Hitbox radius in tile fractions (× cellSize at match start). */
  radiusTiles: number;
  /** Outgoing damage multiplier */
  damageMul: number;
  /** Default unlimited weapon id */
  starterWeaponId: number;
  /**
   * Fixed field weapon slots for keys 2–4 (key 1 = starter).
   * Exactly 3: first two exclusive to this craft, last one shared with another craft.
   * Ammo starts at 0 until picked up; empty slots cannot be selected.
   */
  loadoutWeaponIds: readonly [number, number, number];
  color: string;
  accent: string;
  blurb: string;
  lore: string;
}

/**
 * Per-craft loadouts — 4 weapons total (key 1 starter + keys 2–4 field).
 *
 * | Craft    | 2 exclusive | 3 exclusive | 4 shared              |
 * |----------|-------------|-------------|------------------------|
 * | Born     | ATi-Gun     | Tomahawk    | Stinger (↔ Sorcerer)   |
 * | Killers  | Fire Bomb   | Burst Apoc. | Multi (↔ Sorcerer)     |
 * | Sorcerer | Slayer      | Ice Bault   | Stinger (↔ Born)       |
 */
export const VULTURES: VultureDef[] = [
  {
    id: "born_armor",
    order: 1,
    name: "Born Armor",
    codeName: "XRb 324-A Krisaris BA",
    spriteHint: "char1.spr",
    tilesPerSec: 14.5,
    maxHp: 120,
    radiusTiles: 0.75,
    damageMul: 1.0,
    starterWeaponId: 6, // Laser Cannon twin
    loadoutWeaponIds: [2, 15, 12], // ATi, Tomahawk | Stinger shared
    color: "#94a3b8",
    accent: "#f59e0b",
    blurb: "표준형 · 2연 레이저 · 필드 3슬롯",
    lore: "기본형. 무제한 2연 레이저. 필드: ATi·Tomahawk(전용) + Stinger(공유). 픽업 무기가 기본보다 훨씬 강함.",
  },
  {
    id: "killers_pot",
    order: 2,
    name: "Killers Pot",
    codeName: "Killers Pot",
    spriteHint: "char2.spr",
    tilesPerSec: 12.5, // slightly slower
    maxHp: 145,
    radiusTiles: 1.0,
    damageMul: 1.15,
    starterWeaponId: 3, // EM-Gun cloud burst
    loadoutWeaponIds: [11, 16, 13], // Fire Bomb, Burst Apoc. | Multi shared
    color: "#38bdf8",
    accent: "#22d3ee",
    blurb: "중장갑 · 구름 기본 · 필드 3슬롯",
    lore: "기본 구름은 안정 광역. 필드: Fire Bomb·Burst Apocalypse(전용) + Multi(공유)로 한 방에 판을 뒤집음.",
  },
  {
    id: "sorcerer",
    order: 3,
    name: "Sorcerer",
    codeName: "Sorcerer",
    spriteHint: "char3.spr",
    tilesPerSec: 18.5,
    maxHp: 90,
    radiusTiles: 0.6,
    damageMul: 0.85,
    starterWeaponId: 4, // Plazma weak
    loadoutWeaponIds: [8, 20, 12], // Slayer, Ice Bault | Stinger shared
    color: "#c084fc",
    accent: "#a78bfa",
    blurb: "기동형 · 고연사 기본 · 필드 3슬롯",
    lore: "기본 플라즈마는 견제용. 필드: Slayer·Ice Bault(전용) + Stinger(공유)가 본 화력.",
  },
];

export function getVulture(id: VultureId): VultureDef {
  return VULTURES.find((v) => v.id === id) ?? VULTURES[0]!;
}
