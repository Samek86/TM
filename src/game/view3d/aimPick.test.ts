import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { MapDef } from "@/data/maps";
import { CAMERA_PITCH_RAD } from "./cameraRig";
import { orthoAimRay, pickAimOnHeightfield } from "./aimPick";

function miniMap(elev: number[], ramps: boolean[]): MapDef {
  return {
    id: "t",
    name: "t",
    theme: "",
    description: "",
    originalFiles: [],
    width: 90,
    height: 90,
    cols: 3,
    rows: 3,
    elevation: elev,
    ramps,
    ground: "#0",
    high: "#0",
    cliff: "#0",
    ramp: "#0",
    accent: "#0",
    cellSize: 30,
    features: [],
  };
}

describe("pickAimOnHeightfield", () => {
  it("hits the high plane when the ray aims at a high cell", () => {
    const map = miniMap(
      [0, 0, 1, 0, 0, 1, 0, 0, 1],
      [false, false, false, false, false, false, false, false, false],
    );
    // Ray from above the high cell, straight down
    const hit = pickAimOnHeightfield(
      map,
      { x: 75, y: 80, z: 45 },
      { x: 0, y: -1, z: 0 },
    );
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(75, 0);
    expect(hit!.y).toBeCloseTo(45, 0);
  });

  it("returns null when the ray misses the map", () => {
    const map = miniMap(new Array(9).fill(0), new Array(9).fill(false));
    const hit = pickAimOnHeightfield(
      map,
      { x: -100, y: 80, z: -100 },
      { x: 0, y: -1, z: 0 },
    );
    expect(hit).toBeNull();
  });

  it("ortho ray offset in X hits engine-X offset, not look-at", () => {
    const halfW = 360;
    const halfH = 202.5;
    const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 4000);
    const target = { x: 400, y: 0, z: 400 };
    const dist = 420;
    camera.position.set(
      target.x,
      target.y + dist * Math.sin(CAMERA_PITCH_RAD),
      target.z + dist * Math.cos(CAMERA_PITCH_RAD),
    );
    camera.lookAt(target.x, target.y, target.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const ndcX = 0.5;
    const { origin, dir } = orthoAimRay(camera, ndcX, 0);
    const expectedX = target.x + ndcX * halfW;

    expect(origin.x).toBeCloseTo(expectedX, 5);
    expect(Math.abs(dir.x)).toBeLessThan(1e-6);

    const cols = 28;
    const rows = 28;
    const map = miniMap(
      new Array(cols * rows).fill(0),
      new Array(cols * rows).fill(false),
    );
    map.width = cols * 30;
    map.height = rows * 30;
    map.cols = cols;
    map.rows = rows;

    const hit = pickAimOnHeightfield(map, origin, dir);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.x - expectedX)).toBeLessThan(30);
    expect(Math.abs(hit!.x - target.x)).toBeGreaterThan(120);
  });

  it("still reaches ground that sits behind a negative near plane", () => {
    const halfW = 360;
    const halfH = 202.5;
    const camera = new THREE.OrthographicCamera(
      -halfW,
      halfW,
      halfH,
      -halfH,
      -2500,
      4000,
    );
    const target = { x: 400, y: 0, z: 400 };
    const dist = 420;
    camera.position.set(
      target.x,
      target.y + dist * Math.sin(CAMERA_PITCH_RAD),
      target.z + dist * Math.cos(CAMERA_PITCH_RAD),
    );
    camera.lookAt(target.x, target.y, target.z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    const cols = 28;
    const rows = 28;
    const map = miniMap(
      new Array(cols * rows).fill(0),
      new Array(cols * rows).fill(false),
    );
    map.width = cols * 30;
    map.height = rows * 30;
    map.cols = cols;
    map.rows = rows;

    // Bottom of the screen: ground there is nearer than the camera plane.
    const { origin, dir } = orthoAimRay(camera, 0, -1);
    const hit = pickAimOnHeightfield(map, origin, dir);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBeGreaterThan(target.z);
  });
});
