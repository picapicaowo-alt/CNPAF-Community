import { apiFetch } from "@/lib/api-client";
import type { TaskAssignment, TaskRecurrence, TaskSummary } from "@/lib/task-ui";

export type TaskUpdate = Partial<
  Pick<
    TaskSummary,
    | "siteId"
    | "templateVersionId"
    | "taskTypeKey"
    | "title"
    | "instructions"
    | "priority"
    | "dueAt"
    | "opensAt"
    | "closesAt"
    | "configuration"
    | "status"
  >
>;

export function updateTask(taskId: string, input: TaskUpdate) {
  return apiFetch<{ task: TaskSummary }>(`/api/v1/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addTaskAssignees(taskId: string, assigneeIds: string[]) {
  return apiFetch<{ assignments: TaskAssignment[] }>(
    `/api/v1/tasks/${taskId}/assignments`,
    {
      method: "POST",
      body: JSON.stringify({ assigneeIds }),
    },
  );
}

export function transitionTaskAssignment(
  taskId: string,
  assignmentId: string,
  status: "assigned" | "cancelled",
) {
  return apiFetch<{ assignment: TaskAssignment }>(
    `/api/v1/tasks/${taskId}/assignments/${assignmentId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}

export function sendTaskNotification(
  taskId: string,
  input: { assigneeIds?: string[]; message?: string | null },
) {
  return apiFetch<{
    result: {
      notificationsCreated: number;
      emailQueued: number;
      emailSkipped: number;
      emailConfigured: boolean;
    };
  }>(`/api/v1/tasks/${taskId}/notifications`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTaskRecurrenceStatus(
  taskId: string,
  status: "active" | "paused",
) {
  return apiFetch<{ recurrence: TaskRecurrence }>(
    `/api/v1/tasks/${taskId}/recurrence`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}

export type TaskBulkAction =
  | {
      action: "assign";
      taskIds: string[];
      assigneeIds: string[];
      notes?: string | null;
    }
  | {
      action: "open" | "close" | "archive" | "remind";
      taskIds: string[];
    };

export function bulkMutateTasks(input: TaskBulkAction) {
  return apiFetch<{
    result: {
      action: TaskBulkAction["action"];
      taskCount: number;
      assignmentsCreated?: number;
      notificationsCreated?: number;
    };
  }>("/api/v1/tasks/bulk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
