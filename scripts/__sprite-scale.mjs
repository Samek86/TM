#!/usr/bin/env node
/** Temporary: render craft sprites at their true in-game pixel size. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";

// craftWorldRadius(radiusTiles) * 1.08, times device px per world unit.
// VIEW_WORLD_WIDTH 720 across the canvas; 2.67 px/unit at 1920 CSS, 4.0 at DPR 1.5.
const CRAFTS = [
  { id: "born_armor", world: 22.5 * 1.08 },
  { id: "killers_pot", world: 30 * 1.08 },
  { id: "sorcerer", world: 18 * 1.08 },
];
const PX_PER_UNIT = [2.67, 4.0];

const shots = CRAFTS.map((c) => ({
  id: c.id,
  sizes: PX_PER_UNIT.map((k) => Math.round(c.world * k)),
  data: `data:image/jpeg;base64,${readFileSync(
    `public/assets/crafts/${c.id}/yaw_00.jpg`,
  ).toString("base64")}`,
}));

mkdirSync("screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const dataUrl = await page.evaluate(async (list) => {
    const load = (src) =>
      new Promise((res) => {
        const im = new Image();
        im.onload = () => res(im);
        im.src = src;
      });
    const ZOOM = 4;
    const cell = 150;
    const cv = document.createElement("canvas");
    cv.width = cell * (list[0].sizes.length + 1) * ZOOM * 0.5;
    cv.height = cell * list.length * ZOOM * 0.5;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#101418";
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.font = "16px monospace";
    ctx.fillStyle = "#9fb3c8";
    for (let r = 0; r < list.length; r++) {
      const img = await load(list[r].data);
      const y = r * cell * ZOOM * 0.5 + 10;
      ctx.fillText(list[r].id, 10, y + 16);
      for (let c = 0; c < list[r].sizes.length; c++) {
        const s = list[r].sizes[c];
        // Downsample to true display size, then nearest-neighbour zoom to inspect.
        const tmp = document.createElement("canvas");
        tmp.width = s;
        tmp.height = s;
        const tctx = tmp.getContext("2d");
        tctx.imageSmoothingQuality = "high";
        tctx.drawImage(img, 0, 0, s, s);
        ctx.imageSmoothingEnabled = false;
        const x = 200 + c * cell * ZOOM * 0.5;
        ctx.drawImage(tmp, x, y, s * ZOOM * 0.5, s * ZOOM * 0.5);
        ctx.imageSmoothingEnabled = true;
        ctx.fillText(`${s}px`, x, y + s * ZOOM * 0.5 + 18);
      }
    }
    return cv.toDataURL("image/png");
  }, shots);
  writeFileSync(
    "screenshots/sprite-scale.png",
    Buffer.from(dataUrl.split(",")[1], "base64"),
  );
  console.log("wrote screenshots/sprite-scale.png");
} finally {
  await browser.close();
}
