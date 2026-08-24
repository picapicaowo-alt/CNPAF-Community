import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { markNotificationRead } from "@/lib/modules/notifications";

type Context = { params: Promise<{ notificationId: string }> };
export async function POST(_req: Request, { params }: Context) {
  try {
    const { user, error } = await requirePermission("notifications.view");
    if (error || !user) return error;
    return NextResponse.json({ notification: await markNotificationRead(user.id, (await params).notificationId) });
  } catch (error) { return apiErrorResponse(error); }
}
