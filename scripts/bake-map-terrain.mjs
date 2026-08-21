/**
 * Bake play-map JPEGs (lobby isometric + combat top-down).
 * Usage: npm run bake:maps
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "assets", "maps");
const PORT = 18789;

const server = await createServer({
  configFile: false,
  root,
  appType: "mpa",
  server: { host: "127.0.0.1", port: PORT, strictPort: true },
  resolve: { alias: { "@": path.join(root, "src") } },
});

await server.listen();
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  page.on("pageerror", (err) => {
    console.error("[bake pageerror]", err);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[bake console]", msg.text());
  });
  await page.goto(`http://127.0.0.1:${PORT}/scripts/bake-map-page.html`, {
    waitUntil: "networkidle",
    timeout: 120000,
  });
  await page.waitForFunction(() => typeof window.__bakeMaps === "function", null, {
    timeout: 30000,
  });
  const results = await page.evaluate(() => window.__bakeMaps());
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("bake produced no maps");
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const row of results) {
    if (!row?.id || !row.iso || !row.top) {
      throw new Error(`incomplete bake row: ${JSON.stringify(row?.id)}`);
    }
    if (!row.isoW || !row.isoH || !row.topW || !row.topH) {
      throw new Error(`empty canvas for ${row.id}`);
    }
    const isoPath = path.join(outDir, `${row.id}.jpg`);
    const topPath = path.join(outDir, `${row.id}.top.jpg`);
    fs.writeFileSync(isoPath, Buffer.from(row.iso, "base64"));
    fs.writeFileSync(topPath, Buffer.from(row.top, "base64"));
    console.log(
      `${row.id}: iso ${row.isoW}x${row.isoH} (${fs.statSync(isoPath).size} bytes)  top ${row.topW}x${row.topH} (${fs.statSync(topPath).size} bytes)`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
