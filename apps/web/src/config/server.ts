import { readFileSync } from "node:fs";
import path from "node:path";

export type StorageBackend = "local" | "s3";
export type OpenAiWebSearchContextSize = "low" | "medium" | "high";
export type NotificationEmailRuntimeConfig =
  | { enabled: false; provider: "disabled" }
  | {
      enabled: true;
      provider: "gmail";
      appBaseUrl: string;
      apiBaseUrl: string;
      oauthScope: string;
      delegatedSender: string;
      fromName: string;
      serviceAccountEmail: string;
      serviceAccountPrivateKey: string;
      allowedRecipientDomains: ReadonlySet<string>;
    };

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

function integer(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = optional(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
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

export function getInsightRuntimeConfig() {
  return {
    liveRefreshMs: integer("INSIGHT_LIVE_REFRESH_MS", 30_000, 5_000, 300_000),
  };
}

export function getNotificationEmailRuntimeConfig(): NotificationEmailRuntimeConfig {
  const provider = optional("NOTIFICATION_EMAIL_PROVIDER")?.toLowerCase() ?? "disabled";
  if (provider === "disabled") return { enabled: false, provider };
  if (provider !== "gmail") {
    throw new Error("NOTIFICATION_EMAIL_PROVIDER must be disabled or gmail");
  }
  const delegatedSender = required("GMAIL_DELEGATED_SENDER").toLowerCase();
  const { email: serviceAccountEmail, privateKey: serviceAccountPrivateKey } =
    gmailServiceAccountCredentials();
  const allowedRecipientDomains = new Set(
    required("NOTIFICATION_EMAIL_ALLOWED_DOMAINS")
      .split(",")
      .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
      .filter(Boolean),
  );
  if (!allowedRecipientDomains.size) {
    throw new Error("NOTIFICATION_EMAIL_ALLOWED_DOMAINS must contain at least one domain");
  }
  return {
    enabled: true,
    provider,
    appBaseUrl: httpUrl("APP_BASE_URL").replace(/\/$/, ""),
    apiBaseUrl: httpUrl("GMAIL_API_BASE_URL").replace(/\/$/, ""),
    oauthScope: httpUrl("GMAIL_OAUTH_SCOPE"),
    delegatedSender,
    fromName: optional("GMAIL_FROM_NAME") ?? "CNPAF Community",
    serviceAccountEmail,
    serviceAccountPrivateKey,
    allowedRecipientDomains,
  };
}

function gmailServiceAccountCredentials() {
  const credentialsFile = optional("GMAIL_SERVICE_ACCOUNT_CREDENTIALS_FILE");
  const inlineEmail = optional("GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL");
  const inlinePrivateKey = optional("GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY");

  if (credentialsFile) {
    if (inlineEmail || inlinePrivateKey) {
      throw new Error(
        "GMAIL_SERVICE_ACCOUNT_CREDENTIALS_FILE cannot be combined with inline Gmail service account credentials",
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        readFileSync(
          /* turbopackIgnore: true */ path.resolve(
            /* turbopackIgnore: true */ credentialsFile,
          ),
          "utf8",
        ),
      );
    } catch {
      throw new Error("GMAIL_SERVICE_ACCOUNT_CREDENTIALS_FILE must contain readable JSON credentials");
    }
    if (!isGmailServiceAccountCredentials(parsed)) {
      throw new Error("GMAIL_SERVICE_ACCOUNT_CREDENTIALS_FILE is not a valid service account credential file");
    }
    return {
      email: parsed.client_email.toLowerCase(),
      privateKey: parsed.private_key,
    };
  }

  return {
    email: required("GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL").toLowerCase(),
    privateKey: required("GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

function isGmailServiceAccountCredentials(
  value: unknown,
): value is { client_email: string; private_key: string } {
  if (!value || typeof value !== "object") return false;
  const credentials = value as Record<string, unknown>;
  return (
    typeof credentials.client_email === "string" &&
    credentials.client_email.includes("@") &&
    typeof credentials.private_key === "string" &&
    credentials.private_key.startsWith("-----BEGIN ") &&
    credentials.private_key.trimEnd().endsWith(" KEY-----") &&
    credentials.private_key.length > 500
  );
}

export function getTaskAutomationRuntimeConfig() {
  return {
    secret: required("TASK_AUTOMATION_SECRET"),
    recurrenceLookaheadDays: integer("TASK_RECURRENCE_LOOKAHEAD_DAYS", 7, 0, 90),
  };
}

export function useSecureSessionCookies() {
  return process.env.NODE_ENV === "production";
}
