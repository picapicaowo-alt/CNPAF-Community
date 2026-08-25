import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { requirePermission } from "@/lib/http";
import { getQuickCapturePackage } from "@/lib/modules/quick-capture";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  try {
    const { user, error } = await requirePermission("records.create");
    if (error || !user) return error;
    return NextResponse.json(
      await getQuickCapturePackage(user.id, (await params).versionId),
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
