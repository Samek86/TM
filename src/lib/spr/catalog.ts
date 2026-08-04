/** Client-extracted .SPR inventory for the in-browser decoder viewer. */

export type SprCategory = "vulture" | "select" | "weapon" | "shot" | "fx" | "item";

export interface SprCatalogEntry {
  id: string;
  file: string;
  label: string;
  category: SprCategory;
  note?: string;
}

const DATA = "/archive/client/extracted/data";

export const SPR_CATALOG: SprCatalogEntry[] = [
  // Vultures — 120 frames @ 3° yaw
  { id: "char1", file: "char1.spr", label: "Born Armor", category: "vulture", note: "120 dir frames" },
  { id: "char2", file: "char2.spr", label: "Killers Pot", category: "vulture", note: "120 dir frames" },
  { id: "char3", file: "char3.spr", label: "Sorcerer", category: "vulture", note: "120 dir frames" },
  // Select anims
  { id: "canit1", file: "canit1.spr", label: "Select · Born Armor", category: "select" },
  { id: "canit2", file: "canit2.spr", label: "Select · Killers Pot", category: "select" },
  { id: "canit3", file: "canit3.spr", label: "Select · Sorcerer", category: "select" },
  // FX / misc
  { id: "ef1", file: "ef1.spr", label: "Explosion / FX", category: "fx" },
  { id: "piece", file: "piece.spr", label: "Debris pieces", category: "fx" },
  { id: "cop", file: "cop.spr", label: "cop.spr", category: "fx" },
  { id: "cyr", file: "cyr.spr", label: "cyr.spr", category: "fx" },
  { id: "item", file: "item.spr", label: "Field items", category: "item", note: "22 frames" },
  // Weapon bodies
  { id: "wp1", file: "wp1.spr", label: "Vulcan Cannon", category: "weapon" },
  { id: "wp2", file: "wp2.spr", label: "ATi-Gun", category: "weapon" },
  { id: "wp3", file: "wp3.spr", label: "EM-Gun", category: "weapon" },
  { id: "wp4", file: "wp4.spr", label: "Plazma Shooter", category: "weapon" },
  { id: "wp5", file: "wp5.spr", label: "Gun Cannon", category: "weapon" },
  { id: "wp6", file: "wp6.spr", label: "Laser Cannon", category: "weapon" },
  { id: "wp7", file: "wp7.spr", label: "Spiner", category: "weapon" },
  { id: "wp8", file: "wp8.spr", label: "Slayer", category: "weapon" },
  { id: "wp9", file: "wp9.spr", label: "Paranoid Shooter", category: "weapon" },
  { id: "wp10", file: "wp10.spr", label: "S-mine", category: "weapon" },
  { id: "wp11", file: "wp11.spr", label: "Fire Bomb", category: "weapon" },
  { id: "wp12", file: "wp12.spr", label: "Stinger", category: "weapon" },
  { id: "wp13", file: "wp13.spr", label: "Multi Missiler", category: "weapon" },
  { id: "wp14", file: "wp14.spr", label: "Tow Missile", category: "weapon" },
  { id: "wp15", file: "wp15.spr", label: "Tomahawk", category: "weapon" },
  { id: "wp16", file: "WP16.SPR", label: "Burst Apocalypse", category: "weapon" },
  { id: "wp17", file: "wp17.spr", label: "Blazing Beam", category: "weapon" },
  { id: "wp21", file: "wp21.spr", label: "Lust Cannon", category: "weapon" },
  // Shot FX
  { id: "wp1sht", file: "WP1SHT.SPR", label: "Vulcan shot", category: "shot" },
  { id: "wp2sht", file: "WP2SHT.SPR", label: "ATi shot", category: "shot" },
  { id: "wp3sht", file: "WP3SHT.SPR", label: "EM shot", category: "shot" },
  { id: "wp4sht", file: "wp4sht.spr", label: "Plazma shot", category: "shot" },
  { id: "wp5sht", file: "wp5sht.spr", label: "Gun Cannon shot", category: "shot" },
  { id: "wp6sht", file: "WP6SHT.SPR", label: "Laser shot", category: "shot" },
  { id: "wp7sht", file: "WP7SHT.SPR", label: "Spiner shot", category: "shot" },
  { id: "wp8sht", file: "wp8sht.spr", label: "Slayer shot", category: "shot" },
  { id: "wp9sht", file: "WP9SHT.SPR", label: "Paranoid shot", category: "shot" },
  { id: "wp10sht", file: "WP10SHT.SPR", label: "S-mine shot", category: "shot" },
  { id: "wp11sht", file: "WP11SHT.SPR", label: "Fire Bomb shot", category: "shot" },
  { id: "wp12sht", file: "WP12SHT.SPR", label: "Stinger shot", category: "shot" },
  { id: "wp13sht", file: "WP13SHT.SPR", label: "Multi Missiler shot", category: "shot" },
  { id: "wp14sht", file: "WP14SHT.SPR", label: "Tow Missile shot", category: "shot" },
  { id: "wp15sht", file: "WP15SHT.SPR", label: "Tomahawk shot", category: "shot" },
  { id: "wp16sht", file: "WP16SHT.SPR", label: "Burst Apocalypse shot", category: "shot" },
  { id: "wp161sht", file: "WP161SHT.SPR", label: "Burst Apocalypse alt", category: "shot" },
  { id: "wp17sht", file: "WP17SHT.SPR", label: "Blazing Beam shot", category: "shot" },
  { id: "wp21sht", file: "wp21sht.spr", label: "Lust Cannon shot", category: "shot" },
  { id: "wp21_sht", file: "wp21_sht.spr", label: "Lust Cannon shot alt", category: "shot" },
];

export const SPR_CATEGORIES: { id: SprCategory | "all"; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "vulture", label: "기체" },
  { id: "select", label: "선택 연출" },
  { id: "weapon", label: "무기 바디" },
  { id: "shot", label: "탄환/샷" },
  { id: "fx", label: "이펙트" },
  { id: "item", label: "아이템" },
];

export function sprUrl(file: string): string {
  return `${DATA}/${file}`;
}

export const SPR_CATALOG_COUNT = SPR_CATALOG.length;
