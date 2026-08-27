import { and, eq } from "drizzle-orm";
import { auditEvents, notificationTemplates, users } from "@cnpaf/db/schema";
import type { z } from "zod";
import type { notificationTemplateBodySchema } from "@cnpaf/shared";
import { audit } from "../audit";
import { ApiError } from "../api-error";
import { authorize } from "../authorization";
import { db } from "../db";
import {
  getNotificationTemplateDefinition,
  NOTIFICATION_TEMPLATE_CATALOG,
  templateVariables,
} from "../notification-template-catalog";

type TemplateInput = z.infer<typeof notificationTemplateBodySchema>;

async function requireTemplateAdministrator(actorId: string) {
  const actor = await db.select({ organizationId: users.organizationId })
    .from(users)
    .where(eq(users.id, actorId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!actor?.organizationId) {
    throw new ApiError("BAD_REQUEST", "An organization is required to manage notification templates", 400);
  }
  const decision = await authorize({
    userId: actorId,
    permission: "notifications.manage_templates",
    resource: { organizationId: actor.organizationId },
  });
  if (!decision.allowed) throw new ApiError("FORBIDDEN", "Cannot manage notification templates", 403);
  return actor.organizationId;
}

export async function listNotificationTemplates(actorId: string) {
  const organizationId = await requireTemplateAdministrator(actorId);
  const overrides = await db.select()
    .from(notificationTemplates)
    .where(eq(notificationTemplates.organizationId, organizationId));
  const byKind = new Map(overrides.map((item) => [item.kindKey, item]));
  return NOTIFICATION_TEMPLATE_CATALOG.map((definition) => {
    const override = byKind.get(definition.kindKey);
    return {
      ...definition,
      titleTemplate: override?.titleTemplate ?? definition.defaultTitleTemplate,
      bodyTemplate: override?.bodyTemplate ?? definition.defaultBodyTemplate,
      emailSubjectTemplate: override?.emailSubjectTemplate ?? definition.defaultEmailSubjectTemplate,
      actionLabelTemplate: override?.actionLabelTemplate ?? definition.defaultActionLabelTemplate,
      status: override?.status ?? "active",
      customized: Boolean(override),
      updatedAt: override?.updatedAt ?? null,
    };
  });
}

export async function saveNotificationTemplate(
  actorId: string,
  input: TemplateInput,
  requestId?: string,
) {
  const organizationId = await requireTemplateAdministrator(actorId);
  const definition = getNotificationTemplateDefinition(input.kindKey);
  if (!definition) throw new ApiError("BAD_REQUEST", "Unknown notification event", 400);
  const fields = [
    input.titleTemplate,
    input.bodyTemplate,
    input.emailSubjectTemplate,
    input.actionLabelTemplate,
  ];
  const unknownVariables = [...new Set(fields.flatMap(templateVariables))]
    .filter((key) => !definition.variables.includes(key));
  if (unknownVariables.length) {
    throw new ApiError(
      "BAD_REQUEST",
      `Unknown template variables: ${unknownVariables.join(", ")}`,
      400,
      { allowedVariables: definition.variables },
    );
  }
  return db.transaction(async (tx) => {
    const previous = await tx.select()
      .from(notificationTemplates)
      .where(and(
        eq(notificationTemplates.organizationId, organizationId),
        eq(notificationTemplates.kindKey, input.kindKey),
      ))
      .limit(1)
      .then((rows) => rows[0]);
    const [template] = await tx.insert(notificationTemplates).values({
      ...input,
      organizationId,
      updatedById: actorId,
    }).onConflictDoUpdate({
      target: [notificationTemplates.organizationId, notificationTemplates.kindKey],
      set: {
        titleTemplate: input.titleTemplate,
        bodyTemplate: input.bodyTemplate,
        emailSubjectTemplate: input.emailSubjectTemplate,
        actionLabelTemplate: input.actionLabelTemplate,
        status: input.status,
        updatedById: actorId,
        updatedAt: new Date(),
      },
    }).returning();
    await audit({
      actorId,
      action: previous ? "notification_template.updated" : "notification_template.created",
      entityType: "notification_template",
      entityId: template.id,
      beforeState: previous,
      afterState: template,
      metadata: { requestId, kindKey: input.kindKey },
    }, (values) => tx.insert(auditEvents).values(values));
    return template;
  });
}
