import { NextResponse } from "next/server";
import { outputSchemaVersionBodySchema } from "@cnpaf/shared";
import { createOutputSchemaVersion, listOutputSchemaVersions } from "@/lib/ai-workflows";
import { jsonError, requirePermission } from "@/lib/http";

export async function GET() {
  const { error } = await requirePermission("ai.configure_workflows");
  if (error) return error;
  return NextResponse.json({ outputSchemaVersions: await listOutputSchemaVersions() });
}

export async function POST(req: Request) {
  const { user, error } = await requirePermission("ai.configure_workflows");
  if (error) return error;
  const parsed = outputSchemaVersionBodySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  try {
    return NextResponse.json({ outputSchemaVersion: await createOutputSchemaVersion(parsed.data, user.id) }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not create output schema version", 409);
  }
}
