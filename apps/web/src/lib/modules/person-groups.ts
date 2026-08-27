import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  personGroupMemberships,
  personGroups,
  users,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type {
  personGroupCreateBodySchema,
  personGroupUpdateBodySchema,
} from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize } from "../authorization";
import { queueNotification } from "./notification-delivery";

type PersonGroupCreate = z.infer<typeof personGroupCreateBodySchema>;
type PersonGroupUpdate = z.infer<typeof personGroupUpdateBodySchema>;

async function requireActorOrganization(actorId: string) {
  const actor = (
    await db.select().from(users).where(eq(users.id, actorId)).limit(1)
  )[0];
  if (!actor?.organizationId) {
    throw new ApiError(
      "BAD_REQUEST",
      "An organization-scoped account is required",
      400,
    );
  }
  return actor.organizationId;
}

async function requireGroup(
  actorId: string,
  groupId: string,
  permission: string,
) {
  const group = (
    await db.select().from(personGroups).where(eq(personGroups.id, groupId)).limit(1)
  )[0];
  if (!group) throw new ApiError("NOT_FOUND", "People group not found", 404);
  if (
    !(await authorize({
      userId: actorId,
      permission,
      resource: { organizationId: group.organizationId },
    })).allowed
  ) {
    throw new ApiError("FORBIDDEN", "People group is outside the assigned scope", 403);
  }
  return group;
}

async function validateUsers(userIds: string[], organizationId: string) {
  if (!userIds.length) return;
  const selected = await db
    .select({
      id: users.id,
      organizationId: users.organizationId,
      status: users.status,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  if (
    selected.length !== userIds.length ||
    selected.some(
      (user) =>
        user.status !== "active" || user.organizationId !== organizationId,
    )
  ) {
    throw new ApiError(
      "BAD_REQUEST",
      "Groups may only contain active people from the same organization",
      400,
    );
  }
}

export async function listPersonGroups(actorId: string) {
  const organizationId = await requireActorOrganization(actorId);
  const resource = { organizationId };
  const canView =
    (await authorize({ userId: actorId, permission: "people.view", resource }))
      .allowed ||
    (await authorize({ userId: actorId, permission: "users.view", resource }))
      .allowed;
  if (!canView) {
    throw new ApiError("FORBIDDEN", "People groups are outside the assigned scope", 403);
  }
  const groups = await db
    .select()
    .from(personGroups)
    .where(eq(personGroups.organizationId, organizationId))
    .orderBy(asc(personGroups.nameEn));
  if (!groups.length) return [];
  const memberships = await db
    .select({
      groupId: personGroupMemberships.groupId,
      userId: personGroupMemberships.userId,
    })
    .from(personGroupMemberships)
    .where(
      and(
        inArray(
          personGroupMemberships.groupId,
          groups.map((group) => group.id),
        ),
        eq(personGroupMemberships.status, "active"),
      ),
    );
  const memberIdsByGroup = new Map<string, string[]>();
  for (const membership of memberships) {
    memberIdsByGroup.set(membership.groupId, [
      ...(memberIdsByGroup.get(membership.groupId) ?? []),
      membership.userId,
    ]);
  }
  return groups.map((group) => ({
    ...group,
    memberIds: memberIdsByGroup.get(group.id) ?? [],
  }));
}

export async function createPersonGroup(
  actorId: string,
  input: PersonGroupCreate,
  requestId?: string,
) {
  const organizationId = await requireActorOrganization(actorId);
  if (
    !(await authorize({
      userId: actorId,
      permission: "people.manage_groups",
      resource: { organizationId },
    })).allowed
  ) {
    throw new ApiError("FORBIDDEN", "Cannot create people groups", 403);
  }
  const keyExists = Boolean(
    (
      await db
        .select({ id: personGroups.id })
        .from(personGroups)
        .where(
          and(
            eq(personGroups.organizationId, organizationId),
            eq(personGroups.key, input.key),
          ),
        )
        .limit(1)
    )[0],
  );
  const key = keyExists
    ? `${input.key.slice(0, 150)}-${randomUUID().slice(0, 8)}`
    : input.key;
  await validateUsers(input.userIds, organizationId);
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(personGroups)
      .values({
        organizationId,
        key,
        nameEn: input.nameEn,
        nameZh: input.nameZh,
        descriptionEn: input.descriptionEn ?? null,
        descriptionZh: input.descriptionZh ?? null,
        createdById: actorId,
      })
      .returning();
    if (input.userIds.length) {
      await tx.insert(personGroupMemberships).values(
        input.userIds.map((userId) => ({
          groupId: group.id,
          userId,
          addedById: actorId,
        })),
      );
      for (const userId of input.userIds) {
        await queueNotification(tx, {
          userId,
          kindKey: "group_membership_changed",
          title: "You were assigned to a people group",
          body: `You were added to the people group “${input.nameEn}”.`,
          entityType: "person_group",
          entityId: group.id,
          metadata: {
            actionPath: `/people/${userId}`,
            emailSubject: `[CNPAF] Added to people group: ${input.nameEn}`,
          },
        });
      }
    }
    const result = { ...group, memberIds: input.userIds };
    await audit(
      {
        actorId,
        action: "person_group.created",
        entityType: "person_group",
        entityId: group.id,
        afterState: result,
        metadata: { requestId, memberCount: input.userIds.length },
      },
      (values) => tx.insert(auditEvents).values(values),
    );
    return result;
  });
}

export async function updatePersonGroup(
  actorId: string,
  groupId: string,
  input: PersonGroupUpdate,
  requestId?: string,
) {
  const before = await requireGroup(actorId, groupId, "people.manage_groups");
  if (input.userIds) await validateUsers(input.userIds, before.organizationId);
  return db.transaction(async (tx) => {
    const beforeMemberships = await tx
      .select({ userId: personGroupMemberships.userId })
      .from(personGroupMemberships)
      .where(
        and(
          eq(personGroupMemberships.groupId, groupId),
          eq(personGroupMemberships.status, "active"),
        ),
      );
    const [after] = await tx
      .update(personGroups)
      .set({
        ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
        ...(input.nameZh !== undefined ? { nameZh: input.nameZh } : {}),
        ...(input.descriptionEn !== undefined
          ? { descriptionEn: input.descriptionEn }
          : {}),
        ...(input.descriptionZh !== undefined
          ? { descriptionZh: input.descriptionZh }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(personGroups.id, groupId))
      .returning();
    if (input.userIds) {
      await tx
        .update(personGroupMemberships)
        .set({ status: "inactive", updatedAt: new Date() })
        .where(eq(personGroupMemberships.groupId, groupId));
      if (input.userIds.length) {
        await tx
          .insert(personGroupMemberships)
          .values(
            input.userIds.map((userId) => ({
              groupId,
              userId,
              status: "active",
              addedById: actorId,
            })),
          )
          .onConflictDoUpdate({
            target: [
              personGroupMemberships.groupId,
              personGroupMemberships.userId,
            ],
            set: {
              status: "active",
              addedById: actorId,
              updatedAt: new Date(),
            },
          });
      }
    }
    const memberIds =
      input.userIds ?? beforeMemberships.map((membership) => membership.userId);
    if (input.userIds) {
      const beforeIds = new Set(beforeMemberships.map((membership) => membership.userId));
      const afterIds = new Set(input.userIds);
      for (const userId of new Set([...beforeIds, ...afterIds])) {
        if (beforeIds.has(userId) === afterIds.has(userId)) continue;
        const added = afterIds.has(userId);
        await queueNotification(tx, {
          userId,
          kindKey: "group_membership_changed",
          title: "Your people group assignment changed",
          body: added
            ? `You were added to the people group “${after.nameEn}”.`
            : `You were removed from the people group “${after.nameEn}”.`,
          entityType: "person_group",
          entityId: groupId,
          metadata: {
            actionPath: `/people/${userId}`,
            emailSubject: `[CNPAF] People group assignment changed: ${after.nameEn}`,
          },
        });
      }
    }
    const result = { ...after, memberIds };
    await audit(
      {
        actorId,
        action: "person_group.updated",
        entityType: "person_group",
        entityId: groupId,
        beforeState: {
          ...before,
          memberIds: beforeMemberships.map((membership) => membership.userId),
        },
        afterState: result,
        metadata: { requestId, memberCount: memberIds.length },
      },
      (values) => tx.insert(auditEvents).values(values),
    );
    return result;
  });
}
