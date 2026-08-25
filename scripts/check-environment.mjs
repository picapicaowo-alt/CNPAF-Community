import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import process from "node:process";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env" });
config({ path: "apps/web/.env.local" });

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function checkDatabase() {
  const databaseUrl = required("DATABASE_URL");
  const parsed = new URL(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    await sql`select 1 as ready`;
    return `${parsed.hostname}:${parsed.port || "5432"}/${parsed.pathname.slice(1)}`;
  } finally {
    await sql.end();
  }
}

async function checkStorage() {
  const backend = (process.env.STORAGE_BACKEND ?? "local").trim().toLowerCase();
  if (backend === "local") {
    const directory = path.resolve(process.env.UPLOAD_DIR?.trim() || "uploads");
    await mkdir(directory, { recursive: true });
    await access(directory, constants.R_OK | constants.W_OK);
    return `local:${directory}`;
  }
  if (backend !== "s3") throw new Error("STORAGE_BACKEND must be local or s3");
  const bucket = required("S3_BUCKET");
  const region = process.env.S3_REGION?.trim() || required("AWS_REGION");
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const client = new S3Client({
    region,
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
        }
      : {}),
  });
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  return `s3://${bucket}/${(process.env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, "")}`;
}

try {
  const [database, storage] = await Promise.all([
    checkDatabase(),
    checkStorage(),
  ]);
  console.log(JSON.stringify({ ok: true, database, storage }, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      { ok: false, error: error instanceof Error ? error.message : "Environment check failed" },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
