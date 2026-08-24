import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const routeRoot = fileURLToPath(new URL("../src/app/api/v1", import.meta.url));
const contractPath = fileURLToPath(new URL("../../../docs/openapi.v1.yaml", import.meta.url));

async function routeFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(target) : entry.name === "route.ts" ? [target] : [];
  }))).flat();
}

function contractOperations(source: string) {
  const operations = new Set<string>();
  let currentPath: string | null = null;
  for (const line of source.split(/\r?\n/)) {
    const pathMatch = /^  (\/[^:]+):$/.exec(line);
    if (pathMatch) currentPath = pathMatch[1]!;
    const methodMatch = /^    (get|post|put|patch|delete):/.exec(line);
    if (currentPath && methodMatch) operations.add(`${methodMatch[1]!.toUpperCase()} ${currentPath}`);
  }
  return operations;
}

test("every API route and method is represented in OpenAPI", async () => {
  const actual = new Set<string>();
  for (const file of await routeFiles(routeRoot)) {
    const relativeDirectory = path.relative(routeRoot, path.dirname(file));
    const routePath = `/${relativeDirectory.split(path.sep).map((segment) =>
      segment.startsWith("[") && segment.endsWith("]") ? `{${segment.slice(1, -1)}}` : segment
    ).join("/")}`;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)) actual.add(`${match[1]} ${routePath}`);
    for (const match of source.matchAll(/export \{\s*([^}]+)\s*\} from/g)) {
      for (const method of match[1]!.split(",").map((value) => value.trim())) {
        if (["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) actual.add(`${method} ${routePath}`);
      }
    }
  }
  const contract = contractOperations(await readFile(contractPath, "utf8"));
  assert.deepEqual([...actual].filter((operation) => !contract.has(operation)).sort(), [], "route operations missing from OpenAPI");
  assert.deepEqual([...contract].filter((operation) => !actual.has(operation)).sort(), [], "stale OpenAPI operations without route handlers");
});
