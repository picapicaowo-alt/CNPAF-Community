import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import {
  ACTIVITY_DEFINITIONS,
  CANONICAL_THEMES,
  DEFAULT_PROMPT_VERSION,
  LOOKUPS,
} from "@cnpaf/shared";
import { applyMigrations } from "./migrate";
import { getDb, readyDb } from "./index";
import {
  activityDefinitions,
  canonicalThemes,
  featureFlags,
  lookups,
  organizations,
  promptVersions,
  users,
} from "./schema";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs") as { hash: (s: string, n: number) => Promise<string> };

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/.env.local") });

await applyMigrations();
await readyDb();
const db = getDb();

async function upsertLookup() {
  const existing = await db.select().from(lookups);
  const seen = new Set(existing.map((e) => `${e.category}:${e.key}`));
  for (const row of LOOKUPS) {
    if (seen.has(`${row.category}:${row.key}`)) continue;
    await db.insert(lookups).values({
      category: row.category,
      key: row.key,
      nameZh: row.nameZh,
      nameEn: row.nameEn,
      sortOrder: row.sortOrder,
    });
  }
}

async function seed() {
  await upsertLookup();

  for (const def of ACTIVITY_DEFINITIONS) {
    const found = await db.select().from(activityDefinitions);
    if (found.some((f) => f.key === def.key && f.version === def.version)) continue;
    await db.insert(activityDefinitions).values({
      key: def.key,
      version: def.version,
      status: def.status,
      nameZh: def.nameZh,
      nameEn: def.nameEn,
      fields: def.fields,
    });
  }

  for (const theme of CANONICAL_THEMES) {
    const found = await db.select().from(canonicalThemes);
    if (found.some((f) => f.key === theme.key && f.version === theme.version)) continue;
    await db.insert(canonicalThemes).values(theme);
  }

  const prompts = await db.select().from(promptVersions);
  if (!prompts.some((p) => p.version === DEFAULT_PROMPT_VERSION.version)) {
    await db.insert(promptVersions).values(DEFAULT_PROMPT_VERSION);
  }

  const flags = [
    { key: "scheduled_visits", enabled: false, description: "ScheduledVisit attendance (v2)" },
    { key: "winston_export", enabled: false, description: "Winston Lab research export" },
    { key: "native_shell", enabled: false, description: "Capacitor/App Store wrapper" },
  ];
  const existingFlags = await db.select().from(featureFlags);
  for (const flag of flags) {
    if (existingFlags.some((f) => f.key === flag.key)) continue;
    await db.insert(featureFlags).values(flag);
  }

  const [org] =
    (await db.select().from(organizations).where(eq(organizations.name, "CNPAF"))) ?? [];
  const organization =
    org ??
    (
      await db
        .insert(organizations)
        .values({ name: "CNPAF", collectionPurpose: "operational" })
        .returning()
    )[0];

  const password = process.env.SEED_PASSWORD ?? "cnpaf-dev-change-me";
  const passwordHash = await bcrypt.hash(password, 10);
  const seedUsers = [
    { email: "admin@cnpaf.local", name: "Admin", role: "admin" },
    { email: "ops@cnpaf.local", name: "Coordinator", role: "coordinator" },
    { email: "volunteer@cnpaf.local", name: "Volunteer", role: "volunteer" },
  ];
  const existingUsers = await db.select().from(users);
  for (const u of seedUsers) {
    if (existingUsers.some((e) => e.email === u.email)) continue;
    await db.insert(users).values({
      ...u,
      passwordHash,
      organizationId: organization.id,
    });
  }

  console.log("Seed complete. Demo password:", password);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
