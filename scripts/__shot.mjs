#!/usr/bin/env node
/** Temporary: boot the lobby, start a match, and capture the 3D view. */
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/";
const outPng = process.argv[3] || "screenshots/play.png";
const mapIndex = Number(process.argv[4] || 0);
mkdirSync(dirname(outPng), { recursive: true });

const consoleErrors = [];
const pageErrors = [];
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
    if (msg.type() === "warning" && /shader|gl|three/i.test(msg.text())) {
      consoleErrors.push(`warn: ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => pageErrors.push(String(err?.message || err)));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  if (mapIndex > 0) {
    await page.getByRole("button", { name: new RegExp(`^${mapIndex + 1}\\.`) }).click();
    await page.waitForTimeout(300);
  }
  // The lobby renders server-side; clicking before hydration does nothing.
  const start = page.getByRole("button", { name: /전체화면 전투 시작/ });
  for (let attempt = 0; attempt < 6; attempt++) {
    await start.click();
    const started = await page
      .getByText("ZONE LOADING")
      .waitFor({ state: "visible", timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (started) break;
    await page.waitForTimeout(2000);
  }
  await page
    .getByText("ZONE LOADING")
    .waitFor({ state: "hidden", timeout: 180000 })
    .catch(() => consoleErrors.push("loading overlay never cleared"));
  await page.waitForTimeout(3000);
  const place = process.argv[7] === "-" ? "" : process.argv[7];
  if (place) {
    const moved = await page.evaluate((where) => {
      const st = window.__tmState;
      if (!st) return "no state";
      const p = st.pilots.find((q) => q.isPlayer);
      if (!p) return "no player";
      const m = st.map;
      const spot = {
        w: [12, m.height / 2],
        e: [m.width - 12, m.height / 2],
        n: [m.width / 2, 12],
        s: [m.width / 2, m.height - 12],
        nw: [14, 14],
      }[where];
      if (!spot) return "no spot";
      p.x = spot[0];
      p.y = spot[1];
      p.vx = 0;
      p.vy = 0;
      return `${p.x},${p.y}`;
    }, place);
    console.log(`placed: ${moved}`);
    await page.waitForTimeout(1200);
  }
  const driveKey = process.argv[5] === "-" ? "" : process.argv[5];
  const driveMs = Number(process.argv[6] || 12000);
  if (driveKey) {
    await page.locator("canvas").first().click({ position: { x: 480, y: 270 } });
    await page.keyboard.down(driveKey);
    await page.waitForTimeout(driveMs);
    await page.keyboard.up(driveKey);
    await page.waitForTimeout(1500);
  }
  // Read the WebGL front buffer inside a frame callback; a page screenshot
  // needs a compositor frame, which software rendering is too slow to give.
  const dataUrl = await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const c = document.querySelector("canvas");
            resolve(c ? c.toDataURL("image/png") : "");
          });
        });
      }),
  );
  if (dataUrl) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(outPng, Buffer.from(dataUrl.split(",")[1], "base64"));
  } else {
    consoleErrors.push("no canvas pixels");
  }
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
  console.log(JSON.stringify({ outPng, bodyText, consoleErrors, pageErrors }, null, 2));
  process.exit(pageErrors.length ? 2 : 0);
} catch (err) {
  console.error(String(err?.message || err));
  process.exit(1);
} finally {
  await browser.close();
}
