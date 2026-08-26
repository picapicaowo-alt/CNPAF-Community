import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./session";
import type { AuthorizationResource, PermissionKey } from "@cnpaf/shared";
import { authorize, authorizeAny } from "./authorization";
import type { AuthorizationDecision } from "./authorization";

type UserCheck =
  | { user: null; error: NextResponse }
  | { user: SessionUser; error: null };

type PermissionCheck =
  | { user: null; decision: null; error: NextResponse }
  | { user: SessionUser; decision: null; error: NextResponse }
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
  if (user.mustChangePassword) {
    return {
      user,
      decision: null,
      error: NextResponse.json(
        { error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
        { status: 403 },
      ),
    };
  }
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

export async function requireAnyPermission(permissions: PermissionKey[], resource?: AuthorizationResource): Promise<PermissionCheck> {
  const { user, error } = await requireUser();
  if (error || !user) return { user, decision: null, error };
  if (user.mustChangePassword) {
    return {
      user,
      decision: null,
      error: NextResponse.json(
        { error: "Password change required", code: "PASSWORD_CHANGE_REQUIRED" },
        { status: 403 },
      ),
    };
  }
  const decision = await authorizeAny({ userId: user.id, permissions, resource });
  if (!decision.allowed) {
    return {
      user,
      decision,
      error: NextResponse.json({ error: "Forbidden", authorization: decision.reason }, { status: 403 }),
    };
  }
  return { user, decision, error: null };
}

export function registryManagementPermissions(
  registryKey: string,
): PermissionKey[] {
  return registryKey === "site_type"
    ? ["services.manage", "locations.manage"]
    : ["services.manage"];
}

export function requireRegistryManagement(registryKey: string) {
  return requireAnyPermission(registryManagementPermissions(registryKey));
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function privateNoStoreJson<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });
}
