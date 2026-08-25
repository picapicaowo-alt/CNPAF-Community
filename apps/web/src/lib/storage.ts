import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getStorageRuntimeConfig,
  type StorageBackend,
} from "@/config/server";

export type { StorageBackend } from "@/config/server";

let s3Client: S3Client | null = null;

export function storageBackend(): StorageBackend {
  return getStorageRuntimeConfig().backend;
}

function assertSafeKey(key: string) {
  if (!key || key.includes("..") || path.isAbsolute(key) || key.startsWith("/") || key.includes("\\")) {
    throw new Error("invalid storage key");
  }
}

function objectKey(key: string, prefix: string) {
  assertSafeKey(key);
  return prefix ? `${prefix}/${key}` : key;
}

function getS3() {
  const config = getStorageRuntimeConfig();
  if (config.backend !== "s3") throw new Error("S3 storage is not configured");
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.region,
      ...(config.endpoint
        ? {
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle,
          }
        : {}),
    });
  }
  return { client: s3Client, config };
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (storageBackend() === "s3") {
    const { client, config } = getS3();
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey(key, config.prefix),
        Body: body,
        ContentType: contentType,
        ...(config.serverSideEncryption
          ? { ServerSideEncryption: "AES256" as const }
          : {}),
      }),
    );
    return;
  }
  assertSafeKey(key);
  // The runtime upload root is intentionally configurable and contains data, not application code.
  const config = getStorageRuntimeConfig();
  if (config.backend !== "local") throw new Error("Local storage is not configured");
  const full = path.join(/* turbopackIgnore: true */ config.directory, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType?: string }> {
  if (storageBackend() === "s3") {
    const { client, config } = getS3();
    try {
      const out = await client.send(new GetObjectCommand({
        Bucket: config.bucket,
        Key: objectKey(key, config.prefix),
      }));
      const bytes = await out.Body!.transformToByteArray();
      return { body: Buffer.from(bytes), contentType: out.ContentType };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (!config.fallbackLocalDirectory || (status !== 404 && name !== "NoSuchKey" && name !== "NotFound")) throw error;
      assertSafeKey(key);
      return { body: await readFile(path.join(config.fallbackLocalDirectory, key)) };
    }
  }
  assertSafeKey(key);
  const config = getStorageRuntimeConfig();
  if (config.backend !== "local") throw new Error("Local storage is not configured");
  const body = await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ config.directory, key));
  return { body };
}

export type StorageObjectStream = {
  body: ReadableStream<Uint8Array>;
  contentLength?: number;
  contentType?: string;
};

async function getLocalObjectStream(
  directory: string,
  key: string,
): Promise<StorageObjectStream> {
  assertSafeKey(key);
  const full = path.join(directory, key);
  const metadata = await stat(full);
  return {
    body: Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>,
    contentLength: metadata.size,
  };
}

/**
 * Streams user-facing downloads so large S3 objects do not need to be copied
 * into the web process heap. Buffer-based getObject remains available for the
 * explicitly bounded AI/image processing paths.
 */
export async function getObjectStream(key: string): Promise<StorageObjectStream> {
  if (storageBackend() === "s3") {
    const { client, config } = getS3();
    try {
      const out = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: objectKey(key, config.prefix),
        }),
      );
      if (!out.Body) throw new Error("S3 object body is empty");
      return {
        body: out.Body.transformToWebStream(),
        contentLength: out.ContentLength,
        contentType: out.ContentType,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (!config.fallbackLocalDirectory || (status !== 404 && name !== "NoSuchKey" && name !== "NotFound")) throw error;
      return getLocalObjectStream(config.fallbackLocalDirectory, key);
    }
  }
  const config = getStorageRuntimeConfig();
  if (config.backend !== "local") throw new Error("Local storage is not configured");
  return getLocalObjectStream(config.directory, key);
}

export async function deleteObject(key: string) {
  if (storageBackend() === "s3") {
    const { client, config } = getS3();
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: objectKey(key, config.prefix),
      }),
    );
    return;
  }
  assertSafeKey(key);
  const config = getStorageRuntimeConfig();
  if (config.backend !== "local") throw new Error("Local storage is not configured");
  try {
    await unlink(
      /* turbopackIgnore: true */ path.join(
        /* turbopackIgnore: true */ config.directory,
        key,
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
