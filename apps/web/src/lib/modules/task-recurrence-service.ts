import { and, asc, eq, lte } from "drizzle-orm";
import {
  auditEvents,
  programMemberships,
  taskAssignments,
  taskRecurrenceOccurrences,
  taskRecurrenceSeries,
  tasks,
  users,
} from "@cnpaf/db/schema";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { nextTaskOccurrence, type TaskRecurrenceFrequency } from "@/lib/task-recurrence";
import { queueTaskNotification } from "./notification-delivery";

export async function materializeRecurringTasks(through: Date, limit = 100) {
  let generated = 0;
  const taskIds: string[] = [];
  while (generated < limit) {
    const candidate = await db.select({ id: taskRecurrenceSeries.id })
      .from(taskRecurrenceSeries)
      .where(and(
        eq(taskRecurrenceSeries.status, "active"),
        lte(taskRecurrenceSeries.nextOccurrenceAt, through),
      ))
      .orderBy(asc(taskRecurrenceSeries.nextOccurrenceAt))
      .limit(1)
      .then((rows) => rows[0]);
    if (!candidate) break;
    const taskId = await materializeNextOccurrence(candidate.id, through);
    if (!taskId) continue;
    generated += 1;
    taskIds.push(taskId);
  }
  return { generated, taskIds, limited: generated === limit };
}

async function materializeNextOccurrence(seriesId: string, through: Date) {
  return db.transaction(async (tx) => {
    const series = await tx.select().from(taskRecurrenceSeries)
      .where(eq(taskRecurrenceSeries.id, seriesId))
      .limit(1)
      .for("update")
      .then((rows) => rows[0]);
    if (!series || series.status !== "active" || series.nextOccurrenceAt > through) return null;
    if (series.endsAt && series.nextOccurrenceAt > series.endsAt) {
      await tx.update(taskRecurrenceSeries).set({ status: "ended", updatedAt: new Date() })
        .where(eq(taskRecurrenceSeries.id, series.id));
      return null;
    }
    const template = await tx.select().from(tasks)
      .where(eq(tasks.id, series.templateTaskId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!template) throw new Error("Recurring task template was not found");
    const assignees = await tx.select({ userId: taskAssignments.assigneeId })
      .from(taskAssignments)
      .innerJoin(users, and(eq(users.id, taskAssignments.assigneeId), eq(users.status, "active")))
      .innerJoin(programMemberships, and(
        eq(programMemberships.userId, taskAssignments.assigneeId),
        eq(programMemberships.programId, template.programId),
        eq(programMemberships.status, "active"),
      ))
      .where(eq(taskAssignments.taskId, template.id));
    const occurrenceAt = series.nextOccurrenceAt;
    const closesAt = template.closesAt && template.dueAt
      ? new Date(occurrenceAt.getTime() + (template.closesAt.getTime() - template.dueAt.getTime()))
      : null;
    const [task] = await tx.insert(tasks).values({
      programId: template.programId,
      organizationId: template.organizationId,
      templateVersionId: template.templateVersionId,
      siteId: template.siteId,
      taskTypeKey: template.taskTypeKey,
      title: template.title,
      instructions: template.instructions,
      status: "open",
      priority: template.priority,
      dueAt: occurrenceAt,
      opensAt: new Date(),
      closesAt,
      configuration: template.configuration,
      createdById: series.createdById,
    }).returning();
    await tx.insert(taskRecurrenceOccurrences).values({
      seriesId: series.id,
      taskId: task.id,
      scheduledFor: occurrenceAt,
    });
    for (const assigneeId of [...new Set(assignees.map((assignee) => assignee.userId))].sort()) {
      const [assignment] = await tx.insert(taskAssignments).values({
        taskId: task.id,
        assigneeId,
        assignedById: series.createdById,
      }).returning();
      await queueTaskNotification(tx, {
        userId: assigneeId,
        kindKey: "task_assigned",
        title: task.title,
        body: task.instructions ?? "A recurring task was assigned to you.",
        taskId: task.id,
        metadata: {
          assignmentId: assignment.id,
          dueAt: task.dueAt,
          recurrenceSeriesId: series.id,
        },
      });
    }
    const nextOccurrenceAt = nextTaskOccurrence(
      occurrenceAt,
      series.frequency as TaskRecurrenceFrequency,
      series.interval,
      series.timezone,
    );
    const status = series.endsAt && nextOccurrenceAt > series.endsAt ? "ended" : "active";
    await tx.update(taskRecurrenceSeries).set({
      nextOccurrenceAt,
      status,
      generatedCount: series.generatedCount + 1,
      updatedAt: new Date(),
    }).where(eq(taskRecurrenceSeries.id, series.id));
    await audit({
      actorId: series.createdById,
      action: "task.recurrence_generated",
      entityType: "task",
      entityId: task.id,
      afterState: task,
      metadata: { recurrenceSeriesId: series.id, occurrenceAt },
    }, (values) => tx.insert(auditEvents).values(values));
    return task.id;
  });
}
