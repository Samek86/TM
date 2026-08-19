import { describe, expect, it } from "vitest";
import {
  createGame,
  getPlayer,
  setPointerWorld,
  startMatch,
  update,
} from "./engine";

describe("mouse aim while moving", () => {
  it("keeps heading when the craft strafes without a new pointer", () => {
    const state = createGame("jade_basin", "born_armor");
    startMatch(state);
    const player = getPlayer(state)!;
    player.x = 400;
    player.y = 400;
    player.vx = 0;
    player.vy = 0;
    // Aim due north (engine −Y). Leave the pointer there — no further mouse.
    setPointerWorld(state, player.x, player.y - 120, true);
    state.keys["KeyD"] = true;
    for (let i = 0; i < 30; i++) update(state, 1 / 30);
    expect(player.x).toBeGreaterThan(420);
    expect(player.angle).toBeCloseTo(-Math.PI / 2, 2);
  });

  it("still turns when the pointer itself moves", () => {
    const state = createGame("jade_basin", "born_armor");
    startMatch(state);
    const player = getPlayer(state)!;
    player.x = 400;
    player.y = 400;
    setPointerWorld(state, player.x, player.y - 80, true);
    update(state, 1 / 30);
    expect(player.angle).toBeCloseTo(-Math.PI / 2, 2);
    setPointerWorld(state, player.x + 80, player.y, true);
    update(state, 1 / 30);
    expect(player.angle).toBeCloseTo(0, 2);
  });
});
