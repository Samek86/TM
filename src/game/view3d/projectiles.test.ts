import { describe, expect, it } from "vitest";
import { createProjectileLayer } from "./projectiles";

describe("projectiles", () => {
  it("builds a group of style layers", () => {
    const layer = createProjectileLayer(8);
    expect(layer.mesh.type).toBe("Group");
    expect(layer.mesh.children.length).toBe(5);
    layer.dispose();
  });
});
