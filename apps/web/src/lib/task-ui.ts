export type TaskAssignment = {
  id: string;
  assigneeId: string;
  assigneeName?: string;
  assigneeEmail?: string;
  status: string;
  assignedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  declinedAt?: string | null;
  declineReason?: string | null;
  recordId?: string | null;
};

export type TaskSummary = {
  id: string;
  organizationId: string;
  programId: string;
  siteId?: string | null;
  templateVersionId: string;
  title: string;
  instructions?: string | null;
  taskTypeKey: string;
  status: string;
  dueAt?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  priority: number;
  configuration: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  program: { id: string; key: string; nameEn: string; nameZh: string };
  location: {
    id: string;
    name?: string | null;
    region?: string | null;
    address?: string | null;
  } | null;
  form: {
    templateVersionId: string;
    key: string;
    nameEn: string;
    nameZh: string;
    versionNumber: number;
  };
  myAssignment: TaskAssignment | null;
};

export type TaskDetailResponse = {
  task: Omit<TaskSummary, "myAssignment">;
  myAssignment: TaskAssignment | null;
  assignments: TaskAssignment[];
};

export function taskDate(
  value: string | null | undefined,
  locale: "zh" | "en",
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return locale === "zh" ? "未设日期" : "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale === "zh" ? "zh-CN" : "en-US",
    options ?? {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

export function taskTone(
  status: string,
): "neutral" | "blue" | "green" | "amber" | "red" {
  if (["completed", "closed"].includes(status)) return "green";
  if (["in_progress", "open"].includes(status)) return "blue";
  if (["declined", "cancelled"].includes(status)) return "red";
  if (["assigned", "draft"].includes(status)) return "amber";
  return "neutral";
}
