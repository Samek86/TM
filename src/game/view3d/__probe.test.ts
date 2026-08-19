import { describe, it } from "vitest";
import { MAPS } from "@/data/maps";
import { buildSceneryGeometry } from "./terrainMesh";

describe("probe", () => {
  it("checks scenery ring integrity", () => {
    const map = MAPS[0]!;
    const g = buildSceneryGeometry(map);
    const pos = g.getAttribute("position");
    const idx = g.getIndex()!;
    let bad = 0;
    let nonFinite = 0;
    let downFacing = 0;
    let southBand = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (!Number.isFinite(pos.getX(i)) || !Number.isFinite(y)) nonFinite += 1;
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t);
      const b = idx.getX(t + 1);
      const c = idx.getX(t + 2);
      if (a >= pos.count || b >= pos.count || c >= pos.count) {
        bad += 1;
        continue;
      }
      const ax = pos.getX(a);
      const ay = pos.getY(a);
      const az = pos.getZ(a);
      const ux = pos.getX(b) - ax;
      const uy = pos.getY(b) - ay;
      const uz = pos.getZ(b) - az;
      const vx = pos.getX(c) - ax;
      const vy = pos.getY(c) - ay;
      const vz = pos.getZ(c) - az;
      const ny = uz * vx - ux * vz;
      if (ny < 0) downFacing += 1;
      const zAvg = (az + pos.getZ(b) + pos.getZ(c)) / 3;
      const xAvg = (ax + pos.getX(b) + pos.getX(c)) / 3;
      if (
        zAvg > map.height &&
        zAvg < map.height + 300 &&
        xAvg > 0 &&
        xAvg < map.width
      ) {
        southBand += 1;
      }
    }
    console.log(
      map.id,
      "verts",
      pos.count,
      "tris",
      idx.count / 3,
      "badIdx",
      bad,
      "nonFinite",
      nonFinite,
      "downFacing",
      downFacing,
      "southBandTris",
      southBand,
      "y",
      minY.toFixed(1),
      maxY.toFixed(1),
      "bsphere r",
      g.boundingSphere?.radius.toFixed(0),
    );
  });
});
