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
  recordStatus?: string | null;
  recordReviewStatus?: string | null;
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
  assignments: TaskAssignment[];
  myAssignment: TaskAssignment | null;
};

export type TaskDetailResponse = {
  task: Omit<TaskSummary, "myAssignment" | "assignments">;
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

const TASK_STATUS_LABELS: Record<string, { zh: string; en: string }> = {
  all: { zh: "全部", en: "All" },
  draft: { zh: "草稿", en: "Draft" },
  open: { zh: "开放", en: "Open" },
  closed: { zh: "已关闭", en: "Closed" },
  archived: { zh: "已归档", en: "Archived" },
  assigned: { zh: "已分配", en: "Assigned" },
  in_progress: { zh: "进行中", en: "In progress" },
  completed: { zh: "已完成", en: "Completed" },
  declined: { zh: "已拒绝", en: "Declined" },
  cancelled: { zh: "已取消", en: "Cancelled" },
};

export function taskStatusLabel(status: string, locale: "zh" | "en") {
  return (
    TASK_STATUS_LABELS[status]?.[locale] ?? status.replaceAll("_", " ")
  );
}
