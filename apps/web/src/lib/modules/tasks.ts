import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  auditEvents,
  configRegistries,
  configRegistryItems,
  notifications,
  programMemberships,
  programs,
  records,
  sites,
  taskAssignments,
  tasks,
  templates,
  templateVersions,
  users,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { taskAssignmentBodySchema, taskAssignmentTransitionBodySchema, taskCreateBodySchema, taskUpdateBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize, evaluateAuthorization, getAccessContext } from "../authorization";
import { getTemplateVersionBundle } from "../templates";
import { contentHash } from "../crypto";
import { requireActiveRegistryItem } from "../registries";

type TaskCreate = z.infer<typeof taskCreateBodySchema>;
type TaskUpdate = z.infer<typeof taskUpdateBodySchema>;
type AssignInput = z.infer<typeof taskAssignmentBodySchema>;
type AssignmentTransition = z.infer<typeof taskAssignmentTransitionBodySchema>;

const TASK_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["open", "cancelled", "archived"],
  open: ["closed", "cancelled"],
  closed: ["archived"],
  cancelled: ["archived"],
  archived: [],
};
const ASSIGNMENT_TRANSITIONS: Record<string, readonly string[]> = {
  assigned: ["in_progress", "completed", "declined", "cancelled"],
  in_progress: ["completed", "declined", "cancelled"],
  completed: [],
  declined: [],
  cancelled: [],
};

function taskResource(task: typeof tasks.$inferSelect) {
  return { organizationId: task.organizationId, programId: task.programId, siteId: task.siteId, taskId: task.id };
}

function describedTask(row: {
  task: typeof tasks.$inferSelect;
  programKey: string;
  programNameEn: string;
  programNameZh: string;
  locationName: string | null;
  locationRegion: string | null;
  locationAddress: string | null;
  formKey: string;
  formNameEn: string;
  formNameZh: string;
  formVersionNumber: number;
}) {
  return {
    ...row.task,
    program: { id: row.task.programId, key: row.programKey, nameEn: row.programNameEn, nameZh: row.programNameZh },
    location: row.task.siteId ? { id: row.task.siteId, name: row.locationName, region: row.locationRegion, address: row.locationAddress } : null,
    form: { templateVersionId: row.task.templateVersionId, key: row.formKey, nameEn: row.formNameEn, nameZh: row.formNameZh, versionNumber: row.formVersionNumber },
  };
}

function taskDescriptionQuery() {
  return db.select({
    task: tasks,
    programKey: programs.key,
    programNameEn: programs.nameEn,
    programNameZh: programs.nameZh,
    locationName: sites.name,
    locationRegion: sites.region,
    locationAddress: sites.address,
    formKey: templates.key,
    formNameEn: templateVersions.nameEn,
    formNameZh: templateVersions.nameZh,
    formVersionNumber: templateVersions.version,
  }).from(tasks)
    .innerJoin(programs, eq(tasks.programId, programs.id))
    .leftJoin(sites, eq(tasks.siteId, sites.id))
    .innerJoin(templateVersions, eq(tasks.templateVersionId, templateVersions.id))
    .innerJoin(templates, eq(templateVersions.templateId, templates.id));
}

async function assertSiteInOrganization(siteId: string | null | undefined, organizationId: string) {
  if (!siteId) return;
  const site = (await db.select().from(sites).where(eq(sites.id, siteId)).limit(1))[0];
  if (!site || site.canonicalStatus === "merged" || site.organizationId !== organizationId) {
    throw new ApiError("BAD_REQUEST", "Task location must be a canonical location in the program organization", 400);
  }
}

function assertTaskWindow(opensAt?: Date | null, closesAt?: Date | null, dueAt?: Date | null) {
  if (opensAt && closesAt && opensAt >= closesAt) throw new ApiError("BAD_REQUEST", "closesAt must be after opensAt", 400);
  if (opensAt && dueAt && dueAt < opensAt) throw new ApiError("BAD_REQUEST", "dueAt cannot be before opensAt", 400);
}

async function requireTask(actorId: string, taskId: string, permission: string) {
  const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (!task) throw new ApiError("NOT_FOUND", "Task not found", 404);
  if (!(await authorize({ userId: actorId, permission, resource: taskResource(task) })).allowed) {
    throw new ApiError("FORBIDDEN", "Task is outside the assigned scope", 403);
  }
  return task;
}

export async function listTasks(actorId: string, onlyMine = false) {
  const [access, taskRows, assignmentRows] = await Promise.all([
    getAccessContext(actorId),
    taskDescriptionQuery().orderBy(desc(tasks.updatedAt)),
    db.select().from(taskAssignments).where(onlyMine ? eq(taskAssignments.assigneeId, actorId) : eq(taskAssignments.assigneeId, actorId)),
  ]);
  const assignmentByTask = new Map(assignmentRows.map((assignment) => [assignment.taskId, assignment]));
  return taskRows
    .filter((row) => assignmentByTask.has(row.task.id) || (!onlyMine && evaluateAuthorization(access, "tasks.view", taskResource(row.task)).allowed))
    .map((row) => ({ ...describedTask(row), myAssignment: assignmentByTask.get(row.task.id) ?? null }));
}

export async function getTask(actorId: string, taskId: string) {
  const row = (await taskDescriptionQuery().where(eq(tasks.id, taskId)).limit(1))[0];
  if (!row) throw new ApiError("NOT_FOUND", "Task not found", 404);
  const task = row.task;
  const myAssignment = (await db.select().from(taskAssignments).where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.assigneeId, actorId))).limit(1))[0];
  const canViewAllAssignments = (await authorize({ userId: actorId, permission: "tasks.view", resource: taskResource(task) })).allowed;
  if (!myAssignment && !canViewAllAssignments) {
    throw new ApiError("FORBIDDEN", "Task is outside the assigned scope", 403);
  }
  const assignments = await db.select({
    id: taskAssignments.id,
    assigneeId: taskAssignments.assigneeId,
    assigneeName: users.name,
    assigneeEmail: users.email,
    status: taskAssignments.status,
    assignedAt: taskAssignments.assignedAt,
    startedAt: taskAssignments.startedAt,
    completedAt: taskAssignments.completedAt,
    declinedAt: taskAssignments.declinedAt,
    declineReason: taskAssignments.declineReason,
    recordId: taskAssignments.recordId,
  }).from(taskAssignments).innerJoin(users, eq(taskAssignments.assigneeId, users.id)).where(canViewAllAssignments
    ? eq(taskAssignments.taskId, taskId)
    : and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.assigneeId, actorId)));
  return { task: describedTask(row), myAssignment: myAssignment ?? null, assignments };
}

export async function createTask(actorId: string, input: TaskCreate, requestId?: string) {
  const [program, form] = await Promise.all([
    db.select().from(programs).where(eq(programs.id, input.programId)).limit(1).then((rows) => rows[0]),
    db.select({ version: templateVersions, template: templates }).from(templateVersions)
      .innerJoin(templates, eq(templateVersions.templateId, templates.id))
      .where(eq(templateVersions.id, input.templateVersionId)).limit(1).then((rows) => rows[0]),
  ]);
  if (!program || program.status !== "active") throw new ApiError("NOT_FOUND", "Active program not found", 404);
  if (!form || form.version.status !== "published") throw new ApiError("BAD_REQUEST", "Task requires a published form version", 400);
  if (form.template.organizationId && form.template.organizationId !== program.organizationId) throw new ApiError("BAD_REQUEST", "Task form belongs to another organization", 400);
  await requireActiveRegistryItem("task_type", input.taskTypeKey, program.organizationId);
  await assertSiteInOrganization(input.siteId, program.organizationId);
  assertTaskWindow(input.opensAt ? new Date(input.opensAt) : null, input.closesAt ? new Date(input.closesAt) : null, input.dueAt ? new Date(input.dueAt) : null);
  if (!(await authorize({ userId: actorId, permission: "tasks.create", resource: { organizationId: program.organizationId, programId: program.id } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot create a task in this program", 403);
  }
  return db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values({
      ...input,
      organizationId: program.organizationId,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      status: "draft",
      createdById: actorId,
    }).returning();
    await audit({ actorId, action: "task.created", entityType: "task", entityId: task.id, afterState: task, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return task;
  });
}

export async function updateTask(actorId: string, taskId: string, input: TaskUpdate, requestId?: string) {
  const before = await requireTask(actorId, taskId, "tasks.edit");
  if (input.status && input.status !== before.status && !TASK_TRANSITIONS[before.status]?.includes(input.status)) {
    throw new ApiError("INVALID_TRANSITION", `Cannot transition task from ${before.status} to ${input.status}`, 409);
  }
  await assertSiteInOrganization(input.siteId === undefined ? before.siteId : input.siteId, before.organizationId);
  const opensAt = input.opensAt === undefined ? before.opensAt : input.opensAt ? new Date(input.opensAt) : null;
  const closesAt = input.closesAt === undefined ? before.closesAt : input.closesAt ? new Date(input.closesAt) : null;
  const dueAt = input.dueAt === undefined ? before.dueAt : input.dueAt ? new Date(input.dueAt) : null;
  assertTaskWindow(opensAt, closesAt, dueAt);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(tasks).set({
      ...input,
      dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
      opensAt: input.opensAt === undefined ? undefined : input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt === undefined ? undefined : input.closesAt ? new Date(input.closesAt) : null,
      updatedAt: new Date(),
    }).where(and(eq(tasks.id, taskId), eq(tasks.status, before.status))).returning();
    if (!after) throw new ApiError("CONFLICT", "Task changed concurrently", 409);
    await audit({ actorId, action: "task.updated", entityType: "task", entityId: taskId, beforeState: before, afterState: after, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function assignTask(actorId: string, taskId: string, input: AssignInput, requestId?: string) {
  const task = await requireTask(actorId, taskId, "tasks.assign");
  const activeMembers = await db.select({ userId: programMemberships.userId })
    .from(programMemberships)
    .innerJoin(users, eq(programMemberships.userId, users.id))
    .where(and(
      eq(programMemberships.programId, task.programId),
      eq(programMemberships.status, "active"),
      eq(users.status, "active"),
      inArray(programMemberships.userId, input.assigneeIds),
    ));
  const memberIds = new Set(activeMembers.map((member) => member.userId));
  const invalidIds = input.assigneeIds.filter((id) => !memberIds.has(id));
  if (invalidIds.length) throw new ApiError("BAD_REQUEST", "Every assignee must be an active program member", 400, { invalidIds });
  return db.transaction(async (tx) => {
    const inserted = [];
    for (const assigneeId of [...new Set(input.assigneeIds)].sort()) {
      const [assignment] = await tx.insert(taskAssignments).values({
        taskId,
        assigneeId,
        assignedById: actorId,
        notes: input.notes,
      }).onConflictDoNothing().returning();
      if (!assignment) continue;
      inserted.push(assignment);
      await tx.insert(notifications).values({
        userId: assigneeId,
        kindKey: "task_assigned",
        title: task.title,
        body: task.instructions ?? "A task was assigned to you.",
        entityType: "task",
        entityId: task.id,
        metadata: { assignmentId: assignment.id, dueAt: task.dueAt },
      });
      await audit({ actorId, action: "task.assigned", entityType: "task_assignment", entityId: assignment.id, targetUserId: assigneeId, afterState: assignment, metadata: { requestId, taskId } }, (values) => tx.insert(auditEvents).values(values));
    }
    return inserted;
  });
}

export async function transitionAssignment(actorId: string, taskId: string, assignmentId: string, input: AssignmentTransition, requestId?: string) {
  const [task, before] = await Promise.all([
    db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1).then((rows) => rows[0]),
    db.select().from(taskAssignments).where(and(eq(taskAssignments.id, assignmentId), eq(taskAssignments.taskId, taskId))).limit(1).then((rows) => rows[0]),
  ]);
  if (!task || !before) throw new ApiError("NOT_FOUND", "Task assignment not found", 404);
  const manager = (await authorize({ userId: actorId, permission: "tasks.edit", resource: taskResource(task) })).allowed;
  if (!manager && before.assigneeId !== actorId) throw new ApiError("FORBIDDEN", "Cannot update this assignment", 403);
  if (["in_progress", "completed"].includes(input.status) && task.status !== "open") {
    throw new ApiError("INVALID_TRANSITION", "An assignment can be worked only while its task is open", 409);
  }
  const now = new Date();
  if (input.status === "in_progress" && ((task.opensAt && task.opensAt > now) || (task.closesAt && task.closesAt <= now))) {
    throw new ApiError("INVALID_TRANSITION", "The task is not currently available", 409);
  }
  if (!ASSIGNMENT_TRANSITIONS[before.status]?.includes(input.status)) {
    throw new ApiError("INVALID_TRANSITION", `Cannot transition assignment from ${before.status} to ${input.status}`, 409);
  }
  if (input.recordId) {
    const record = (await db.select().from(records).where(eq(records.id, input.recordId)).limit(1))[0];
    if (!record || record.taskId !== task.id || record.taskAssignmentId !== before.id || record.createdById !== before.assigneeId) {
      throw new ApiError("BAD_REQUEST", "recordId does not belong to this task assignment", 400);
    }
  }
  if (input.status === "completed" && !(input.recordId ?? before.recordId)) {
    throw new ApiError("BAD_REQUEST", "A collection assignment requires its submitted record before completion", 400);
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(taskAssignments).set({
      status: input.status,
      recordId: input.recordId,
      notes: input.notes,
      startedAt: input.status === "in_progress" ? now : before.startedAt,
      completedAt: input.status === "completed" ? now : before.completedAt,
      declinedAt: input.status === "declined" ? now : before.declinedAt,
      declineReason: input.status === "declined" ? input.declineReason?.trim() : before.declineReason,
      cancelledAt: input.status === "cancelled" ? now : before.cancelledAt,
      updatedAt: now,
    }).where(and(eq(taskAssignments.id, assignmentId), eq(taskAssignments.status, before.status))).returning();
    if (!after) throw new ApiError("CONFLICT", "Assignment changed concurrently", 409);
    await audit({ actorId, action: `task.assignment_${input.status}`, entityType: "task_assignment", entityId: assignmentId, targetUserId: before.assigneeId, beforeState: before, afterState: after, metadata: { requestId, taskId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function transitionMyTask(actorId: string, taskId: string, status: "in_progress" | "completed", requestId?: string) {
  const assignment = (await db.select().from(taskAssignments).where(and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.assigneeId, actorId))).limit(1))[0];
  if (!assignment) throw new ApiError("NOT_FOUND", "Assigned task not found", 404);
  if (assignment.status === status) {
    if (status === "completed" && !assignment.recordId) throw new ApiError("CONFLICT", "Completed assignment is missing its submitted record", 409);
    return assignment;
  }
  return transitionAssignment(actorId, taskId, assignment.id, { status }, requestId);
}

export async function closeTask(actorId: string, taskId: string, requestId?: string) {
  return updateTask(actorId, taskId, { status: "closed" }, requestId);
}

export async function getTaskPackage(actorId: string, taskId: string) {
  const bundle = await getTask(actorId, taskId);
  const form = await getTemplateVersionBundle(bundle.task.templateVersionId);
  if (!form || form.version.status !== "published") throw new ApiError("CONFLICT", "Assigned form version is unavailable", 409);
  const configuration = await db.select({
    registryKey: configRegistries.key,
    itemId: configRegistryItems.id,
    itemKey: configRegistryItems.key,
    version: configRegistryItems.version,
    labelEn: configRegistryItems.labelEn,
    labelZh: configRegistryItems.labelZh,
    helpTextEn: configRegistryItems.helpTextEn,
    helpTextZh: configRegistryItems.helpTextZh,
    sortOrder: configRegistryItems.sortOrder,
    metadata: configRegistryItems.metadata,
  }).from(configRegistryItems).innerJoin(configRegistries, eq(configRegistryItems.registryId, configRegistries.id)).where(and(
    eq(configRegistries.status, "active"),
    eq(configRegistryItems.status, "active"),
    or(isNull(configRegistryItems.organizationId), eq(configRegistryItems.organizationId, bundle.task.organizationId)),
  ));
  const payload = {
    task: bundle.task,
    assignment: bundle.myAssignment,
    form,
    configuration,
    syncContract: { localVersionRequired: true, idempotencyKeyRequired: true, conflictPolicy: "server_version_compare" },
  };
  return { ...payload, packageVersion: contentHash(payload) };
}
