import { NextResponse } from "next/server";
import { notificationTemplateBodySchema } from "@cnpaf/shared";
import { apiErrorResponse, requestId } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import {
  listNotificationTemplates,
  saveNotificationTemplate,
} from "@/lib/modules/notification-templates";

export async function GET() {
  const { user, error } = await requirePermission("notifications.manage_templates");
  if (error || !user) return error;
  return NextResponse.json({ templates: await listNotificationTemplates(user.id) });
}

export async function PUT(req: Request) {
  const traceId = requestId(req);
  try {
    const { user, error } = await requirePermission("notifications.manage_templates");
    if (error || !user) return error;
    const input = notificationTemplateBodySchema.parse(await req.json());
    return NextResponse.json({ template: await saveNotificationTemplate(user.id, input, traceId) });
  } catch (error) {
    return apiErrorResponse(error, traceId);
  }
}
