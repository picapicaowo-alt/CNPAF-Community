import { NextResponse } from "next/server";
import { getTaskAutomationRuntimeConfig } from "@/config/server";
import { safeEqual } from "@/lib/crypto";
import { processNotificationEmailJobs } from "@/lib/jobs";
import { materializeRecurringTasks } from "@/lib/modules/task-recurrence-service";

export async function POST(req: Request) {
  const config = getTaskAutomationRuntimeConfig();
  const authorization = req.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!safeEqual(supplied, config.secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const through = new Date(Date.now() + config.recurrenceLookaheadDays * 86_400_000);
  const recurrence = await materializeRecurringTasks(through);
  const email = await processNotificationEmailJobs(100);
  return NextResponse.json({ recurrence, email, through });
}
