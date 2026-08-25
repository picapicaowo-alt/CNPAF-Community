import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { listQuickCaptureForms } from "@/lib/modules/quick-capture";

export async function GET() {
  try {
    const { user, error } = await requirePermission("records.create");
    if (error || !user) return error;
    return NextResponse.json({ forms: await listQuickCaptureForms(user.id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
