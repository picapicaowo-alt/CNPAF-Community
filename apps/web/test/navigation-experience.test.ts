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

test("public and configurable surfaces keep each interface language pure", () => {
  const login = readFileSync(path.join(appRoot, "login/page.tsx"), "utf8");
  const loading = readFileSync(path.join(appRoot, "loading.tsx"), "utf8");
  const privacy = readFileSync(path.join(appRoot, "privacy/page.tsx"), "utf8");
  const locationForm = readFileSync(
    path.resolve(process.cwd(), "src/features/locations/components/LocationForm.tsx"),
    "utf8",
  );
  const safetyControl = readFileSync(
    path.resolve(process.cwd(), "src/features/forms/runtime/DynamicFieldControl.tsx"),
    "utf8",
  );

  assert.doesNotMatch(login, /<p>A future shaped by every community\.<\/p>/);
  assert.doesNotMatch(loading, /正在打开页面 \/ Opening page/);
  assert.doesNotMatch(privacy, /Privacy Policy 隐私政策/);
  assert.match(locationForm, /draft\.nameZh/);
  assert.match(locationForm, /draft\.nameEn/);
  assert.match(safetyControl, /role="alertdialog"/);
  assert.match(safetyControl, /我知道了/);
  assert.match(safetyControl, /I Understand/);
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

test("built-in form presets expose persistent edit and delete actions", () => {
  const page = readFileSync(path.join(appRoot, "forms/page.tsx"), "utf8");
  const launcher = readFileSync(
    path.resolve(
      process.cwd(),
      "src/features/forms/components/TemplateLaunchModal.tsx",
    ),
    "utf8",
  );

  assert.match(page, /hiddenPresetKeys/);
  assert.match(page, /\/api\/v1\/form-presets\/\$\{encodeURIComponent/);
  assert.match(page, /method: "POST"/);
  assert.match(page, /method: "DELETE"/);
  assert.doesNotMatch(
    launcher,
    /choice\.kind === "library" && \(canEdit \|\| canDelete\)/,
  );
  assert.match(launcher, /onEdit\(choice\)/);
  assert.match(launcher, /onDelete\(choice\)/);
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

test("insight AI follows the live authorized record set", () => {
  const page = readFileSync(path.join(appRoot, "insights/[category]/page.tsx"), "utf8");
  const layout = readFileSync(path.join(appRoot, "layout.tsx"), "utf8");

  assert.match(page, /dataset\.insightRefreshMs/);
  assert.match(layout, /data-insight-refresh-ms=\{liveRefreshMs\}/);
  assert.match(page, /recordIds: filteredRecords\.map/);
  assert.match(page, /dataRevision: aiDataRevision/);
  assert.match(page, /visibilitychange/);
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
  const dashboard = readFileSync(path.join(appRoot, "dashboard/page.tsx"), "utf8");
  const insights = readFileSync(path.join(appRoot, "insights/page.tsx"), "utf8");
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  assert.match(chrome, /className="mobile-header-back"/);
  assert.match(chrome, /router\.back\(\)/);
  assert.match(chrome, /workSurface === "field"[\s\S]*?"\/insights"/);
  assert.match(chrome, /--mobile-nav-count/);
  assert.match(dashboard, /className="admin-insight-entry"/);
  assert.match(styles, /\.mobile-header-back\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px/);
  assert.match(styles, /\.forms-manage-page\s*\{[\s\S]*?max-width: 100%;[\s\S]*?overflow-x: clip/);
  assert.match(styles, /grid-template-columns: repeat\(var\(--mobile-nav-count, 4\), minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.app-main input:is\([\s\S]*?\[type="date"\][\s\S]*?\[type="datetime-local"\][\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(styles, /\.mobile-stack > \*[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%/);
  assert.match(styles, /\.insight-conversation-field\s*\{[\s\S]*?width: 100%;[\s\S]*?min-width: 0/);
  assert.match(styles, /\.insight-conversation-field input::placeholder\s*\{[\s\S]*?font-size: var\(--type-ui\)/);
  assert.match(insights, /className="insight-conversation-field"/);
  assert.match(insights, /问问一线记录告诉我们什么/);
});

test("task priority uses optional configured choices instead of a numeric stepper", () => {
  const createTask = readFileSync(path.join(appRoot, "tasks/new/page.tsx"), "utf8");
  const taskManager = readFileSync(
    path.resolve(
      process.cwd(),
      "src/features/tasks/components/TaskManagementPanel.tsx",
    ),
    "utf8",
  );
  const configuration = readFileSync(
    path.resolve(process.cwd(), "src/features/configuration/types.ts"),
    "utf8",
  );
  const configurationScreen = readFileSync(
    path.resolve(
      process.cwd(),
      "src/features/configuration/components/ConfigurationScreen.tsx",
    ),
    "utf8",
  );
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  for (const source of [createTask, taskManager]) {
    assert.match(source, /config\/registries\/priority_level\?status=active/);
    assert.match(source, /Priority \(optional\)/);
    assert.match(source, /registry=priority_level/);
    assert.doesNotMatch(source, /setPriority\(Number\(/);
  }
  assert.match(configuration, /key: "priority_level"/);
  assert.match(configurationScreen, /configuration-data-table/);
  assert.match(configurationScreen, /data-label=/);
  assert.match(
    styles,
    /\.configuration-data-table td\s*\{[\s\S]*?grid-template-columns:[\s\S]*?minmax\(0, 1fr\)/,
  );
});

test("administrators can assign any role and scope from person management", () => {
  const people = readFileSync(path.join(appRoot, "people/page.tsx"), "utf8");
  const person = readFileSync(
    path.join(appRoot, "people/[id]/page.tsx"),
    "utf8",
  );
  const accessRoute = readFileSync(
    path.join(appRoot, "api/v1/admin/users/[userId]/access/route.ts"),
    "utf8",
  );

  assert.match(people, /href={`\/people\/\${user\.id}`}/);
  assert.match(person, /selectedRoleIds\.map/);
  assert.match(person, /scopeAssignments: scopeRows/);
  assert.match(person, /\/access`/);
  assert.match(accessRoute, /requirePermission\("permissions\.assign"\)/);
});

test("review field-selection guidance stays compact and left aligned", () => {
  const styles = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");

  assert.match(styles, /\.field-selection-help\s*\{[\s\S]*?justify-content: flex-start;[\s\S]*?gap: 8px;[\s\S]*?font-size: var\(--type-caption\);/);
  assert.match(styles, /\.field-selection-help > svg\s*\{[\s\S]*?flex: 0 0 16px;/);
});

test("site typography uses one readable semantic scale", () => {
  const globals = readFileSync(path.join(appRoot, "globals.css"), "utf8");
  const adaptive = readFileSync(path.join(appRoot, "adaptive-design.css"), "utf8");
  const styles = `${globals}\n${adaptive}`;
  const subTwelvePixelText = [...styles.matchAll(/font-size:\s*([0-9]+(?:\.[0-9]+)?)px/g)]
    .map((match) => Number(match[1]))
    .filter((size) => size > 0 && size < 12);

  assert.deepEqual(subTwelvePixelText, []);
  assert.match(adaptive, /--type-heading: 20px;/);
  assert.match(adaptive, /--type-body: 16px;/);
  assert.match(adaptive, /--type-ui: 14px;/);
  assert.match(adaptive, /--type-caption: 13px;/);
  assert.match(adaptive, /--type-meta: 12px;/);
  assert.match(globals, /\.task-form-link-selection span\s*\{[\s\S]*?font-size: var\(--type-meta/);
  assert.match(globals, /\.task-form-link-selection strong\s*\{[\s\S]*?font-size: var\(--type-ui/);
  assert.match(globals, /\.task-form-link-flow\s*\{[\s\S]*?font-size: var\(--type-caption/);
});
