import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listTasks } from "@/lib/modules/tasks";

export async function GET() {
  const { user, error } = await requirePermission("tasks.view");
  if (error || !user) return error;
  return NextResponse.json({ tasks: await listTasks(user.id, true) });
}
