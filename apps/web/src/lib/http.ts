import { NextResponse } from "next/server";
import { getSessionUser, isOps, type SessionUser } from "./session";

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    return { user: null as SessionUser | null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, error: null };
}

export async function requireOps() {
  const { user, error } = await requireUser();
  if (error) return { user, error };
  if (!user || !isOps(user.role)) {
    return { user, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, error: null };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
