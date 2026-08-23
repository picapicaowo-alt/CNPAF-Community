import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  templateFieldOptions,
  templateFields,
  templateSections,
  templates,
  templateVersions,
} from "@cnpaf/db/schema";
import type { z } from "zod";
import type {
  templateCreateBodySchema,
  templateFieldBodySchema,
  templateFieldOptionBodySchema,
  templateSectionBodySchema,
  templateVersionCreateBodySchema,
} from "@cnpaf/shared";
import { db } from "./db";

export type TemplateCreateInput = z.infer<typeof templateCreateBodySchema>;
export type TemplateVersionCreateInput = z.infer<typeof templateVersionCreateBodySchema>;
export type TemplateSectionInput = z.infer<typeof templateSectionBodySchema>;
export type TemplateFieldInput = z.infer<typeof templateFieldBodySchema>;
export type TemplateFieldOptionInput = z.infer<typeof templateFieldOptionBodySchema>;

export async function getTemplateAuthorizationResource(
  kind: "template" | "version" | "section" | "field" | "option",
  id: string,
) {
  if (kind === "template") {
    const template = (await db.select().from(templates).where(eq(templates.id, id)).limit(1))[0];
    return template ? { templateId: template.id, organizationId: template.organizationId } : null;
  }
  if (kind === "version") {
    const row = (await db.select({ template: templates }).from(templateVersions).innerJoin(templates, eq(templateVersions.templateId, templates.id)).where(eq(templateVersions.id, id)).limit(1))[0];
    return row ? { templateId: row.template.id, organizationId: row.template.organizationId } : null;
  }
  if (kind === "section") {
    const row = (await db.select({ template: templates }).from(templateSections).innerJoin(templateVersions, eq(templateSections.templateVersionId, templateVersions.id)).innerJoin(templates, eq(templateVersions.templateId, templates.id)).where(eq(templateSections.id, id)).limit(1))[0];
    return row ? { templateId: row.template.id, organizationId: row.template.organizationId } : null;
  }
  if (kind === "field") {
    const row = (await db.select({ template: templates }).from(templateFields).innerJoin(templateSections, eq(templateFields.templateSectionId, templateSections.id)).innerJoin(templateVersions, eq(templateSections.templateVersionId, templateVersions.id)).innerJoin(templates, eq(templateVersions.templateId, templates.id)).where(eq(templateFields.id, id)).limit(1))[0];
    return row ? { templateId: row.template.id, organizationId: row.template.organizationId } : null;
  }
  const row = (await db.select({ template: templates }).from(templateFieldOptions).innerJoin(templateFields, eq(templateFieldOptions.templateFieldId, templateFields.id)).innerJoin(templateSections, eq(templateFields.templateSectionId, templateSections.id)).innerJoin(templateVersions, eq(templateSections.templateVersionId, templateVersions.id)).innerJoin(templates, eq(templateVersions.templateId, templates.id)).where(eq(templateFieldOptions.id, id)).limit(1))[0];
  return row ? { templateId: row.template.id, organizationId: row.template.organizationId } : null;
}

export async function listTemplates() {
  return db.select().from(templates).orderBy(desc(templates.updatedAt));
}

export async function getTemplateBundle(templateId: string) {
  const template = (await db.select().from(templates).where(eq(templates.id, templateId)).limit(1))[0];
  if (!template) return null;
  const versions = await db.select().from(templateVersions).where(eq(templateVersions.templateId, templateId)).orderBy(desc(templateVersions.version));
  return { template, versions };
}

export async function getTemplateVersionBundle(versionId: string) {
  const version = (await db.select().from(templateVersions).where(eq(templateVersions.id, versionId)).limit(1))[0];
  if (!version) return null;
  const sections = await db.select().from(templateSections).where(eq(templateSections.templateVersionId, versionId)).orderBy(asc(templateSections.sortOrder));
  const sectionIds = sections.map((section) => section.id);
  const fields = sectionIds.length
    ? await db.select().from(templateFields).where(inArray(templateFields.templateSectionId, sectionIds)).orderBy(asc(templateFields.sortOrder))
    : [];
  const fieldIds = fields.map((field) => field.id);
  const options = fieldIds.length
    ? await db.select().from(templateFieldOptions).where(inArray(templateFieldOptions.templateFieldId, fieldIds)).orderBy(asc(templateFieldOptions.sortOrder))
    : [];
  return { version, sections, fields, options };
}

export async function createTemplate(input: TemplateCreateInput, actorId: string) {
  return db.transaction(async (tx) => {
    const [template] = await tx.insert(templates).values({
      key: input.key,
      templateTypeKey: input.templateTypeKey,
      organizationId: input.organizationId,
      status: "draft",
      createdById: actorId,
    }).returning();
    const [version] = await tx.insert(templateVersions).values({
      templateId: template.id,
      version: 1,
      status: "draft",
      nameEn: input.nameEn,
      nameZh: input.nameZh,
      descriptionEn: input.descriptionEn,
      descriptionZh: input.descriptionZh,
      configuration: input.configuration,
      createdById: actorId,
    }).returning();
    return { template, version };
  });
}

export async function createTemplateVersion(templateId: string, input: TemplateVersionCreateInput, actorId: string) {
  const source = input.fromVersionId ? await getTemplateVersionBundle(input.fromVersionId) : null;
  const latest = (await db.select().from(templateVersions).where(eq(templateVersions.templateId, templateId)).orderBy(desc(templateVersions.version)).limit(1))[0];
  if (!latest && !source) throw new Error("Template not found");
  return db.transaction(async (tx) => {
    const [version] = await tx.insert(templateVersions).values({
      templateId,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
      nameEn: input.nameEn ?? source?.version.nameEn ?? latest.nameEn,
      nameZh: input.nameZh ?? source?.version.nameZh ?? latest.nameZh,
      descriptionEn: input.descriptionEn === undefined ? source?.version.descriptionEn ?? latest.descriptionEn : input.descriptionEn,
      descriptionZh: input.descriptionZh === undefined ? source?.version.descriptionZh ?? latest.descriptionZh : input.descriptionZh,
      configuration: input.configuration ?? source?.version.configuration ?? latest.configuration,
      createdById: actorId,
    }).returning();
    if (!source) return version;

    const sectionMap = new Map<string, string>();
    for (const section of source.sections) {
      const [created] = await tx.insert(templateSections).values({
        templateVersionId: version.id,
        key: section.key,
        labelEn: section.labelEn,
        labelZh: section.labelZh,
        helpTextEn: section.helpTextEn,
        helpTextZh: section.helpTextZh,
        sortOrder: section.sortOrder,
        configuration: section.configuration,
      }).returning();
      sectionMap.set(section.id, created.id);
    }
    const fieldMap = new Map<string, string>();
    for (const field of source.fields) {
      const newSectionId = sectionMap.get(field.templateSectionId);
      if (!newSectionId) continue;
      const [created] = await tx.insert(templateFields).values({
        templateSectionId: newSectionId,
        key: field.key,
        fieldTypeKey: field.fieldTypeKey,
        labelEn: field.labelEn,
        labelZh: field.labelZh,
        helpTextEn: field.helpTextEn,
        helpTextZh: field.helpTextZh,
        placeholderEn: field.placeholderEn,
        placeholderZh: field.placeholderZh,
        required: field.required,
        allowMissingReason: field.allowMissingReason,
        allowCustomEntry: field.allowCustomEntry,
        sortOrder: field.sortOrder,
        validation: field.validation,
        visibilityConditions: field.visibilityConditions,
        branchingLogic: field.branchingLogic,
        canonicalMapping: field.canonicalMapping,
        configuration: field.configuration,
      }).returning();
      fieldMap.set(field.id, created.id);
    }
    for (const option of source.options) {
      const newFieldId = fieldMap.get(option.templateFieldId);
      if (!newFieldId) continue;
      await tx.insert(templateFieldOptions).values({
        templateFieldId: newFieldId,
        key: option.key,
        labelEn: option.labelEn,
        labelZh: option.labelZh,
        helpTextEn: option.helpTextEn,
        helpTextZh: option.helpTextZh,
        status: option.status,
        sortOrder: option.sortOrder,
        canonicalRegistryItemId: option.canonicalRegistryItemId,
        configuration: option.configuration,
      });
    }
    return version;
  });
}

export async function publishTemplateVersion(versionId: string) {
  return db.transaction(async (tx) => {
    const version = (await tx.select().from(templateVersions).where(eq(templateVersions.id, versionId)).limit(1))[0];
    if (!version) throw new Error("Template version not found");
    if (version.status !== "draft") throw new Error("Only draft versions can be published");
    const [published] = await tx.update(templateVersions).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(templateVersions.id, versionId)).returning();
    await tx.update(templates).set({ currentPublishedVersionId: versionId, status: "active", updatedAt: new Date() }).where(eq(templates.id, version.templateId));
    return published;
  });
}

export async function addTemplateSection(versionId: string, input: TemplateSectionInput) {
  const [section] = await db.insert(templateSections).values({ templateVersionId: versionId, ...input }).returning();
  return section;
}

export async function addTemplateField(sectionId: string, input: TemplateFieldInput) {
  const [field] = await db.insert(templateFields).values({ templateSectionId: sectionId, ...input }).returning();
  return field;
}

export async function addTemplateFieldOption(fieldId: string, input: TemplateFieldOptionInput) {
  const [option] = await db.insert(templateFieldOptions).values({ templateFieldId: fieldId, ...input }).returning();
  return option;
}
