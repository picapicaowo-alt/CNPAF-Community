import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  apiFetch,
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

test("route navigation provides loading and reduced-motion-safe handoffs", () => {
  const template = readFileSync(path.join(appRoot, "template.tsx"), "utf8");
  const loading = readFileSync(path.join(appRoot, "loading.tsx"), "utf8");
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  assert.match(template, /ViewTransition/);
  assert.match(template, /enter="route-enter"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(styles, /::view-transition-new\(\.route-enter\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
