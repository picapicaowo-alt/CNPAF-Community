import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageBackend = "local" | "s3";

let s3Client: S3Client | null = null;

export function storageBackend(): StorageBackend {
  return process.env.STORAGE_BACKEND?.toLowerCase() === "s3" ? "s3" : "local";
}

function localDir() {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
}

function assertSafeKey(key: string) {
  if (!key || key.includes("..") || path.isAbsolute(key) || key.startsWith("/") || key.includes("\\")) {
    throw new Error("invalid storage key");
  }
}

function objectKey(key: string) {
  assertSafeKey(key);
  const prefix = (process.env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${key}` : key;
}

function getS3() {
  const bucket = process.env.S3_BUCKET?.trim();
  if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_BACKEND=s3");
  if (!s3Client) {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    s3Client = new S3Client({
      region: process.env.S3_REGION || process.env.AWS_REGION || "us-west-2",
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
          }
        : {}),
    });
  }
  return { client: s3Client, bucket };
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (storageBackend() === "s3") {
    const { client, bucket } = getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey(key),
        Body: body,
        ContentType: contentType,
        ...(process.env.S3_ENDPOINT ? {} : { ServerSideEncryption: "AES256" as const }),
      }),
    );
    return;
  }
  assertSafeKey(key);
  const full = path.join(localDir(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType?: string }> {
  if (storageBackend() === "s3") {
    const { client, bucket } = getS3();
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
    const bytes = await out.Body!.transformToByteArray();
    return { body: Buffer.from(bytes), contentType: out.ContentType };
  }
  assertSafeKey(key);
  const body = await readFile(path.join(localDir(), key));
  return { body };
}
