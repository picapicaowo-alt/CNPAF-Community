import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { attachments, records } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { getObject } from "@/lib/storage";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id, attachmentId } = await ctx.params;
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record?.headVersionId) return jsonError("Record not found", 404);
  if (user!.role === "volunteer" && record.createdById !== user!.id) return jsonError("Forbidden", 403);

  const file = (
    await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId), eq(attachments.recordVersionId, record.headVersionId)))
      .limit(1)
  )[0];
  if (!file) return jsonError("Attachment not found", 404);

  const { body, contentType } = await getObject(file.storageKey);
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType || file.mimeType,
      "Content-Length": String(body.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
