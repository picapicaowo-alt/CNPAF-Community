import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  apiFetch,
  invalidateApiReadCache,
  invalidateAuthSessionCache,
} from "../src/lib/api-client";

const appRoot = path.resolve(process.cwd(), "src/app");

test("protected route changes keep the authenticated shell warm", () => {
  const chrome = readFileSync(
    path.resolve(process.cwd(), "src/components/AppChrome.tsx"),
    "utf8",
  );

  assert.match(chrome, /\[publicPage\]/);
  assert.doesNotMatch(chrome, /\[pathname, publicPage\]/);
});

test("authentication reads are coalesced and briefly reused", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ permissions: ["tasks.view"] }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;
  invalidateAuthSessionCache();

  try {
    await Promise.all([
      apiFetch("/api/v1/auth/me"),
      apiFetch("/api/v1/auth/me"),
    ]);
    await apiFetch("/api/v1/auth/me");
    assert.equal(calls, 1);

    invalidateAuthSessionCache();
    await apiFetch("/api/v1/auth/me");
    assert.equal(calls, 2);
  } finally {
    invalidateAuthSessionCache();
    globalThis.fetch = originalFetch;
  }
});

test("API reads are coalesced and mutations invalidate their short cache", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ call: calls }), {
      headers: { "content-type": "application/json" },
      status: 200,
    });
  }) as typeof fetch;
  invalidateApiReadCache();

  try {
    await Promise.all([
      apiFetch("/api/v1/templates?view=cards"),
      apiFetch("/api/v1/templates?view=cards"),
    ]);
    await apiFetch("/api/v1/templates?view=cards");
    assert.equal(calls, 1);

    await apiFetch("/api/v1/templates/example", { method: "DELETE" });
    await apiFetch("/api/v1/templates?view=cards");
    assert.equal(calls, 3);
  } finally {
    invalidateApiReadCache();
    globalThis.fetch = originalFetch;
  }
});

test("route navigation avoids overlapping page snapshots", () => {
  const loading = readFileSync(path.join(appRoot, "loading.tsx"), "utf8");
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  assert.equal(existsSync(path.join(appRoot, "template.tsx")), false);
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(styles, /::view-transition-(?:old|new)\(\.route-/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("the four insight cards share one equal two-column grid", () => {
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");
  const insightStyles = styles.slice(styles.indexOf(".insight-register {"));

  assert.match(insightStyles, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(insightStyles, /grid-auto-rows: 1fr/);
  assert.doesNotMatch(insightStyles, /grid-column: span [23456]/);
});

test("the More directory keeps equal scrollable cards in independent columns", () => {
  const page = readFileSync(path.join(appRoot, "more/page.tsx"), "utf8");
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  assert.match(page, /className="more-column"/);
  assert.match(page, /aria-labelledby=\{headingId\}/);
  assert.match(page, /role="region"/);
  assert.match(page, /tabIndex=\{0\}/);
  assert.match(styles, /\.more-directory\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.more-column\s*\{[\s\S]*?align-content: start/);
  assert.match(styles, /\.more-group\s*\{[\s\S]*?grid-template-rows: 68px minmax\(0, 1fr\)/);
  assert.match(styles, /\.more-link-list\s*\{[\s\S]*?height: clamp\(252px, 27vh, 300px\);[\s\S]*?overflow-y: auto/);
});

test("standalone mobile workspaces keep navigation and forms inside the viewport", () => {
  const chrome = readFileSync(path.join(appRoot, "../components/AppChrome.tsx"), "utf8");
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  assert.match(chrome, /className="mobile-header-back"/);
  assert.match(chrome, /router\.back\(\)/);
  assert.match(styles, /\.mobile-header-back\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
  assert.match(styles, /\.forms-manage-page\s*\{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: clip/);
});
