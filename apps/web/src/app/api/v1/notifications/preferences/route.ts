import { NextResponse } from "next/server";
import { notificationPreferenceBodySchema } from "@cnpaf/shared";
import { requirePermission } from "@/lib/http";
import { apiErrorResponse } from "@/lib/api-error";
import { getNotificationPreferences, saveNotificationPreference } from "@/lib/modules/notifications";

export async function GET() {
  const { user, error } = await requirePermission("notifications.manage");
  if (error || !user) return error;
  return NextResponse.json({ preferences: await getNotificationPreferences(user.id) });
}

export async function PUT(req: Request) {
  try {
    const { user, error } = await requirePermission("notifications.manage");
    if (error || !user) return error;
    return NextResponse.json({ preference: await saveNotificationPreference(user.id, notificationPreferenceBodySchema.parse(await req.json())) });
  } catch (error) { return apiErrorResponse(error); }
}
