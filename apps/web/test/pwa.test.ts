import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const publicDirectory = path.resolve(process.cwd(), "public");

test("PWA manifest exposes installable standalone assets", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(publicDirectory, "manifest.webmanifest"), "utf8"),
  ) as {
    id: string;
    display: string;
    orientation: string;
    start_url: string;
    scope: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string; purpose: string }>;
  };

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.start_url, "/dashboard");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.theme_color, "#036EB7");
  assert.ok(
    manifest.icons.some(
      (icon) => icon.sizes === "192x192" && icon.purpose === "any",
    ),
  );
  assert.ok(
    manifest.icons.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "any",
    ),
  );
  assert.ok(
    manifest.icons.some(
      (icon) => icon.sizes === "512x512" && icon.purpose === "maskable",
    ),
  );
  for (const icon of manifest.icons) {
    assert.ok(
      existsSync(path.join(publicDirectory, icon.src.replace(/^\//, ""))),
      `Missing PWA icon ${icon.src}`,
    );
  }
});

test("service worker precaches only public shell routes", () => {
  const worker = readFileSync(path.join(publicDirectory, "sw.js"), "utf8");
  assert.match(worker, /"\/login"/);
  assert.match(worker, /"\/offline"/);
  assert.doesNotMatch(worker, /"\/dashboard"/);
  assert.doesNotMatch(worker, /"\/capture"/);
  assert.match(worker, /cnpaf-shell-v4/);
});

test("mobile install UI handles native and manual install paths", () => {
  const component = readFileSync(
    path.resolve(process.cwd(), "src/components/PwaBits.tsx"),
    "utf8",
  );
  assert.match(component, /beforeinstallprompt/);
  assert.match(component, /appinstalled/);
  assert.match(component, /Install on this device/);
  assert.match(component, /display-mode: standalone/);
  assert.match(component, /Add to Home Screen/);
  assert.match(component, /Add to Dock/);
  assert.match(component, /SamsungBrowser/);
  assert.match(component, /Firefox desktop does not currently provide native PWA installation/);
  assert.match(component, /OPEN_INSTALL_EVENT/);
});
