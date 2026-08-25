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

export async function apiFetch<T>(
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

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}
