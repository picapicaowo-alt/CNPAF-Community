import { readdir, readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";

/** Apply the exact forward-only migration set used by production, in filename order. */
export async function listSqlMigrations() {
  const sqlDirectory = new URL("../sql/", import.meta.url);
  const files = (await readdir(sqlDirectory))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/.test(file))
    .sort();

  if (files.length === 0) throw new Error("No SQL migrations were found");
  files.forEach((file, index) => {
    const expectedPrefix = String(index + 1).padStart(4, "0");
    if (!file.startsWith(`${expectedPrefix}_`)) {
      throw new Error(`Migration sequence gap: expected ${expectedPrefix}, found ${file}`);
    }
  });
  return files;
}

export async function applyAllSqlMigrations(database: PGlite) {
  const sqlDirectory = new URL("../sql/", import.meta.url);
  const files = await listSqlMigrations();
  for (const file of files) {
    await database.exec(await readFile(new URL(file, sqlDirectory), "utf8"));
  }
  return files;
}
