import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { listNotifications } from "@/lib/modules/notifications";

export async function GET(req: Request) {
  const { user, error } = await requirePermission("notifications.view");
  if (error || !user) return error;
  const status = new URL(req.url).searchParams.get("status");
  return NextResponse.json({ notifications: await listNotifications(user.id, status) });
}
