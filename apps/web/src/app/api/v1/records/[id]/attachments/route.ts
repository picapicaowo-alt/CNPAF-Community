import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { attachments, records } from "@cnpaf/db/schema";
import { db } from "@/lib/db";
import { requireUser, jsonError } from "@/lib/http";
import { attachmentKey, stripExif } from "@/lib/images";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, error } = await requireUser();
  if (error) return error;
  const { id } = await ctx.params;
  const record = (await db.select().from(records).where(eq(records.id, id)).limit(1))[0];
  if (!record?.headVersionId) return jsonError("Record not found", 404);
  if (user!.role === "volunteer" && record.createdById !== user!.id) return jsonError("Forbidden", 403);

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("file required");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const stripped = stripExif(buf, mime);
  const key = attachmentKey(record.headVersionId, file.name || "photo.jpg");
  const dir = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
  const full = path.join(dir, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, stripped);
  const [row] = await db
    .insert(attachments)
    .values({
      recordVersionId: record.headVersionId,
      storageKey: key,
      mimeType: mime,
      byteSize: stripped.length,
      exifStripped: true,
      sentToAi: false,
    })
    .returning();
  return NextResponse.json({ attachment: row });
}
