import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attachments, records, recordVersions } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { authorize } from "@/lib/authorization";
import { attachmentKey, stripExif } from "@/lib/images";
import { putObject } from "@/lib/storage";
import {
  attachmentUploadError,
  toAttachmentSummary,
  uploadMimeType,
} from "@/lib/attachments";
import { attachmentKindForMime } from "@cnpaf/shared";
import { createHash } from "node:crypto";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record?.headVersionId) return jsonError("Record not found", 404);
  const version = (await db.select().from(recordVersions).where(eq(recordVersions.id, record.headVersionId)).limit(1))[0];
  if (!version || version.isSnapshot) return jsonError("Attachments can only be added before the record is submitted", 409);
  const decision = await authorize({ userId: user!.id, permission: "records.edit_own", resource: { organizationId: record.organizationId, programId: record.programId, siteId: record.siteId, serviceKey: record.sourceKind, ownerUserId: record.createdById } });
  if (!decision.allowed) return jsonError("Forbidden", 403);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file required");
  const mime = uploadMimeType(file);
  const validationError = attachmentUploadError(file, mime);
  if (validationError) return jsonError(validationError, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  const stripped = stripExif(buf, mime);
  const key = attachmentKey(record.headVersionId, file.name || "attachment");
  await putObject(key, stripped, mime);
  const [row] = await db
    .insert(attachments)
    .values({
      recordVersionId: record.headVersionId,
      kind: attachmentKindForMime(mime),
      storageKey: key,
      mimeType: mime,
      byteSize: stripped.length,
      contentSha256: createHash("sha256").update(stripped).digest("hex"),
      exifStripped: !mime.startsWith("image/") || ["image/jpeg", "image/jpg"].includes(mime),
      sentToAi: false,
    })
    .returning();
  return NextResponse.json({
    attachment: toAttachmentSummary(
      row,
      `/api/v1/records/${record.id}/attachments/${row.id}`,
    ),
  });
}
