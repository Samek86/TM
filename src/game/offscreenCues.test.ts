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
          x: 180,
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
          x: 1200,
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
});
