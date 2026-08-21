import { describe, expect, it } from "vitest";
import { getWeaponById } from "@/data/weapons";
import { craftWorldRadius } from "./viewScale";
import { createGame, getPlayer, startMatch, update } from "./engine";

describe("Killers EM-Gun storm cloud", () => {
  it("leaves the craft already at 1.5× craft radius", () => {
    const state = createGame("jungle", "killers_pot");
    startMatch(state);
    const player = getPlayer(state)!;
    player.x = 400;
    player.y = 400;
    player.cooldown = 0;
    state.keys.Mouse0 = true;
    update(state, 1 / 30);

    const cloud = state.bullets.find((b) => b.alive && b.weaponId === 3);
    expect(cloud).toBeTruthy();
    const cap = player.radius * 1.5;
    expect(player.radius).toBe(craftWorldRadius(1));
    expect(cloud!.radius).toBeCloseTo(cap);
    expect(cloud!.baseRadius).toBeCloseTo(cap);
    expect(cloud!.growTo).toBeCloseTo(cap);
  });

  it("fires faster than the old 2.6/s storm cadence", () => {
    expect(getWeaponById(3).fireRate).toBeGreaterThanOrEqual(5);
    const state = createGame("jungle", "killers_pot");
    startMatch(state);
    const player = getPlayer(state)!;
    player.x = 400;
    player.y = 400;
    player.cooldown = 0;
    state.keys.Mouse0 = true;
    update(state, 1 / 30);
    expect(player.cooldown).toBeLessThanOrEqual(0.2);
  });
});
