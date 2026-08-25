import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "IDEMPOTENCY_CONFLICT"
  | "PASSWORD_CHANGE_REQUIRED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorResponse(error: unknown, requestId?: string) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details, requestId } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Request validation failed", details: error.flatten(), requestId } },
      { status: 400 },
    );
  }
  console.error("Unhandled API error", { requestId, error });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error", requestId } },
    { status: 500 },
  );
}

export function requestId(req: Request) {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}
