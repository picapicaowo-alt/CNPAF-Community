import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { requireUser } from "@/lib/http";
import { getRecordFilterOptions } from "@/lib/modules/datasets";

export async function GET() {
  try {
    const { user, error } = await requireUser();
    if (error || !user) return error;
    return NextResponse.json({
      options: await getRecordFilterOptions(user.id),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
