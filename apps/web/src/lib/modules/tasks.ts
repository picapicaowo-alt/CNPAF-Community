import { and, desc, eq, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import {
  auditEvents,
  configRegistries,
  configRegistryItems,
  programMemberships,
  programs,
  records,
  recordFieldAnswers,
  recordVersions,
  reviewDecisions,
  sites,
  taskAssignments,
  taskRecurrenceOccurrences,
  taskRecurrenceSeries,
  tasks,
  templates,
  templateVersions,
  users,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type { taskAssignmentBodySchema, taskAssignmentTransitionBodySchema, taskBulkActionBodySchema, taskCreateBodySchema, taskNotificationBodySchema, taskRecurrenceStatusBodySchema, taskUpdateBodySchema } from "@cnpaf/shared";
import { db } from "../db";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize, evaluateAuthorization, getAccessContext } from "../authorization";
import { getTemplateVersionBundle } from "../templates";
import { contentHash } from "../crypto";
import { requireActiveRegistryItem } from "../registries";
import { nextTaskOccurrence } from "../task-recurrence";
import { queueTaskNotification } from "./notification-delivery";

type TaskCreate = z.infer<typeof taskCreateBodySchema>;
type TaskUpdate = z.infer<typeof taskUpdateBodySchema>;
type AssignInput = z.infer<typeof taskAssignmentBodySchema>;
type AssignmentTransition = z.infer<typeof taskAssignmentTransitionBodySchema>;
type TaskBulkAction = z.infer<typeof taskBulkActionBodySchema>;
type TaskNotificationInput = z.infer<typeof taskNotificationBodySchema>;
type TaskRecurrenceStatusInput = z.infer<typeof taskRecurrenceStatusBodySchema>;

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
  declined: ["assigned"],
  cancelled: ["assigned"],
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
  const assignmentQuery = db.select({
    id: taskAssignments.id,
    taskId: taskAssignments.taskId,
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
  }).from(taskAssignments).innerJoin(users, eq(taskAssignments.assigneeId, users.id));
  const [access, taskRows, assignmentRows] = await Promise.all([
    getAccessContext(actorId),
    taskDescriptionQuery().orderBy(desc(tasks.updatedAt)),
    onlyMine
      ? assignmentQuery.where(eq(taskAssignments.assigneeId, actorId))
      : assignmentQuery,
  ]);
  const assignmentsByTask = assignmentRows.reduce((groups, assignment) => {
    const group = groups.get(assignment.taskId) ?? [];
    group.push(assignment);
    groups.set(assignment.taskId, group);
    return groups;
  }, new Map<string, typeof assignmentRows>());
  return taskRows
    .filter((row) =>
      onlyMine
        ? assignmentsByTask.has(row.task.id)
        : evaluateAuthorization(
            access,
            "tasks.view",
            taskResource(row.task),
          ).allowed,
    )
    .map((row) => {
      const assignments = assignmentsByTask.get(row.task.id) ?? [];
      return {
        ...describedTask(row),
        assignments,
        myAssignment:
          assignments.find((assignment) => assignment.assigneeId === actorId) ??
          null,
      };
    });
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
  const [assignments, recurrence] = await Promise.all([db.select({
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
    recordStatus: records.recordStatus,
    recordReviewStatus: records.reviewStatus,
  }).from(taskAssignments)
    .innerJoin(users, eq(taskAssignments.assigneeId, users.id))
    .leftJoin(records, eq(taskAssignments.recordId, records.id))
    .where(canViewAllAssignments
    ? eq(taskAssignments.taskId, taskId)
    : and(eq(taskAssignments.taskId, taskId), eq(taskAssignments.assigneeId, actorId))),
  db.select({
    id: taskRecurrenceSeries.id,
    frequency: taskRecurrenceSeries.frequency,
    interval: taskRecurrenceSeries.interval,
    timezone: taskRecurrenceSeries.timezone,
    status: taskRecurrenceSeries.status,
    nextOccurrenceAt: taskRecurrenceSeries.nextOccurrenceAt,
    endsAt: taskRecurrenceSeries.endsAt,
    generatedCount: taskRecurrenceSeries.generatedCount,
    scheduledFor: taskRecurrenceOccurrences.scheduledFor,
    templateTaskId: taskRecurrenceSeries.templateTaskId,
  }).from(taskRecurrenceOccurrences)
    .innerJoin(taskRecurrenceSeries, eq(taskRecurrenceOccurrences.seriesId, taskRecurrenceSeries.id))
    .where(eq(taskRecurrenceOccurrences.taskId, taskId))
    .limit(1)
    .then((rows) => rows[0] ?? null),
  ]);
  return { task: describedTask(row), myAssignment: myAssignment ?? null, assignments, recurrence };
}

export async function createTask(actorId: string, input: TaskCreate, requestId?: string) {
  const [program, form] = await Promise.all([
    db.select().from(programs).where(eq(programs.id, input.programId)).limit(1).then((rows) => rows[0]),
    db.select({ version: templateVersions, template: templates }).from(templateVersions)
      .innerJoin(templates, eq(templateVersions.templateId, templates.id))
      .where(eq(templateVersions.id, input.templateVersionId)).limit(1).then((rows) => rows[0]),
  ]);
  if (!program || program.status !== "active") throw new ApiError("NOT_FOUND", "Active program not found", 404);
  if (
    !form ||
    form.version.status !== "published" ||
    form.template.currentPublishedVersionId !== form.version.id
  )
    throw new ApiError(
      "BAD_REQUEST",
      "Task requires the form's current published version",
      400,
    );
  if (form.template.organizationId && form.template.organizationId !== program.organizationId) throw new ApiError("BAD_REQUEST", "Task form belongs to another organization", 400);
  await Promise.all([
    requireActiveRegistryItem("task_type", input.taskTypeKey, program.organizationId),
    input.priority
      ? requireActiveRegistryItem(
          "priority_level",
          input.priority,
          program.organizationId,
        )
      : Promise.resolve(),
  ]);
  await assertSiteInOrganization(input.siteId, program.organizationId);
  assertTaskWindow(input.opensAt ? new Date(input.opensAt) : null, input.closesAt ? new Date(input.closesAt) : null, input.dueAt ? new Date(input.dueAt) : null);
  if (!(await authorize({ userId: actorId, permission: "tasks.create", resource: { organizationId: program.organizationId, programId: program.id } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot create a task in this program", 403);
  }
  if (!(await authorize({ userId: actorId, permission: "tasks.assign", resource: { organizationId: program.organizationId, programId: program.id } })).allowed) {
    throw new ApiError("FORBIDDEN", "Cannot assign collectors in this program", 403);
  }
  const activeMembers = await db.select({ userId: programMemberships.userId })
    .from(programMemberships)
    .innerJoin(users, eq(programMemberships.userId, users.id))
    .where(and(
      eq(programMemberships.programId, program.id),
      eq(programMemberships.status, "active"),
      eq(users.status, "active"),
      inArray(programMemberships.userId, input.assigneeIds),
    ));
  const memberIds = new Set(activeMembers.map((membership) => membership.userId));
  const invalidIds = input.assigneeIds.filter((id) => !memberIds.has(id));
  if (invalidIds.length)
    throw new ApiError("BAD_REQUEST", "Every assignee must be an active program member", 400, { invalidIds });
  return db.transaction(async (tx) => {
    const { assigneeIds, status, recurrence, ...taskInput } = input;
    const [task] = await tx.insert(tasks).values({
      ...taskInput,
      organizationId: program.organizationId,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      opensAt: input.opensAt ? new Date(input.opensAt) : null,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      status,
      createdById: actorId,
    }).returning();
    for (const assigneeId of [...new Set(assigneeIds)].sort()) {
      const [assignment] = await tx.insert(taskAssignments).values({
        taskId: task.id,
        assigneeId,
        assignedById: actorId,
      }).returning();
      if (status === "open") {
        await queueTaskNotification(tx, {
          userId: assigneeId,
          kindKey: "task_assigned",
          title: task.title,
          body: task.instructions ?? "A task was assigned to you.",
          taskId: task.id,
          metadata: { assignmentId: assignment.id, dueAt: task.dueAt },
        });
      }
      await audit({
        actorId,
        action: "task.assigned",
        entityType: "task_assignment",
        entityId: assignment.id,
        targetUserId: assigneeId,
        afterState: assignment,
        metadata: { requestId, taskId: task.id },
      }, (values) => tx.insert(auditEvents).values(values));
    }
    if (recurrence && task.dueAt) {
      const nextOccurrenceAt = nextTaskOccurrence(
        task.dueAt,
        recurrence.frequency,
        recurrence.interval,
        recurrence.timezone,
      );
      const endsAt = recurrence.endsAt ? new Date(recurrence.endsAt) : null;
      const [series] = await tx.insert(taskRecurrenceSeries).values({
        templateTaskId: task.id,
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        timezone: recurrence.timezone,
        nextOccurrenceAt,
        endsAt,
        status: endsAt && nextOccurrenceAt > endsAt
          ? "ended"
          : status === "open" ? "active" : "paused",
        createdById: actorId,
      }).returning();
      await tx.insert(taskRecurrenceOccurrences).values({
        seriesId: series.id,
        taskId: task.id,
        scheduledFor: task.dueAt,
      });
      await audit({
        actorId,
        action: "task.recurrence_created",
        entityType: "task_recurrence_series",
        entityId: series.id,
        afterState: series,
        metadata: { requestId, taskId: task.id },
      }, (values) => tx.insert(auditEvents).values(values));
    }
    await audit({ actorId, action: "task.created", entityType: "task", entityId: task.id, afterState: task, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return task;
  });
}

export async function updateTask(actorId: string, taskId: string, input: TaskUpdate, requestId?: string) {
  const before = await requireTask(actorId, taskId, "tasks.edit");
  if (input.status && input.status !== before.status && !TASK_TRANSITIONS[before.status]?.includes(input.status)) {
    throw new ApiError("INVALID_TRANSITION", `Cannot transition task from ${before.status} to ${input.status}`, 409);
  }
  if (
    input.taskTypeKey !== undefined &&
    input.taskTypeKey !== before.taskTypeKey
  )
    await requireActiveRegistryItem("task_type", input.taskTypeKey, before.organizationId);
  if (input.priority !== undefined && input.priority !== before.priority && input.priority) {
    await requireActiveRegistryItem(
      "priority_level",
      input.priority,
      before.organizationId,
    );
  }
  if (
    input.templateVersionId !== undefined &&
    input.templateVersionId !== before.templateVersionId
  ) {
    if (!["draft", "open"].includes(before.status))
      throw new ApiError(
        "INVALID_TRANSITION",
        "The collection form can only be changed on a draft or open task",
        409,
      );
    const startedAssignments = await db
      .select({ id: taskAssignments.id })
      .from(taskAssignments)
      .where(
        and(
          eq(taskAssignments.taskId, taskId),
          or(
            inArray(taskAssignments.status, ["in_progress", "completed"]),
            isNotNull(taskAssignments.recordId),
          ),
        ),
      )
      .limit(1);
    if (startedAssignments.length)
      throw new ApiError(
        "CONFLICT",
        "The collection form is locked because collection has already started",
        409,
      );
    const form = await db
      .select({ version: templateVersions, template: templates })
      .from(templateVersions)
      .innerJoin(templates, eq(templateVersions.templateId, templates.id))
      .where(eq(templateVersions.id, input.templateVersionId))
      .limit(1)
      .then((rows) => rows[0]);
    if (
      !form ||
      form.version.status !== "published" ||
      form.template.currentPublishedVersionId !== form.version.id
    )
      throw new ApiError(
        "BAD_REQUEST",
        "Task requires the form's current published version",
        400,
      );
    if (
      form.template.organizationId &&
      form.template.organizationId !== before.organizationId
    )
      throw new ApiError(
        "BAD_REQUEST",
        "Task form belongs to another organization",
        400,
      );
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
    if (before.status === "draft" && after.status === "open") {
      await tx.update(taskRecurrenceSeries).set({
        status: "active",
        updatedAt: new Date(),
      }).where(and(
        eq(taskRecurrenceSeries.templateTaskId, taskId),
        eq(taskRecurrenceSeries.status, "paused"),
        or(isNull(taskRecurrenceSeries.endsAt), lte(taskRecurrenceSeries.nextOccurrenceAt, taskRecurrenceSeries.endsAt)),
      ));
      const assignments = await tx.select().from(taskAssignments).where(
        and(
          eq(taskAssignments.taskId, taskId),
          inArray(taskAssignments.status, ["assigned", "in_progress"]),
        ),
      );
      for (const assignment of assignments) {
        await queueTaskNotification(tx, {
          userId: assignment.assigneeId,
          kindKey: "task_assigned",
          title: after.title,
          body: after.instructions ?? "A task was assigned to you.",
          taskId: after.id,
          metadata: { assignmentId: assignment.id, dueAt: after.dueAt },
        });
      }
    }
    await audit({ actorId, action: "task.updated", entityType: "task", entityId: taskId, beforeState: before, afterState: after, metadata: { requestId } }, (values) => tx.insert(auditEvents).values(values));
    return after;
  });
}

export async function assignTask(actorId: string, taskId: string, input: AssignInput, requestId?: string) {
  const task = await requireTask(actorId, taskId, "tasks.assign");
  if (!["draft", "open"].includes(task.status))
    throw new ApiError("INVALID_TRANSITION", "Assignees can only be added to draft or open tasks", 409);
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
      if (task.status === "open") {
        await queueTaskNotification(tx, {
          userId: assigneeId,
          kindKey: "task_assigned",
          title: task.title,
          body: task.instructions ?? "A task was assigned to you.",
          taskId: task.id,
          metadata: { assignmentId: assignment.id, dueAt: task.dueAt },
        });
      }
      await audit({ actorId, action: "task.assigned", entityType: "task_assignment", entityId: assignment.id, targetUserId: assigneeId, afterState: assignment, metadata: { requestId, taskId } }, (values) => tx.insert(auditEvents).values(values));
    }
    return inserted;
  });
}

export async function bulkMutateTasks(
  actorId: string,
  input: TaskBulkAction,
  requestId?: string,
) {
  const taskIds = [...new Set(input.taskIds)];
  const selectedTasks = await db
    .select()
    .from(tasks)
    .where(inArray(tasks.id, taskIds));
  if (selectedTasks.length !== taskIds.length)
    throw new ApiError("NOT_FOUND", "One or more tasks were not found", 404);
  const permission = input.action === "assign" || input.action === "remind"
    ? "tasks.assign"
    : "tasks.edit";
  const decisions = await Promise.all(
    selectedTasks.map((task) =>
      authorize({ userId: actorId, permission, resource: taskResource(task) }),
    ),
  );
  if (decisions.some((decision) => !decision.allowed))
    throw new ApiError(
      "FORBIDDEN",
      "One or more tasks are outside the assigned scope",
      403,
    );

  if (input.action === "assign") {
    const invalidStatus = selectedTasks.find(
      (task) => !["draft", "open"].includes(task.status),
    );
    if (invalidStatus)
      throw new ApiError(
        "INVALID_TRANSITION",
        `Task ${invalidStatus.title} cannot receive assignees in ${invalidStatus.status} status`,
        409,
      );
    const assigneeIds = [...new Set(input.assigneeIds)];
    const programIds = [...new Set(selectedTasks.map((task) => task.programId))];
    const memberships = await db
      .select({ programId: programMemberships.programId, userId: programMemberships.userId })
      .from(programMemberships)
      .innerJoin(users, eq(programMemberships.userId, users.id))
      .where(
        and(
          inArray(programMemberships.programId, programIds),
          inArray(programMemberships.userId, assigneeIds),
          eq(programMemberships.status, "active"),
          eq(users.status, "active"),
        ),
      );
    const activeMemberships = new Set(
      memberships.map((membership) =>
        `${membership.programId}:${membership.userId}`,
      ),
    );
    const invalid = selectedTasks.flatMap((task) =>
      assigneeIds
        .filter(
          (assigneeId) =>
            !activeMemberships.has(`${task.programId}:${assigneeId}`),
        )
        .map((assigneeId) => ({ taskId: task.id, assigneeId })),
    );
    if (invalid.length)
      throw new ApiError(
        "BAD_REQUEST",
        "Every assignee must be an active member of every selected task program",
        400,
        { invalid },
      );
    return db.transaction(async (tx) => {
      let assignmentsCreated = 0;
      for (const task of selectedTasks) {
        for (const assigneeId of assigneeIds) {
          const [assignment] = await tx
            .insert(taskAssignments)
            .values({
              taskId: task.id,
              assigneeId,
              assignedById: actorId,
              notes: input.notes,
            })
            .onConflictDoNothing()
            .returning();
          if (!assignment) continue;
          assignmentsCreated += 1;
          if (task.status === "open") {
            await queueTaskNotification(tx, {
              userId: assigneeId,
              kindKey: "task_assigned",
              title: task.title,
              body: task.instructions ?? "A task was assigned to you.",
              taskId: task.id,
              metadata: { assignmentId: assignment.id, dueAt: task.dueAt },
            });
          }
          await audit(
            {
              actorId,
              action: "task.assigned",
              entityType: "task_assignment",
              entityId: assignment.id,
              targetUserId: assigneeId,
              afterState: assignment,
              metadata: { requestId, taskId: task.id, bulk: true },
            },
            (values) => tx.insert(auditEvents).values(values),
          );
        }
      }
      return { action: input.action, assignmentsCreated, taskCount: selectedTasks.length };
    });
  }

  if (input.action === "remind") {
    const invalidStatus = selectedTasks.find((task) => task.status !== "open");
    if (invalidStatus)
      throw new ApiError(
        "INVALID_TRANSITION",
        `Task ${invalidStatus.title} must be open before sending reminders`,
        409,
      );
    const assignments = await db
      .select()
      .from(taskAssignments)
      .where(
        and(
          inArray(taskAssignments.taskId, taskIds),
          inArray(taskAssignments.status, ["assigned", "in_progress"]),
        ),
      );
    const taskById = new Map(selectedTasks.map((task) => [task.id, task]));
    return db.transaction(async (tx) => {
      for (const assignment of assignments) {
        const task = taskById.get(assignment.taskId)!;
        await queueTaskNotification(tx, {
          userId: assignment.assigneeId,
          kindKey: "task_reminder",
          title: task.title,
          body: task.dueAt
            ? `Task due ${task.dueAt.toISOString()}`
            : "This task is still waiting for completion.",
          taskId: task.id,
          metadata: { assignmentId: assignment.id, dueAt: task.dueAt },
        });
      }
      for (const task of selectedTasks)
        await audit(
          {
            actorId,
            action: "task.reminder_sent",
            entityType: "task",
            entityId: task.id,
            metadata: { requestId, bulk: true },
          },
          (values) => tx.insert(auditEvents).values(values),
        );
      return {
        action: input.action,
        notificationsCreated: assignments.length,
        taskCount: selectedTasks.length,
      };
    });
  }

  const targetStatus = {
    open: "open",
    close: "closed",
    archive: "archived",
  }[input.action];
  const invalidTask = selectedTasks.find(
    (task) => !TASK_TRANSITIONS[task.status]?.includes(targetStatus),
  );
  if (invalidTask)
    throw new ApiError(
      "INVALID_TRANSITION",
      `Cannot transition task ${invalidTask.title} from ${invalidTask.status} to ${targetStatus}`,
      409,
    );
  return db.transaction(async (tx) => {
    for (const task of selectedTasks) {
      const [after] = await tx
        .update(tasks)
        .set({ status: targetStatus, updatedAt: new Date() })
        .where(and(eq(tasks.id, task.id), eq(tasks.status, task.status)))
        .returning();
      if (!after)
        throw new ApiError("CONFLICT", "Task changed concurrently", 409);
      if (task.status === "draft" && after.status === "open") {
        await tx.update(taskRecurrenceSeries).set({
          status: "active",
          updatedAt: new Date(),
        }).where(and(
          eq(taskRecurrenceSeries.templateTaskId, task.id),
          eq(taskRecurrenceSeries.status, "paused"),
          or(isNull(taskRecurrenceSeries.endsAt), lte(taskRecurrenceSeries.nextOccurrenceAt, taskRecurrenceSeries.endsAt)),
        ));
        const assignments = await tx.select().from(taskAssignments).where(
          and(
            eq(taskAssignments.taskId, task.id),
            inArray(taskAssignments.status, ["assigned", "in_progress"]),
          ),
        );
        for (const assignment of assignments) {
          await queueTaskNotification(tx, {
            userId: assignment.assigneeId,
            kindKey: "task_assigned",
            title: after.title,
            body: after.instructions ?? "A task was assigned to you.",
            taskId: after.id,
            metadata: { assignmentId: assignment.id, dueAt: after.dueAt },
          });
        }
      }
      await audit(
        {
          actorId,
          action: "task.updated",
          entityType: "task",
          entityId: task.id,
          beforeState: task,
          afterState: after,
          metadata: { requestId, bulk: true },
        },
        (values) => tx.insert(auditEvents).values(values),
      );
    }
    return { action: input.action, taskCount: selectedTasks.length };
  });
}

export async function sendTaskNotification(
  actorId: string,
  taskId: string,
  input: TaskNotificationInput,
  requestId?: string,
) {
  const task = await requireTask(actorId, taskId, "tasks.assign");
  if (task.status !== "open") {
    throw new ApiError("INVALID_TRANSITION", "Only open tasks can send notifications", 409);
  }
  const assignments = await db.select().from(taskAssignments).where(
    and(
      eq(taskAssignments.taskId, taskId),
      inArray(taskAssignments.status, ["assigned", "in_progress"]),
      input.assigneeIds?.length
        ? inArray(taskAssignments.assigneeId, [...new Set(input.assigneeIds)])
        : undefined,
    ),
  );
  if (!assignments.length) {
    throw new ApiError("BAD_REQUEST", "No active assignees were selected", 400);
  }
  if (input.assigneeIds?.length) {
    const selected = new Set(assignments.map((assignment) => assignment.assigneeId));
    const invalidIds = [...new Set(input.assigneeIds)].filter((id) => !selected.has(id));
    if (invalidIds.length) {
      throw new ApiError("BAD_REQUEST", "Every selected recipient must have an active assignment", 400, { invalidIds });
    }
  }

  return db.transaction(async (tx) => {
    let emailQueued = 0;
    let emailSkipped = 0;
    for (const assignment of assignments) {
      const queued = await queueTaskNotification(tx, {
        userId: assignment.assigneeId,
        kindKey: "task_reminder",
        title: task.title,
        body: input.message?.trim() || (task.dueAt
          ? `Task due ${task.dueAt.toISOString()}`
          : "This task is still waiting for completion."),
        taskId: task.id,
        metadata: {
          assignmentId: assignment.id,
          dueAt: task.dueAt,
          manual: true,
          sentById: actorId,
        },
      });
      if (queued.emailStatus === "queued") emailQueued += 1;
      if (queued.emailStatus === "skipped") emailSkipped += 1;
    }
    await audit({
      actorId,
      action: "task.notification_sent",
      entityType: "task",
      entityId: task.id,
      metadata: {
        requestId,
        recipientCount: assignments.length,
        emailQueued,
        emailSkipped,
      },
    }, (values) => tx.insert(auditEvents).values(values));
    return {
      notificationsCreated: assignments.length,
      emailQueued,
      emailSkipped,
      emailConfigured: emailQueued + emailSkipped > 0,
    };
  });
}

export async function updateTaskRecurrenceStatus(
  actorId: string,
  taskId: string,
  input: TaskRecurrenceStatusInput,
  requestId?: string,
) {
  await requireTask(actorId, taskId, "tasks.edit");
  const before = await db.select({ series: taskRecurrenceSeries })
    .from(taskRecurrenceOccurrences)
    .innerJoin(taskRecurrenceSeries, eq(taskRecurrenceOccurrences.seriesId, taskRecurrenceSeries.id))
    .where(eq(taskRecurrenceOccurrences.taskId, taskId))
    .limit(1)
    .then((rows) => rows[0]?.series);
  if (!before) throw new ApiError("NOT_FOUND", "Recurring task series not found", 404);
  if (input.status === "active" && before.endsAt && before.nextOccurrenceAt > before.endsAt) {
    throw new ApiError("INVALID_TRANSITION", "This recurring task series has already ended", 409);
  }
  return db.transaction(async (tx) => {
    const [after] = await tx.update(taskRecurrenceSeries).set({
      status: input.status,
      updatedAt: new Date(),
    }).where(and(
      eq(taskRecurrenceSeries.id, before.id),
      eq(taskRecurrenceSeries.status, before.status),
    )).returning();
    if (!after) throw new ApiError("CONFLICT", "Recurring task series changed concurrently", 409);
    await audit({
      actorId,
      action: `task.recurrence_${input.status}`,
      entityType: "task_recurrence_series",
      entityId: after.id,
      beforeState: before,
      afterState: after,
      metadata: { requestId, taskId },
    }, (values) => tx.insert(auditEvents).values(values));
    return after;
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
  if (input.status === "assigned" && !manager)
    throw new ApiError("FORBIDDEN", "Only a task manager can reassign a declined or cancelled assignment", 403);
  if (input.status === "assigned" && !["draft", "open"].includes(task.status))
    throw new ApiError("INVALID_TRANSITION", "A closed task cannot be reassigned", 409);
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
      declinedAt: input.status === "declined" ? now : input.status === "assigned" ? null : before.declinedAt,
      declineReason: input.status === "declined" ? input.declineReason?.trim() : input.status === "assigned" ? null : before.declineReason,
      cancelledAt: input.status === "cancelled" ? now : input.status === "assigned" ? null : before.cancelledAt,
      updatedAt: now,
    }).where(and(eq(taskAssignments.id, assignmentId), eq(taskAssignments.status, before.status))).returning();
    if (!after) throw new ApiError("CONFLICT", "Assignment changed concurrently", 409);
    if (input.status === "assigned" && task.status === "open") {
      await queueTaskNotification(tx, {
        userId: before.assigneeId,
        kindKey: "task_reassigned",
        title: task.title,
        body: task.instructions ?? "A task was reassigned to you.",
        taskId: task.id,
        metadata: { assignmentId: after.id, dueAt: task.dueAt },
      });
    }
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
  const [configuration, correctionRecord] = await Promise.all([db.select({
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
  )), bundle.myAssignment?.recordId
    ? db.select().from(records).where(and(
        eq(records.id, bundle.myAssignment.recordId),
        eq(records.createdById, actorId),
        eq(records.reviewStatus, "needs_completion"),
      )).limit(1).then((rows) => rows[0])
    : Promise.resolve(undefined)]);
  const correctionVersion = correctionRecord?.headVersionId
    ? await db.select().from(recordVersions).where(eq(recordVersions.id, correctionRecord.headVersionId)).limit(1).then((rows) => rows[0])
    : undefined;
  const correctionDecision = correctionRecord
    ? await db.select({
        annotation: reviewDecisions.annotation,
        ids: reviewDecisions.correctionFieldIds,
      }).from(reviewDecisions).where(and(
        eq(reviewDecisions.recordId, correctionRecord.id),
        eq(reviewDecisions.action, "needs_completion"),
      )).orderBy(desc(reviewDecisions.createdAt)).limit(1).then((rows) => rows[0])
    : undefined;
  const correction = correctionRecord && correctionVersion
    ? {
        record: {
          id: correctionRecord.id,
          clientRecordId: correctionRecord.clientRecordId,
          sourceKind: correctionRecord.sourceKind,
        },
        version: {
          id: correctionVersion.id,
          localVersion: correctionVersion.localVersion,
          occurredAt: correctionVersion.occurredAt,
          piiAttestation: correctionVersion.piiAttestation,
        },
        fieldAnswers: await db.select({
          templateFieldId: recordFieldAnswers.templateFieldId,
          value: recordFieldAnswers.value,
          missingReasonKey: recordFieldAnswers.missingReasonKey,
          customText: recordFieldAnswers.customText,
        }).from(recordFieldAnswers).where(eq(recordFieldAnswers.recordVersionId, correctionVersion.id)),
        notes: correctionDecision?.annotation
          ? [{ body: correctionDecision.annotation }]
          : [],
        correctionFieldIds:
          (correctionDecision?.ids as string[] | undefined) ?? [],
      }
    : null;
  const payload = {
    task: bundle.task,
    assignment: bundle.myAssignment,
    form,
    configuration,
    correction,
    syncContract: { localVersionRequired: true, idempotencyKeyRequired: true, conflictPolicy: "server_version_compare" },
  };
  return { ...payload, packageVersion: contentHash(payload) };
}
