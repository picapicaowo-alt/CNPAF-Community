import { config } from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/.env.local") });

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = resolve(here, "../sql");
const files = readdirSync(sqlDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

export async function applyMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url?.startsWith("postgres")) {
    throw new Error("DATABASE_URL must be a postgres:// connection string");
  }
  const client = postgres(url, { max: 1 });
  await client`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  const applied = await client<{ id: string }[]>`SELECT id FROM schema_migrations`;
  const done = new Set(applied.map((r) => r.id));
  for (const file of files) {
    if (done.has(file)) continue;
    const body = readFileSync(resolve(sqlDir, file), "utf8");
    await client.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
    });
    console.log("applied", file);
  }
  await client.end();
}

const isMain = process.argv[1]?.includes("migrate");
if (isMain) {
  applyMigrations()
    .then(() => {
      console.log("Migrations complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
