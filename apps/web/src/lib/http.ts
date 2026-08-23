import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./session";
import type { AuthorizationResource, PermissionKey } from "@cnpaf/shared";
import { authorize } from "./authorization";
import type { AuthorizationDecision } from "./authorization";

type UserCheck =
  | { user: null; error: NextResponse }
  | { user: SessionUser; error: null };

type PermissionCheck =
  | { user: null; decision: null; error: NextResponse }
  | { user: SessionUser; decision: AuthorizationDecision; error: NextResponse }
  | { user: SessionUser; decision: AuthorizationDecision; error: null };

export async function requireUser(): Promise<UserCheck> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user, error: null };
}

export async function requirePermission(permission: PermissionKey, resource?: AuthorizationResource): Promise<PermissionCheck> {
  const { user, error } = await requireUser();
  if (error || !user) return { user, decision: null, error };
  const decision = await authorize({ userId: user.id, permission, resource });
  if (!decision.allowed) {
    return {
      user,
      decision,
      error: NextResponse.json({ error: "Forbidden", authorization: decision.reason }, { status: 403 }),
    };
  }
  return { user, decision, error: null };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
