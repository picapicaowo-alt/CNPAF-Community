import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle>;

const globalForDb = globalThis as unknown as { cnpafSql?: ReturnType<typeof postgres>; cnpafDb?: Database };

export function createDb(url = process.env.DATABASE_URL): Database {
  if (!url || !url.startsWith("postgres")) {
    throw new Error("DATABASE_URL must be a postgres:// connection string");
  }
  if (!globalForDb.cnpafSql) {
    globalForDb.cnpafSql = postgres(url, { max: 10 });
    globalForDb.cnpafDb = drizzle(globalForDb.cnpafSql, { schema });
  }
  return globalForDb.cnpafDb!;
}

export function getDb(): Database {
  return createDb();
}

export async function readyDb(): Promise<Database> {
  return getDb();
}

export * from "./schema";
