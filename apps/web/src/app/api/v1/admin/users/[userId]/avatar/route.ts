import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@cnpaf/db/schema";
import { authorizeAny } from "@/lib/authorization";
import { db } from "@/lib/db";
import { jsonError, requireAnyPermission } from "@/lib/http";
import { getObject } from "@/lib/storage";

type Context = { params: Promise<{ userId: string }> };

export async function GET(_req: Request, { params }: Context) {
  const { user: actor, error } = await requireAnyPermission([
    "people.view",
    "users.view",
  ]);
  if (error || !actor) return error;

  const { userId } = await params;
  const avatar = (
    await db
      .select({
        storageKey: users.avatarStorageKey,
        mimeType: users.avatarMimeType,
        organizationId: users.organizationId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  )[0];

  if (!avatar) return jsonError("User not found", 404);
  const allowed = await authorizeAny({
    userId: actor.id,
    permissions: ["people.view", "users.view"],
    resource: { organizationId: avatar.organizationId },
  });
  if (!allowed.allowed) return jsonError("Forbidden", 403);
  if (!avatar.storageKey) return jsonError("Avatar not found", 404);

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
    return jsonError("Avatar not found", 404);
  }
}
