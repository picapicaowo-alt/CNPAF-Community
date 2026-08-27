export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

const AUTH_SESSION_PATH = "/api/v1/auth/me";
const AUTH_SESSION_TTL_MS = 30_000;
const API_READ_CACHE_TTL_MS = 5_000;

let authSessionCache: { expiresAt: number; value: unknown } | null = null;
let authSessionRequest: Promise<unknown> | null = null;
const apiReadCache = new Map<
  string,
  { expiresAt: number; value: unknown }
>();
const apiReadRequests = new Map<string, Promise<unknown>>();

function requestPath(input: RequestInfo | URL) {
  if (typeof input === "string") return input.split("?", 1)[0];
  if (input instanceof URL) return input.pathname;
  return new URL(input.url).pathname;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request)
    return input.method.toUpperCase();
  return "GET";
}

function requestKey(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function invalidateApiReadCache() {
  apiReadCache.clear();
  apiReadRequests.clear();
}

export function invalidateAuthSessionCache() {
  authSessionCache = null;
  authSessionRequest = null;
}

async function performApiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  const response = await fetch(input, { ...init, headers });
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const modern =
      typeof payload === "object" &&
      payload &&
      "error" in payload &&
      typeof payload.error === "object"
        ? (payload.error as {
            code?: string;
            message?: string;
            details?: unknown;
          })
        : null;
    const legacy =
      typeof payload === "object" &&
      payload &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : null;
    throw new ClientApiError(
      modern?.message ?? legacy ?? response.statusText ?? "Request failed",
      response.status,
      modern?.code,
      modern?.details,
    );
  }
  return payload as T;
}

export async function apiFetch<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const path = requestPath(input);
  const method = requestMethod(input, init);
  const isAuthSessionRead = method === "GET" && path === AUTH_SESSION_PATH;
  const refreshAuthSession =
    init?.cache === "reload" || init?.cache === "no-store";
  const isApiRead =
    method === "GET" &&
    path.startsWith("/api/v1/") &&
    !isAuthSessionRead &&
    !refreshAuthSession &&
    !init?.headers;

  if (method !== "GET") {
    invalidateApiReadCache();
    if (
      path.startsWith("/api/v1/auth/") ||
      path.startsWith("/api/v1/account")
    ) {
      invalidateAuthSessionCache();
    }
  }

  if (isAuthSessionRead && !refreshAuthSession) {
    if (authSessionCache && authSessionCache.expiresAt > Date.now())
      return authSessionCache.value as T;
    if (authSessionRequest) return authSessionRequest as Promise<T>;
  }

  const key = isApiRead ? requestKey(input) : "";
  if (isApiRead) {
    const cached = apiReadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value as T;
    if (cached) apiReadCache.delete(key);
    const pending = apiReadRequests.get(key);
    if (pending) return pending as Promise<T>;
  }

  const request = performApiFetch<T>(input, init);
  if (isApiRead) {
    const trackedRequest = request
      .then((value) => {
        apiReadCache.set(key, {
          expiresAt: Date.now() + API_READ_CACHE_TTL_MS,
          value,
        });
        return value;
      })
      .finally(() => {
        if (apiReadRequests.get(key) === trackedRequest)
          apiReadRequests.delete(key);
      });
    apiReadRequests.set(key, trackedRequest);
    return trackedRequest;
  }
  if (!isAuthSessionRead) return request;

  const trackedRequest = request
    .then((value) => {
      authSessionCache = {
        expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
        value,
      };
      return value;
    })
    .finally(() => {
      if (authSessionRequest === trackedRequest) authSessionRequest = null;
    });
  authSessionRequest = trackedRequest;
  return trackedRequest;
}

export function prefetchApi(input: string) {
  void apiFetch(input).catch(() => undefined);
}

export function errorMessage(error: unknown) {
  const locale =
    typeof document !== "undefined" && document.documentElement.lang === "zh"
      ? "zh"
      : "en";
  if (locale === "en")
    return error instanceof Error ? error.message : "Request failed";
  if (error instanceof ClientApiError) {
    const byCode: Record<string, string> = {
      BAD_REQUEST: "提交的信息有误，请检查后重试。",
      UNAUTHENTICATED: "登录状态已失效，请重新登录。",
      FORBIDDEN: "当前账号没有执行此操作的权限。",
      NOT_FOUND: "请求的内容不存在或已被移除。",
      CONFLICT: "内容已发生变化，请刷新后重试。",
      INVALID_TRANSITION: "当前状态下无法执行此操作，请刷新后重试。",
      IDEMPOTENCY_CONFLICT: "该请求已处理，请刷新页面确认最新状态。",
      PASSWORD_CHANGE_REQUIRED: "请先修改临时密码。",
      INTERNAL_ERROR: "服务暂时无法完成请求，请稍后重试。",
    };
    return byCode[error.code ?? ""] ??
      (error.status >= 500
        ? "服务暂时无法完成请求，请稍后重试。"
        : "请求未完成，请检查后重试。");
  }
  return error instanceof Error && /[一-龥]/.test(error.message)
    ? error.message
    : "请求未完成，请检查后重试。";
}
