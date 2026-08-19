#!/usr/bin/env node
/** Temporary: report pixel colors at given points of a PNG. */
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const file = process.argv[2];
const points = JSON.parse(process.argv[3] || "[]");
const b64 = readFileSync(file).toString("base64");
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
const out = await page.evaluate(
  async ([data, pts]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return pts.map(([x, y]) => {
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { x, y, rgb: [d[0], d[1], d[2]] };
    });
  },
  [b64, points],
);
console.log(JSON.stringify(out));
await browser.close();
