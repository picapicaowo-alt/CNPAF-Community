import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../src/schema";
import { applyAllSqlMigrations } from "./migration-test-utils";

type DrizzleTableContract = {
  name: string;
  columns: string[];
};

function drizzleTableContracts() {
  return Object.values(schema).flatMap<DrizzleTableContract>((candidate) => {
    try {
      const config = getTableConfig(candidate as never);
      return [{
        name: config.name,
        columns: config.columns.map((column) => column.name).sort(),
      }];
    } catch {
      return [];
    }
  }).sort((left, right) => left.name.localeCompare(right.name));
}

test("Drizzle schema and the complete SQL migration set stay synchronized", async () => {
  const database = new PGlite();
  try {
    await applyAllSqlMigrations(database);

    const migratedTables = await database.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const actualTableNames = migratedTables.rows
      .map((row) => row.table_name)
      .filter((name) => name !== "schema_migrations");
    const contracts = drizzleTableContracts();
    assert.deepEqual(actualTableNames, contracts.map((table) => table.name));

    const migratedColumns = await database.query<{
      table_name: string;
      column_name: string;
    }>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `);
    const columnsByTable = new Map<string, string[]>();
    for (const column of migratedColumns.rows) {
      const names = columnsByTable.get(column.table_name) ?? [];
      names.push(column.column_name);
      columnsByTable.set(column.table_name, names);
    }

    for (const contract of contracts) {
      const actualColumns = (columnsByTable.get(contract.name) ?? []).sort();
      assert.deepEqual(
        actualColumns,
        contract.columns,
        `Column drift detected for ${contract.name}`,
      );
    }
  } finally {
    await database.close();
  }
});
