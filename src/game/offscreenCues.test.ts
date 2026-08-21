import { describe, expect, it } from "vitest";
import { offscreenCues } from "./offscreenCues";

const player = {
  id: "you",
  name: "YOU",
  x: 0,
  y: 0,
  hp: 100,
  respawn: 0,
  isPlayer: true,
  accent: "#fff",
};

describe("offscreenCues", () => {
  it("shows a close offscreen enemy on the matching viewport edge", () => {
    const [cue] = offscreenCues(
      [
        player,
        {
          id: "bot",
          name: "BOT-1",
          x: 450,
          y: 0,
          hp: 100,
          respawn: 0,
          isPlayer: false,
          accent: "#f0f",
        },
      ],
      390,
      844,
      true,
    );
    expect(cue?.name).toBe("BOT-1");
    expect(cue?.left).toBeGreaterThan(370);
    expect(cue?.angle).toBeCloseTo(0);
    expect(cue?.edge).toBe(true);
  });

  it("shows a name above an onscreen enemy but filters distant and dead enemies", () => {
    const cues = offscreenCues(
      [
        player,
        {
          id: "near",
          name: "NEAR",
          x: 20,
          y: 0,
          hp: 100,
          respawn: 0,
          isPlayer: false,
          accent: "#fff",
        },
        {
          id: "far",
          name: "FAR",
          x: 4000,
          y: 0,
          hp: 100,
          respawn: 0,
          isPlayer: false,
          accent: "#fff",
        },
        {
          id: "dead",
          name: "DEAD",
          x: 180,
          y: 0,
          hp: 0,
          respawn: 0,
          isPlayer: false,
          accent: "#fff",
        },
      ],
      390,
      844,
      true,
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ id: "near", edge: false });
    expect(cues[0]!.top).toBeLessThan(422);
  });

  it("uses live projected coordinates for onscreen labels", () => {
    const [cue] = offscreenCues(
      [
        player,
        {
          id: "projected",
          name: "BOT-2",
          x: 25,
          y: 10,
          hp: 100,
          respawn: 0,
          isPlayer: false,
          accent: "#0ff",
        },
      ],
      390,
      844,
      true,
      (x) => (x === 0 ? { x: 195, y: 422 } : { x: 120, y: 240 }),
    );
    expect(cue).toMatchObject({ id: "projected", edge: false, left: 120 });
    expect(cue?.top).toBe(222);
  });
});
