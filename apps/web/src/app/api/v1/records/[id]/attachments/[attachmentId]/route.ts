import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { attachments, records } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { authorizeAny } from "@/lib/authorization";
import { getObjectStream } from "@/lib/storage";
import { inlineContentDisposition } from "@/lib/attachments";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id, attachmentId } = await ctx.params;
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record?.headVersionId) return jsonError("Record not found", 404);
  const decision = await authorizeAny({ userId: user!.id, permissions: ["records.view", "records.view_own"], resource: { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind, ownerUserId: record.createdById } });
  if (!decision.allowed) return jsonError("Forbidden", 403);

  const file = (
    await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId), eq(attachments.recordVersionId, record.headVersionId)))
      .limit(1)
  )[0];
  if (!file) return jsonError("Attachment not found", 404);

  const { body, contentLength, contentType } = await getObjectStream(file.storageKey);
  return new NextResponse(body, {
    headers: {
      "Content-Type": contentType || file.mimeType,
      "Content-Length": String(contentLength ?? file.byteSize),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": inlineContentDisposition(file.storageKey),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
