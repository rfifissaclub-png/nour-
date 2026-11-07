import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("PWA manifest is installable and references existing icons", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8")) as {
    display: string;
    start_url: string;
    scope: string;
    icons: Array<{ src: string; sizes: string; purpose?: string }>;
  };
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512"));
  assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    await readFile(new URL(`../public${icon.src}`, import.meta.url));
  }
  await readFile(new URL("../public/icons/apple-touch-icon.png", import.meta.url));
});

test("service worker caches only the public offline shell and never private data", async () => {
  const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(serviceWorker, /cache\.addAll\(\["\/offline\.html", "\/offline\.js"\]\)/);
  assert.match(serviceWorker, /fetch\(event\.request\)\.catch/);
  assert.doesNotMatch(serviceWorker, /cache\.put/);
  assert.doesNotMatch(serviceWorker, /caches\.open\([^)]*(?:admin|api|student|teacher)/i);
});
