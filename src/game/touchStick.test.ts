import { describe, expect, it } from "vitest";
import {
  createGame,
  getPlayer,
  setAimStick,
  setMoveStick,
  startMatch,
  update,
} from "./engine";
import {
  AIM_LEAD,
  STICK_DEADZONE,
  aimPointFromStick,
  stickFromPointer,
} from "./touchStick";

describe("stickFromPointer", () => {
  it("returns zero inside the deadzone", () => {
    const r = 50;
    const v = stickFromPointer(
      100,
      100,
      100 + r * STICK_DEADZONE * 0.4,
      100,
      r,
    );
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it("points east and clamps past the rim", () => {
    const v = stickFromPointer(0, 0, 400, 0, 50);
    expect(v.x).toBeCloseTo(1);
    expect(v.y).toBeCloseTo(0);
  });

  it("uses screen Y-down so a drag south is +Y", () => {
    const v = stickFromPointer(0, 0, 0, 40, 50);
    expect(v.x).toBeCloseTo(0);
    expect(v.y).toBeCloseTo(40 / 50);
  });
});

describe("aimPointFromStick", () => {
  it("places the aim point ahead of the craft along the stick", () => {
    const p = aimPointFromStick(10, 20, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10 + AIM_LEAD);
    expect(p.y).toBeCloseTo(20);
  });

  it("falls back to +X when the stick is in the deadzone", () => {
    const p = aimPointFromStick(0, 0, { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(AIM_LEAD);
    expect(p.y).toBeCloseTo(0);
  });
});

describe("twin-stick engine input", () => {
  it("flies along the left stick and faces the right stick", () => {
    const state = createGame("jungle", "born_armor");
    startMatch(state);
    const player = getPlayer(state)!;
    const x0 = player.x;
    setMoveStick(state, { x: 1, y: 0 });
    setAimStick(state, { x: 0, y: 1 });
    for (let i = 0; i < 8; i++) update(state, 1 / 30);
    expect(player.x).toBeGreaterThan(x0);
    expect(player.angle).toBeCloseTo(Math.PI / 2, 2);
  });
});
