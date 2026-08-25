import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config as loadEnvironment } from "dotenv";
import postgres from "postgres";

type Reference = { table: string; id: string; field: string };
type ManifestObject = {
  storageKey: string;
  relativePath: string;
  byteSize: number | null;
  sha256: string | null;
  references: Reference[];
  state: "ready" | "missing_local";
};
type Manifest = {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  sourceBackend: "local";
  targetBackend: "s3";
  sourceRoot: string;
  manifestHash: string;
  objects: ManifestObject[];
};

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvironment({ path: path.join(workspace, ".env") });
loadEnvironment({ path: path.join(workspace, "apps/web/.env.local") });

function optional(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function required(name: string) {
  const value = optional(name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function bool(name: string, fallback: boolean) {
  const value = optional(name)?.toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function safeKey(key: string) {
  const normalized = key.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return normalized;
}

function sourceRoot() {
  const configured = optional("UPLOAD_DIR") ?? "./uploads";
  return path.isAbsolute(configured) ? configured : path.resolve(workspace, "apps/web", configured);
}

function manifestPath() {
  const index = process.argv.indexOf("--manifest");
  const configured = index >= 0 ? process.argv[index + 1] : optional("STORAGE_MIGRATION_MANIFEST");
  return path.resolve(workspace, configured || ".storage-migration/manifest.json");
}

function database() {
  return postgres(required("DATABASE_URL"), { max: 4 });
}

function s3Target() {
  const endpoint = optional("S3_MIGRATION_ENDPOINT") ?? optional("S3_ENDPOINT");
  const prefix = (optional("S3_MIGRATION_PREFIX") ?? optional("S3_PREFIX") ?? "").replace(/^\/+|\/+$/g, "");
  const config = {
    bucket: optional("S3_MIGRATION_BUCKET") ?? required("S3_BUCKET"),
    region: optional("S3_MIGRATION_REGION") ?? optional("S3_REGION") ?? optional("AWS_REGION") ?? "us-west-2",
    endpoint,
    forcePathStyle: endpoint ? bool("S3_FORCE_PATH_STYLE", true) : false,
    prefix,
    serverSideEncryption: endpoint ? undefined : "AES256" as const,
  };
  return {
    config,
    client: new S3Client({
      region: config.region,
      ...(endpoint ? { endpoint, forcePathStyle: config.forcePathStyle } : {}),
    }),
  };
}

function targetKey(prefix: string, storageKey: string) {
  const key = safeKey(storageKey);
  return prefix ? `${prefix}/${key}` : key;
}

async function sha256File(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function listLocalFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the storage root: ${fullPath}`);
    if (entry.isDirectory()) files.push(...await listLocalFiles(root, fullPath));
    else if (entry.isFile()) files.push(safeKey(path.relative(root, fullPath)));
  }
  return files;
}

async function databaseReferences(sql: ReturnType<typeof postgres>) {
  const rows = await sql<{ table_name: string; row_id: string; field_name: string; storage_key: string }[]>`
    SELECT 'attachments' AS table_name, id::text AS row_id, 'storage_key' AS field_name, storage_key
      FROM attachments
    UNION ALL
    SELECT 'export_jobs', id::text, 'storage_key', storage_key
      FROM export_jobs WHERE storage_key IS NOT NULL
    UNION ALL
    SELECT 'users', id::text, 'avatar_storage_key', avatar_storage_key
      FROM users WHERE avatar_storage_key IS NOT NULL
    ORDER BY storage_key, table_name, row_id
  `;
  const byKey = new Map<string, Reference[]>();
  for (const row of rows) {
    const key = safeKey(row.storage_key);
    byKey.set(key, [...(byKey.get(key) ?? []), { table: row.table_name, id: row.row_id, field: row.field_name }]);
  }
  return byKey;
}

function canonicalManifest(objects: ManifestObject[]) {
  return JSON.stringify(objects.map((object) => ({
    storageKey: object.storageKey,
    byteSize: object.byteSize,
    sha256: object.sha256,
    references: object.references,
    state: object.state,
  })));
}

async function createManifest() {
  const root = sourceRoot();
  const sql = database();
  try {
    const [files, references] = await Promise.all([listLocalFiles(root), databaseReferences(sql)]);
    const keys = [...new Set([...files, ...references.keys()])].sort();
    const fileSet = new Set(files);
    const objects: ManifestObject[] = [];
    for (const storageKey of keys) {
      const fullPath = path.join(root, storageKey);
      if (!fileSet.has(storageKey)) {
        objects.push({ storageKey, relativePath: storageKey, byteSize: null, sha256: null, references: references.get(storageKey) ?? [], state: "missing_local" });
        continue;
      }
      const fileStat = await lstat(fullPath);
      const digest = await sha256File(fullPath);
      objects.push({ storageKey, relativePath: storageKey, byteSize: fileStat.size, sha256: digest, references: references.get(storageKey) ?? [], state: "ready" });
    }
    const manifestHash = createHash("sha256").update(canonicalManifest(objects)).digest("hex");
    const totalBytes = objects.reduce((total, object) => total + (object.byteSize ?? 0), 0);
    const [run] = await sql<{ id: string }[]>`
      INSERT INTO storage_migration_runs (
        source_backend, target_backend, status, manifest_hash,
        total_objects, total_bytes, metadata
      ) VALUES (
        'local', 's3', 'manifested', ${manifestHash},
        ${objects.length}, ${totalBytes},
        ${sql.json({ sourceRoot: root, missingLocal: objects.filter((object) => object.state === "missing_local").length })}
      ) RETURNING id
    `;
    const available = objects.filter((object): object is ManifestObject & { byteSize: number; sha256: string } => object.byteSize !== null && object.sha256 !== null);
    for (const object of available) {
      await sql`
        INSERT INTO storage_migration_objects (
          migration_run_id, storage_key, byte_size, sha256, status
        ) VALUES (${run.id}, ${object.storageKey}, ${object.byteSize}, ${object.sha256}, 'pending')
      `;
    }
    const manifest: Manifest = {
      schemaVersion: 1,
      runId: run.id,
      generatedAt: new Date().toISOString(),
      sourceBackend: "local",
      targetBackend: "s3",
      sourceRoot: root,
      manifestHash,
      objects,
    };
    const output = manifestPath();
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ command: "manifest", runId: run.id, manifest: output, objects: objects.length, totalBytes, missingLocal: objects.filter((object) => object.state === "missing_local").length, unreferenced: objects.filter((object) => object.references.length === 0).length }, null, 2));
  } finally {
    await sql.end();
  }
}

async function readManifest() {
  const manifest = JSON.parse(await readFile(manifestPath(), "utf8")) as Manifest;
  if (manifest.schemaVersion !== 1 || !manifest.runId || !Array.isArray(manifest.objects)) throw new Error("Unsupported storage migration manifest");
  const actualHash = createHash("sha256").update(canonicalManifest(manifest.objects)).digest("hex");
  if (actualHash !== manifest.manifestHash) throw new Error("Manifest hash mismatch; do not continue with a modified manifest");
  return manifest;
}

async function updateRunCounts(sql: ReturnType<typeof postgres>, runId: string) {
  await sql`
    UPDATE storage_migration_runs AS run SET
      completed_objects = counts.completed,
      verified_objects = counts.verified,
      failed_objects = counts.failed,
      status = CASE
        WHEN counts.failed > 0 THEN 'failed'
        WHEN counts.verified = run.total_objects THEN 'verified'
        WHEN counts.completed > 0 THEN 'backfilled'
        ELSE run.status
      END,
      updated_at = now()
    FROM (
      SELECT
        count(*) FILTER (WHERE status IN ('uploaded', 'verified'))::int AS completed,
        count(*) FILTER (WHERE status = 'verified')::int AS verified,
        count(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM storage_migration_objects WHERE migration_run_id = ${runId}
    ) AS counts
    WHERE run.id = ${runId}
  `;
}

async function backfill() {
  const manifest = await readManifest();
  const root = manifest.sourceRoot;
  const { client, config } = s3Target();
  const sql = database();
  const batchSize = Number(optional("STORAGE_MIGRATION_BATCH_SIZE") ?? 50);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new Error("STORAGE_MIGRATION_BATCH_SIZE must be an integer from 1 to 1000");
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const ready = manifest.objects.filter((object): object is ManifestObject & { byteSize: number; sha256: string } => object.state === "ready" && object.byteSize !== null && object.sha256 !== null);
    for (let offset = 0; offset < ready.length; offset += batchSize) {
      for (const object of ready.slice(offset, offset + batchSize)) {
        const key = targetKey(config.prefix, object.storageKey);
        try {
          const currentStat = await stat(path.join(root, object.relativePath));
          const currentHash = await sha256File(path.join(root, object.relativePath));
          if (currentStat.size !== object.byteSize || currentHash !== object.sha256) throw new Error("Local object changed after manifest generation");
          const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key })).catch((error: { name?: string; $metadata?: { httpStatusCode?: number } }) => {
            if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) return null;
            throw error;
          });
          if (head && Number(head.ContentLength) === object.byteSize && head.Metadata?.sha256 === object.sha256) {
            skipped += 1;
            await sql`UPDATE storage_migration_objects SET status = 'uploaded', target_etag = ${head.ETag ?? null}, uploaded_at = coalesce(uploaded_at, now()), last_error = NULL, updated_at = now() WHERE migration_run_id = ${manifest.runId} AND storage_key = ${object.storageKey}`;
            continue;
          }
          const out = await client.send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: createReadStream(path.join(root, object.relativePath)),
            ContentLength: object.byteSize,
            Metadata: { sha256: object.sha256, "source-size": String(object.byteSize), "migration-run-id": manifest.runId },
            ...(config.serverSideEncryption ? { ServerSideEncryption: config.serverSideEncryption } : {}),
          }));
          uploaded += 1;
          await sql`UPDATE storage_migration_objects SET status = 'uploaded', target_etag = ${out.ETag ?? null}, uploaded_at = now(), last_error = NULL, updated_at = now() WHERE migration_run_id = ${manifest.runId} AND storage_key = ${object.storageKey}`;
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          await sql`UPDATE storage_migration_objects SET status = 'failed', last_error = ${message.slice(0, 4000)}, updated_at = now() WHERE migration_run_id = ${manifest.runId} AND storage_key = ${object.storageKey}`;
        }
      }
      await updateRunCounts(sql, manifest.runId);
    }
    console.log(JSON.stringify({ command: "backfill", runId: manifest.runId, uploaded, alreadyPresent: skipped, failed }, null, 2));
    if (failed) process.exitCode = 1;
  } finally {
    await sql.end();
    client.destroy();
  }
}

async function bodyChecksum(body: AsyncIterable<Uint8Array>) {
  const hash = createHash("sha256");
  let byteSize = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    hash.update(chunk);
    byteSize += chunk.byteLength;
  }
  return { byteSize, sha256: hash.digest("hex") };
}

async function verify() {
  const manifest = await readManifest();
  const { client, config } = s3Target();
  const sql = database();
  let verified = 0;
  let failed = 0;
  try {
    for (const object of manifest.objects) {
      if (object.state !== "ready" || object.byteSize === null || object.sha256 === null) continue;
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: targetKey(config.prefix, object.storageKey) }));
        if (!out.Body) throw new Error("S3 object has no response body");
        const actual = await bodyChecksum(out.Body as AsyncIterable<Uint8Array>);
        if (actual.byteSize !== object.byteSize || actual.sha256 !== object.sha256) throw new Error(`Checksum mismatch: expected ${object.sha256}/${object.byteSize}, received ${actual.sha256}/${actual.byteSize}`);
        verified += 1;
        await sql`UPDATE storage_migration_objects SET status = 'verified', verified_at = now(), last_error = NULL, updated_at = now() WHERE migration_run_id = ${manifest.runId} AND storage_key = ${object.storageKey}`;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        await sql`UPDATE storage_migration_objects SET status = 'failed', last_error = ${message.slice(0, 4000)}, updated_at = now() WHERE migration_run_id = ${manifest.runId} AND storage_key = ${object.storageKey}`;
      }
    }
    await updateRunCounts(sql, manifest.runId);
    console.log(JSON.stringify({ command: "verify", runId: manifest.runId, verified, failed }, null, 2));
    if (failed) process.exitCode = 1;
  } finally {
    await sql.end();
    client.destroy();
  }
}

async function cutoverCheck() {
  const manifest = await readManifest();
  const sql = database();
  try {
    const [run] = await sql<{ status: string; total_objects: number; verified_objects: number; failed_objects: number }[]>`
      SELECT status, total_objects, verified_objects, failed_objects
      FROM storage_migration_runs WHERE id = ${manifest.runId}
    `;
    if (!run) throw new Error("Migration run was not found in the ledger");
    const missingLocal = manifest.objects.filter((object) => object.state === "missing_local");
    const unverified = await sql<{ storage_key: string; status: string }[]>`
      SELECT storage_key, status FROM storage_migration_objects
      WHERE migration_run_id = ${manifest.runId} AND status <> 'verified'
      ORDER BY storage_key
    `;
    const ready = missingLocal.length === 0 && unverified.length === 0 && Number(run.failed_objects) === 0 && Number(run.verified_objects) === Number(run.total_objects);
    console.log(JSON.stringify({ command: "cutover-check", runId: manifest.runId, ready, ledgerStatus: run.status, totalObjects: Number(run.total_objects), verifiedObjects: Number(run.verified_objects), missingLocalReferences: missingLocal.map((object) => ({ storageKey: object.storageKey, references: object.references })), unverified }, null, 2));
    if (!ready) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

async function main() {
  const command = process.argv[2];
  if (command === "manifest") await createManifest();
  else if (command === "backfill") await backfill();
  else if (command === "verify") await verify();
  else if (command === "cutover-check") await cutoverCheck();
  else {
    console.error("Usage: npm run storage:migrate -- <manifest|backfill|verify|cutover-check> [--manifest path]");
    process.exitCode = 2;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
