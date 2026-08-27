import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { authorize } from "@/lib/authorization";
import { jsonError, requirePermission } from "@/lib/http";
import {
  archiveFormPreset,
  materializeFormPreset,
} from "@/lib/templates";

type RouteContext = { params: Promise<{ key: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const { user, error } = await requirePermission("templates.create");
  if (error || !user) return error;
  const mayEdit = await authorize({
    userId: user.id,
    permission: "templates.edit",
    resource: { organizationId: user.organizationId },
  });
  if (!mayEdit.allowed) return jsonError("Forbidden", 403);
  const { key } = await params;
  try {
    const result = await materializeFormPreset(
      key,
      user.organizationId,
      user.id,
    );
    await audit({
      actorId: user.id,
      action: "form_preset.materialized",
      entityType: "template",
      entityId: result.template.id,
      afterState: result,
      metadata: { presetKey: key },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not edit form preset",
      409,
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { user, error } = await requirePermission("templates.archive");
  if (error || !user) return error;
  const { key } = await params;
  try {
    const preference = await archiveFormPreset(
      key,
      user.organizationId,
      user.id,
    );
    await audit({
      actorId: user.id,
      action: "form_preset.archived",
      entityType: "form_preset",
      entityId: key,
      afterState: preference,
    });
    return NextResponse.json({ preference });
  } catch (caught) {
    return jsonError(
      caught instanceof Error ? caught.message : "Could not delete form preset",
      404,
    );
  }
}
