import { WEAPONS, type WeaponDef } from "@/data/weapons";

export function weaponById(id: number): WeaponDef {
  return WEAPONS.find((w) => w.id === id) ?? WEAPONS[0]!;
}
