import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  configRegistries,
  configRegistryItems,
  templates,
  templateVersions,
} from "@cnpaf/db/schema";
import { ApiError } from "@/lib/api-error";
import { evaluateAuthorization, getAccessContext } from "@/lib/authorization";
import { contentHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getTemplateVersionBundle } from "@/lib/templates";

function allowsQuickCapture(configuration: unknown) {
  return (
    typeof configuration === "object" &&
    configuration !== null &&
    (configuration as { allowQuickCapture?: unknown }).allowQuickCapture === true
  );
}

export async function listQuickCaptureForms(userId: string) {
  const access = await getAccessContext(userId);
  const rows = await db
    .select({ template: templates, version: templateVersions })
    .from(templates)
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, templates.currentPublishedVersionId),
    )
    .where(
      and(
        eq(templates.status, "active"),
        eq(templateVersions.status, "published"),
      ),
    )
    .orderBy(desc(templateVersions.publishedAt));
  return rows
    .filter(
      ({ template, version }) =>
        allowsQuickCapture(version.configuration) &&
        evaluateAuthorization(access, "records.create", {
          organizationId: template.organizationId,
          templateId: template.id,
          formId: template.id,
          ownerUserId: userId,
        }).allowed,
    )
    .map(({ template, version }) => ({
      templateId: template.id,
      templateKey: template.key,
      templateTypeKey: template.templateTypeKey,
      organizationId: template.organizationId,
      versionId: version.id,
      version: version.version,
      nameEn: version.nameEn,
      nameZh: version.nameZh,
      descriptionEn: version.descriptionEn,
      descriptionZh: version.descriptionZh,
    }));
}

export async function getQuickCapturePackage(
  userId: string,
  versionId: string,
) {
  const row = (
    await db
      .select({ template: templates, version: templateVersions })
      .from(templateVersions)
      .innerJoin(templates, eq(templateVersions.templateId, templates.id))
      .where(eq(templateVersions.id, versionId))
      .limit(1)
  )[0];
  if (
    !row ||
    row.version.status !== "published" ||
    row.template.currentPublishedVersionId !== versionId ||
    !allowsQuickCapture(row.version.configuration)
  )
    throw new ApiError("NOT_FOUND", "Quick-capture form not found", 404);
  const access = await getAccessContext(userId);
  if (
    !evaluateAuthorization(access, "records.create", {
      organizationId: row.template.organizationId,
      templateId: row.template.id,
      formId: row.template.id,
      ownerUserId: userId,
    }).allowed
  )
    throw new ApiError("FORBIDDEN", "Form is outside the assigned scope", 403);
  const form = await getTemplateVersionBundle(versionId);
  if (!form)
    throw new ApiError("NOT_FOUND", "Quick-capture form not found", 404);
  const configuration = await db
    .select({
      registryKey: configRegistries.key,
      itemId: configRegistryItems.id,
      itemKey: configRegistryItems.key,
      version: configRegistryItems.version,
      labelEn: configRegistryItems.labelEn,
      labelZh: configRegistryItems.labelZh,
      helpTextEn: configRegistryItems.helpTextEn,
      helpTextZh: configRegistryItems.helpTextZh,
      sortOrder: configRegistryItems.sortOrder,
      metadata: configRegistryItems.metadata,
    })
    .from(configRegistryItems)
    .innerJoin(
      configRegistries,
      eq(configRegistryItems.registryId, configRegistries.id),
    )
    .where(
      and(
        eq(configRegistries.status, "active"),
        eq(configRegistryItems.status, "active"),
        row.template.organizationId
          ? or(
              isNull(configRegistryItems.organizationId),
              eq(
                configRegistryItems.organizationId,
                row.template.organizationId,
              ),
            )
          : isNull(configRegistryItems.organizationId),
      ),
    );
  const payload = {
    template: row.template,
    form,
    configuration,
    syncContract: {
      localVersionRequired: true,
      idempotencyKeyRequired: true,
      conflictPolicy: "server_version_compare",
    },
  };
  return { ...payload, packageVersion: contentHash(payload) };
}
