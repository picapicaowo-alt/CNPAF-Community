import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auditEvents, users } from "@cnpaf/db/schema";
import { ApiError, apiErrorResponse, requestId } from "@/lib/api-error";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/http";
import { deleteObject, getObject, putObject } from "@/lib/storage";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const avatarTypes = {
  "image/jpeg": {
    extension: "jpg",
    matches: (body: Buffer) =>
      body.length >= 3 &&
      body[0] === 0xff &&
      body[1] === 0xd8 &&
      body[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (body: Buffer) =>
      body.length >= 8 &&
      body.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
  },
  "image/webp": {
    extension: "webp",
    matches: (body: Buffer) =>
      body.length >= 12 &&
      body.subarray(0, 4).toString("ascii") === "RIFF" &&
      body.subarray(8, 12).toString("ascii") === "WEBP",
  },
} as const;

export async function GET() {
  const { user, error } = await requireUser();
  if (error || !user) return error;
  const avatar = (
    await db
      .select({
        storageKey: users.avatarStorageKey,
        mimeType: users.avatarMimeType,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1)
  )[0];
  if (!avatar?.storageKey) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }
  try {
    const object = await getObject(avatar.storageKey);
    return new NextResponse(new Uint8Array(object.body), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "Content-Type":
          avatar.mimeType ?? object.contentType ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }
}

export async function POST(req: Request) {
  const traceId = requestId(req);
  let uploadedKey: string | null = null;
  try {
    const { user, error } = await requireUser();
    if (error || !user) return error;
    const form = await req.formData();
    const file = form.get("avatar");
    if (!(file instanceof File)) {
      throw new ApiError("BAD_REQUEST", "Choose an avatar image", 400);
    }
    if (!file.size || file.size > MAX_AVATAR_BYTES) {
      throw new ApiError(
        "BAD_REQUEST",
        "Avatar must be smaller than 5 MB",
        400,
      );
    }
    const type = avatarTypes[file.type as keyof typeof avatarTypes];
    if (!type) {
      throw new ApiError(
        "BAD_REQUEST",
        "Avatar must be a JPEG, PNG, or WebP image",
        400,
      );
    }
    const body = Buffer.from(await file.arrayBuffer());
    if (!type.matches(body)) {
      throw new ApiError(
        "BAD_REQUEST",
        "The uploaded file does not match its image type",
        400,
      );
    }
    const current = (
      await db
        .select({ storageKey: users.avatarStorageKey })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1)
    )[0];
    uploadedKey = `avatars/${user.id}/${randomUUID()}.${type.extension}`;
    await putObject(uploadedKey, body, file.type);
    const changedAt = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          avatarStorageKey: uploadedKey,
          avatarMimeType: file.type,
          updatedAt: changedAt,
        })
        .where(eq(users.id, user.id));
      await audit(
        {
          actorId: user.id,
          action: "account.avatar_changed",
          entityType: "user",
          entityId: user.id,
          targetUserId: user.id,
          metadata: { requestId: traceId, mimeType: file.type, size: file.size },
        },
        (values) => tx.insert(auditEvents).values(values),
      );
    });
    if (current?.storageKey && current.storageKey !== uploadedKey) {
      await deleteObject(current.storageKey).catch((cleanupError) =>
        console.error("Could not delete replaced avatar", {
          requestId: traceId,
          cleanupError,
        }),
      );
    }
    return NextResponse.json({
      avatarUrl: `/api/v1/account/avatar?v=${changedAt.getTime()}`,
    });
  } catch (error) {
    if (uploadedKey) await deleteObject(uploadedKey).catch(() => undefined);
    return apiErrorResponse(error, traceId);
  }
}
