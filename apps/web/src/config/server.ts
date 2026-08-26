import path from "node:path";

export type StorageBackend = "local" | "s3";
export type OpenAiWebSearchContextSize = "low" | "medium" | "high";

function optional(name: string) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function required(name: string) {
  const value = optional(name);
  if (!value) throw new Error(`${name} is required for the selected runtime configuration`);
  return value;
}

function boolean(name: string, fallback: boolean) {
  const value = optional(name)?.toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be either true or false`);
}

function httpUrl(name: string) {
  const value = required(name);
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  return url.toString();
}

/**
 * The only web-runtime environment boundary. Server modules consume typed
 * configuration from here instead of reading process.env independently.
 */
export function getStorageRuntimeConfig() {
  const configuredBackend = optional("STORAGE_BACKEND")?.toLowerCase() ?? "local";
  if (configuredBackend !== "local" && configuredBackend !== "s3") {
    throw new Error("STORAGE_BACKEND must be local or s3");
  }

  if (configuredBackend === "local") {
    return {
      backend: "local" as const,
      directory: optional("UPLOAD_DIR") ?? path.join(process.cwd(), "uploads"),
    };
  }

  const endpoint = optional("S3_ENDPOINT");
  return {
    backend: "s3" as const,
    bucket: required("S3_BUCKET"),
    endpoint,
    forcePathStyle: endpoint ? boolean("S3_FORCE_PATH_STYLE", true) : false,
    prefix: optional("S3_PREFIX")?.replace(/^\/+|\/+$/g, "") ?? "",
    region: optional("S3_REGION") ?? required("AWS_REGION"),
    serverSideEncryption: !endpoint,
    fallbackLocalDirectory: optional("STORAGE_FALLBACK_LOCAL_DIR"),
  };
}

export function getOpenAiRuntimeConfig() {
  const webSearchContextSize = optional("OPENAI_WEB_SEARCH_CONTEXT_SIZE")?.toLowerCase() ?? "medium";
  if (!["low", "medium", "high"].includes(webSearchContextSize)) {
    throw new Error("OPENAI_WEB_SEARCH_CONTEXT_SIZE must be low, medium, or high");
  }
  return {
    apiKey: required("OPENAI_API_KEY"),
    endpoint: httpUrl("OPENAI_BASE_URL"),
    webSearchEnabled: boolean("OPENAI_WEB_SEARCH_ENABLED", true),
    webSearchContextSize: webSearchContextSize as OpenAiWebSearchContextSize,
  };
}

export function useSecureSessionCookies() {
  return process.env.NODE_ENV === "production";
}
