import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { auditEvents, invites, permissionScopeAssignments, roles, userRoleAssignments, users } from "@cnpaf/db/schema";
import { acceptInviteBodySchema, inviteBodySchema } from "@cnpaf/shared";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/crypto";
import { createSession } from "@/lib/session";
import { jsonError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";
import { scopeAuthorizationResource } from "@/lib/access-admin";

type InitialScopes = {
  organizationIds?: string[];
  programIds?: string[];
  siteIds?: string[];
  locationIds?: string[];
  serviceIds?: string[];
  serviceKeys?: string[];
  templateIds?: string[];
  formIds?: string[];
  dataClasses?: string[];
  researchUse?: string[];
};

function normalizeInitialScopes(initial: InitialScopes) {
  return [
    ...(initial.organizationIds ?? []).map((scopeId) => ({ scopeType: "organization", scopeId })),
    ...(initial.programIds ?? []).map((scopeId) => ({ scopeType: "program", scopeId })),
    ...(initial.siteIds ?? []).map((scopeId) => ({ scopeType: "site", scopeId })),
    ...(initial.locationIds ?? []).map((scopeId) => ({ scopeType: "location", scopeId })),
    ...(initial.serviceIds ?? []).map((scopeId) => ({ scopeType: "service", scopeId })),
    ...(initial.serviceKeys ?? []).map((scopeKey) => ({ scopeType: "service", scopeKey })),
    ...(initial.templateIds ?? []).map((scopeId) => ({ scopeType: "template", scopeId })),
    ...(initial.formIds ?? []).map((scopeId) => ({ scopeType: "form", scopeId })),
    ...(initial.dataClasses ?? []).map((scopeKey) => ({ scopeType: "data_classification", scopeKey })),
    ...(initial.researchUse ?? []).map((scopeKey) => ({ scopeType: "research_use", scopeKey })),
  ];
}

async function validateInitialScopes(initial: InitialScopes, organizationId: string | null, actorId?: string) {
  const scopes = normalizeInitialScopes(initial);
  const access = actorId ? await getAccessContext(actorId) : null;
  for (const scope of scopes) {
    const resolved = await scopeAuthorizationResource(scope);
    if (resolved.organizationId && resolved.organizationId !== organizationId) throw new Error("Invite scopes cannot cross organizations");
    if (scope.scopeType === "organization" && (!("scopeId" in scope) || scope.scopeId !== organizationId)) throw new Error("Invite organization scope must match the invited organization");
    const resource = { ...resolved, organizationId: resolved.organizationId ?? organizationId };
    if (access && !evaluateAuthorization(access, "permissions.assign", resource).allowed) throw new Error("Forbidden to assign one or more invite scopes");
  }
  return scopes;
}

export async function GET() {
  const { user, error } = await requirePermission("users.invite");
  if (error) return error;
  const rows = await db.select().from(invites);
  const access = await getAccessContext(user.id);
  return NextResponse.json({
    invites: rows.filter((invite) => evaluateAuthorization(access, "users.invite", { organizationId: invite.organizationId }).allowed).map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      roleId: r.roleId,
      organizationId: r.organizationId,
      initialScopes: r.initialScopes,
      acceptedAt: r.acceptedAt,
      expiresAt: r.expiresAt,
    })),
  });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("users.invite");
  if (error) return error;
  const parsed = inviteBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  const organizationId = parsed.data.organizationId ?? user!.organizationId;
  const roleKey = parsed.data.roleKey ?? parsed.data.role!;
  const roleCandidates = parsed.data.roleId ? [] : await db.select().from(roles).where(eq(roles.key, roleKey));
  const role = parsed.data.roleId
    ? (await db.select().from(roles).where(eq(roles.id, parsed.data.roleId)).limit(1))[0]
    : roleCandidates.find((candidate) => candidate.organizationId === organizationId)
      ?? roleCandidates.find((candidate) => candidate.organizationId === null);
  if (!role || role.status !== "active") return jsonError("Role not found or archived", 404);
  if (role.organizationId && role.organizationId !== organizationId) return jsonError("Role does not belong to the invited organization", 409);
  const actorAccess = await getAccessContext(user!.id);
  if (!evaluateAuthorization(actorAccess, "users.invite", { organizationId }).allowed) return jsonError("Forbidden", 403);
  try {
    await validateInitialScopes(parsed.data.initialScopes, organizationId, user!.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid invite scopes";
    return jsonError(message, message.startsWith("Forbidden") ? 403 : 400);
  }
  const token = randomToken(24);
  const created = await db.transaction(async (tx) => {
    const [invite] = await tx.insert(invites).values({
      email: parsed.data.email.toLowerCase(),
      role: role.key,
      roleId: role.id,
      organizationId,
      initialScopes: parsed.data.initialScopes,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
      createdById: user!.id,
    }).returning();
    await audit({
      actorId: user!.id,
      action: "user.invited",
      entityType: "invite",
      entityId: invite.id,
      afterState: { email: invite.email, roleId: role.id, organizationId: invite.organizationId, initialScopes: invite.initialScopes },
    }, (values) => tx.insert(auditEvents).values(values));
    return invite;
  });
  return NextResponse.json({ token, acceptPath: `/invite/${token}` });
}

export async function PUT(req: Request) {
  const parsed = acceptInviteBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError("Invalid payload");
  const invite = (
    await db.select().from(invites).where(eq(invites.tokenHash, sha256(parsed.data.token))).limit(1)
  )[0];
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return jsonError("Invite expired or invalid", 400);
  }
  const roleCandidates = invite.roleId ? [] : await db.select().from(roles).where(eq(roles.key, invite.role));
  const role = invite.roleId
    ? (await db.select().from(roles).where(eq(roles.id, invite.roleId)).limit(1))[0]
    : roleCandidates.find((candidate) => candidate.organizationId === invite.organizationId)
      ?? roleCandidates.find((candidate) => candidate.organizationId === null);
  if (!role || role.status !== "active") return jsonError("Invite role is unavailable", 409);
  let scopes;
  try {
    scopes = await validateInitialScopes((invite.initialScopes ?? {}) as InitialScopes, invite.organizationId);
  } catch {
    return jsonError("Invite access configuration is no longer valid", 409);
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const created = await db.transaction(async (tx) => {
    const [newUser] = await tx.insert(users).values({
      email: invite.email,
      name: parsed.data.name,
      passwordHash,
      role: role.key,
      organizationId: invite.organizationId,
    }).returning();
    const [assignment] = await tx.insert(userRoleAssignments).values({
      userId: newUser.id,
      roleId: role.id,
      organizationId: invite.organizationId,
      assignedById: invite.createdById,
      status: "active",
    }).returning();
    if (scopes.length) {
      await tx.insert(permissionScopeAssignments).values(scopes.map((scope) => ({
        userId: newUser.id,
        roleAssignmentId: assignment.id,
        scopeType: scope.scopeType,
        scopeId: "scopeId" in scope ? scope.scopeId : null,
        scopeKey: "scopeKey" in scope ? scope.scopeKey : null,
        assignedById: invite.createdById,
        effect: "allow",
      })));
    }
    await tx.update(invites).set({ acceptedAt: new Date(), updatedAt: new Date() }).where(eq(invites.id, invite.id));
    await audit({
      actorId: newUser.id,
      action: "account.invite_accepted",
      entityType: "user",
      entityId: newUser.id,
      targetUserId: newUser.id,
      afterState: { email: newUser.email, organizationId: newUser.organizationId, roleId: role.id, scopeCount: scopes.length },
    }, (values) => tx.insert(auditEvents).values(values));
    return newUser;
  });
  await createSession(created.id);
  return NextResponse.json({ user: { id: created.id, email: created.email, role: created.role } });
}
