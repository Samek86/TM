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
  color: string;
  accent: string;
  blurb: string;
  lore: string;
}

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
    color: "#94a3b8",
    accent: "#f59e0b",
    blurb: "표준형 · 2연 레이저 기본 · 밸런스 주력",
    lore: "기본형. 표준 속도·내구. 기본 무기는 2줄 레이저(무제한).",
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
    color: "#38bdf8",
    accent: "#22d3ee",
    blurb: "살짝 느림 · 강력한 구름형 기본 미사일",
    lore: "속도는 조금 느리지만 기본 미사일이 강하고 넓게 퍼짐(무제한).",
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
    color: "#c084fc",
    accent: "#a78bfa",
    blurb: "빠름 · 약한 기본 미사일 · 기동 특화",
    lore: "최고 속도. 기본 공격은 약하지만 연사·기동으로 커버(무제한).",
  },
];

export function getVulture(id: VultureId): VultureDef {
  return VULTURES.find((v) => v.id === id) ?? VULTURES[0]!;
}
