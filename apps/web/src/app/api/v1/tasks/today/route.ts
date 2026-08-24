import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listTasks } from "@/lib/modules/tasks";

export async function GET() {
  const { user, error } = await requirePermission("tasks.view");
  if (error || !user) return error;
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const assigned = await listTasks(user.id, true);
  return NextResponse.json({
    tasks: assigned.filter((task) =>
      task.status === "open" &&
      ["assigned", "in_progress"].includes(task.myAssignment?.status ?? "") &&
      (!task.opensAt || task.opensAt <= now) &&
      (!task.closesAt || task.closesAt > now) &&
      (!task.dueAt || task.dueAt <= end)
    ),
    asOf: now.toISOString(),
  });
}
