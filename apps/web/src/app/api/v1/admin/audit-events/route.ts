import { NextResponse } from "next/server";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { auditEvents, users } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";

type AuditCursor = { createdAt: Date; id: string };

function decodeCursor(value: string | null): AuditCursor | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: string; id?: string };
    const createdAt = new Date(decoded.createdAt ?? "");
    if (!decoded.id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: decoded.id };
  } catch {
    const legacyDate = new Date(value);
    return Number.isNaN(legacyDate.getTime()) ? null : { createdAt: legacyDate, id: "ffffffff-ffff-ffff-ffff-ffffffffffff" };
  }
}

function encodeCursor(cursor: AuditCursor) {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), "utf8").toString("base64url");
}

function auditEventAllowed(access: Awaited<ReturnType<typeof getAccessContext>>, organizationId: string | null) {
  const decision = evaluateAuthorization(access, "audit.view", { organizationId });
  if (!decision.allowed) return false;
  if (decision.reason === "explicit_allow") return true;
  return decision.roleAssignmentIds.some((assignmentId) => {
    const grant = access.grants.find((item) => item.roleAssignmentId === assignmentId && item.permissionKey === "audit.view" && item.effect === "allow");
    if (!grant || (grant.organizationId && organizationId && grant.organizationId !== organizationId)) return false;
    const scopes = access.scopes.filter((scope) =>
      (!scope.roleAssignmentId || scope.roleAssignmentId === assignmentId) &&
      (!scope.permissionId || scope.permissionId === grant.permissionId),
    );
    const allows = scopes.filter((scope) => scope.effect === "allow");
    if (!allows.length) return organizationId ? !grant.organizationId || grant.organizationId === organizationId : true;
    if (allows.some((scope) => scope.scopeType === "global")) return true;
    return Boolean(organizationId && allows.some((scope) => scope.scopeType === "organization" && (scope.scopeId === organizationId || scope.scopeKey === organizationId)));
  });
}

export async function GET(req: Request) {
  const { user, error } = await requirePermission("audit.view");
  if (error) return error;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 250);
  const beforeValue = url.searchParams.get("before");
  const initialCursor = decodeCursor(beforeValue);
  if (beforeValue && !initialCursor) return jsonError("Invalid before cursor");
  const access = await getAccessContext(user.id);
  let cursor = initialCursor;
  const visible: Array<{ event: typeof auditEvents.$inferSelect; targetOrganizationId: string | null }> = [];
  let exhausted = false;
  while (visible.length <= limit && !exhausted) {
    const condition = cursor ? or(
      lt(auditEvents.createdAt, cursor.createdAt),
      and(eq(auditEvents.createdAt, cursor.createdAt), lt(auditEvents.id, cursor.id)),
    ) : undefined;
    const query = db
      .select({ event: auditEvents, targetOrganizationId: users.organizationId })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.targetUserId, users.id));
    const batch = condition
      ? await query.where(condition).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(250)
      : await query.orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(250);
    visible.push(...batch.filter((row) => auditEventAllowed(access, row.targetOrganizationId)).slice(0, limit + 1 - visible.length));
    exhausted = batch.length < 250;
    const last = batch.at(-1)?.event;
    cursor = last ? { createdAt: last.createdAt, id: last.id } : cursor;
    if (!last) exhausted = true;
  }
  const page = visible.slice(0, limit);
  return NextResponse.json({
    events: page.map((row) => row.event),
    nextBefore: visible.length > limit && page.length ? encodeCursor({ createdAt: page.at(-1)!.event.createdAt, id: page.at(-1)!.event.id }) : null,
  });
}
