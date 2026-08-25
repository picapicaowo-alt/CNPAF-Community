import { and, asc, count, desc, eq, inArray, ne } from "drizzle-orm";
import {
  tasks,
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
  templateSectionUpdateBodySchema,
  templateVersionCreateBodySchema,
  templateFieldUpdateBodySchema,
  templateFieldOptionUpdateBodySchema,
} from "@cnpaf/shared";
import {
  configuredFormControl,
  formFieldValidationError,
  getFormPreset,
  parseFormBranchRules,
  parseFormVisibilityConditions,
} from "@cnpaf/shared";
import {
  compareFormVersionSnapshots,
  type FormVersionSnapshot,
} from "@cnpaf/shared";
import { db } from "./db";
import { listRegistry, requireActiveRegistryItem } from "./registries";

export type TemplateCreateInput = z.infer<typeof templateCreateBodySchema>;
export type TemplateVersionCreateInput = z.infer<typeof templateVersionCreateBodySchema>;
export type TemplateSectionInput = z.infer<typeof templateSectionBodySchema>;
export type TemplateFieldInput = z.infer<typeof templateFieldBodySchema>;
export type TemplateFieldOptionInput = z.infer<typeof templateFieldOptionBodySchema>;
export type TemplateSectionUpdateInput = z.infer<typeof templateSectionUpdateBodySchema>;
export type TemplateFieldUpdateInput = z.infer<typeof templateFieldUpdateBodySchema>;
export type TemplateFieldOptionUpdateInput = z.infer<typeof templateFieldOptionUpdateBodySchema>;

function assertSameIds(actualIds: string[], orderedIds: string[]) {
  if (
    actualIds.length !== orderedIds.length ||
    actualIds.some((id) => !orderedIds.includes(id))
  ) {
    throw new Error("orderedIds must contain every current item exactly once");
  }
}

function copyKey(key: string) {
  return `${key.slice(0, 140)}-copy-${Date.now().toString(36)}`;
}

async function requireDraftVersion(versionId: string) {
  const version = (
    await db
      .select()
      .from(templateVersions)
      .where(eq(templateVersions.id, versionId))
      .limit(1)
  )[0];
  if (!version) throw new Error("Template version not found");
  if (version.status !== "draft")
    throw new Error("Published template versions are immutable");
  return version;
}

async function requireDraftSection(sectionId: string) {
  const row = (
    await db
      .select({ section: templateSections, version: templateVersions })
      .from(templateSections)
      .innerJoin(
        templateVersions,
        eq(templateSections.templateVersionId, templateVersions.id),
      )
      .where(eq(templateSections.id, sectionId))
      .limit(1)
  )[0];
  if (!row) throw new Error("Template section not found");
  if (row.version.status !== "draft")
    throw new Error("Published template versions are immutable");
  return row;
}

async function requireDraftField(fieldId: string) {
  const row = (
    await db
      .select({
        field: templateFields,
        section: templateSections,
        version: templateVersions,
      })
      .from(templateFields)
      .innerJoin(
        templateSections,
        eq(templateFields.templateSectionId, templateSections.id),
      )
      .innerJoin(
        templateVersions,
        eq(templateSections.templateVersionId, templateVersions.id),
      )
      .where(eq(templateFields.id, fieldId))
      .limit(1)
  )[0];
  if (!row) throw new Error("Template field not found");
  if (row.version.status !== "draft")
    throw new Error("Published template versions are immutable");
  return row;
}

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
  return db
    .select()
    .from(templates)
    .where(ne(templates.status, "archived"))
    .orderBy(desc(templates.updatedAt));
}

export async function getTemplateBundle(templateId: string) {
  const template = (await db.select().from(templates).where(eq(templates.id, templateId)).limit(1))[0];
  if (!template) return null;
  const versions = await db.select().from(templateVersions).where(eq(templateVersions.templateId, templateId)).orderBy(desc(templateVersions.version));
  const versionIds = versions.map((version) => version.id);
  if (!versionIds.length) return { template, versions: [] };
  const [usageRows, sectionRows, fieldRows] = await Promise.all([
    db
      .select({ templateVersionId: tasks.templateVersionId, value: count() })
      .from(tasks)
      .where(inArray(tasks.templateVersionId, versionIds))
      .groupBy(tasks.templateVersionId),
    db
      .select({ templateVersionId: templateSections.templateVersionId, value: count() })
      .from(templateSections)
      .where(inArray(templateSections.templateVersionId, versionIds))
      .groupBy(templateSections.templateVersionId),
    db
      .select({ templateVersionId: templateSections.templateVersionId, value: count() })
      .from(templateFields)
      .innerJoin(
        templateSections,
        eq(templateFields.templateSectionId, templateSections.id),
      )
      .where(inArray(templateSections.templateVersionId, versionIds))
      .groupBy(templateSections.templateVersionId),
  ]);
  const counts = (rows: Array<{ templateVersionId: string; value: number }>) =>
    new Map(rows.map((row) => [row.templateVersionId, Number(row.value)]));
  const usageByVersion = counts(usageRows);
  const sectionsByVersion = counts(sectionRows);
  const fieldsByVersion = counts(fieldRows);
  return {
    template,
    versions: versions.map((version) => ({
      ...version,
      usageCount: usageByVersion.get(version.id) ?? 0,
      sectionCount: sectionsByVersion.get(version.id) ?? 0,
      fieldCount: fieldsByVersion.get(version.id) ?? 0,
    })),
  };
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

export async function compareTemplateVersions(
  templateId: string,
  fromVersionId: string,
  toVersionId: string,
) {
  const [from, to] = await Promise.all([
    getTemplateVersionBundle(fromVersionId),
    getTemplateVersionBundle(toVersionId),
  ]);
  if (!from || !to) throw new Error("Template version not found");
  if (
    from.version.templateId !== templateId ||
    to.version.templateId !== templateId
  )
    throw new Error("Versions must belong to the selected template");
  return compareFormVersionSnapshots(
    comparableSnapshot(from),
    comparableSnapshot(to),
  );
}

function comparableSnapshot(
  bundle: NonNullable<Awaited<ReturnType<typeof getTemplateVersionBundle>>>,
): FormVersionSnapshot {
  return {
    version: {
      id: bundle.version.id,
      version: bundle.version.version,
      nameEn: bundle.version.nameEn,
      nameZh: bundle.version.nameZh,
      descriptionEn: bundle.version.descriptionEn,
      descriptionZh: bundle.version.descriptionZh,
      configuration: bundle.version.configuration as Record<string, unknown>,
    },
    sections: bundle.sections.map((section) => ({
      ...section,
      configuration: section.configuration as Record<string, unknown>,
    })),
    fields: bundle.fields.map((field) => ({
      ...field,
      configuration: field.configuration as Record<string, unknown>,
    })),
    options: bundle.options.map((option) => ({
      ...option,
      configuration: option.configuration as Record<string, unknown>,
    })),
  };
}

export async function createTemplate(input: TemplateCreateInput, actorId: string) {
  const preset = getFormPreset(input.presetKey);
  if (input.presetKey && !preset) throw new Error("Unknown form preset");
  if (preset && preset.templateTypeKey !== input.templateTypeKey)
    throw new Error("Form preset does not match the selected form type");
  await requireActiveRegistryItem("template_type", input.templateTypeKey, input.organizationId);
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
      configuration: {
        ...input.configuration,
        ...(preset ? { sourcePresetKey: preset.key } : {}),
      },
      createdById: actorId,
    }).returning();
    if (preset) {
      for (const [sectionIndex, section] of preset.sections.entries()) {
        const [createdSection] = await tx
          .insert(templateSections)
          .values({
            templateVersionId: version.id,
            key: section.key,
            labelEn: section.labelEn,
            labelZh: section.labelZh,
            helpTextEn: section.helpTextEn,
            helpTextZh: section.helpTextZh,
            sortOrder: sectionIndex,
            configuration: {},
          })
          .returning();
        for (const [fieldIndex, field] of section.fields.entries()) {
          const [createdField] = await tx
            .insert(templateFields)
            .values({
              templateSectionId: createdSection.id,
              key: field.key,
              fieldTypeKey: field.fieldTypeKey,
              labelEn: field.labelEn,
              labelZh: field.labelZh,
              helpTextEn: field.helpTextEn,
              helpTextZh: field.helpTextZh,
              required: field.required ?? false,
              allowMissingReason: field.allowMissingReason ?? false,
              allowCustomEntry: field.allowCustomEntry ?? false,
              sortOrder: fieldIndex,
              validation: field.validation ?? {},
              visibilityConditions: field.visibilityConditions ?? [],
              branchingLogic: [],
              canonicalMapping: {},
              configuration: field.configuration ?? {},
            })
            .returning();
          if (field.options?.length) {
            await tx.insert(templateFieldOptions).values(
              field.options.map((option, optionIndex) => ({
                templateFieldId: createdField.id,
                key: option.key,
                labelEn: option.labelEn,
                labelZh: option.labelZh,
                sortOrder: optionIndex,
                configuration: {},
              })),
            );
          }
        }
      }
    }
    return { template, version };
  });
}

export async function archiveTemplate(templateId: string) {
  const [template] = await db
    .update(templates)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(templates.id, templateId))
    .returning();
  if (!template) throw new Error("Template not found");
  return template;
}

export async function duplicateTemplate(
  templateId: string,
  actorId: string,
  purpose: "form" | "template" = "form",
) {
  const bundle = await getTemplateBundle(templateId);
  if (!bundle) throw new Error("Template not found");
  const sourceVersion =
    bundle.versions.find((version) => version.status === "draft") ??
    bundle.versions.find(
      (version) => version.id === bundle.template.currentPublishedVersionId,
    ) ??
    bundle.versions[0];
  if (!sourceVersion) throw new Error("Template has no version to copy");
  const source = await getTemplateVersionBundle(sourceVersion.id);
  if (!source) throw new Error("Template version not found");
  const suffixEn = purpose === "template" ? " (Template)" : " (Copy)";
  const suffixZh = purpose === "template" ? "（模板）" : "（副本）";

  return db.transaction(async (tx) => {
    const [template] = await tx
      .insert(templates)
      .values({
        key: copyKey(bundle.template.key),
        templateTypeKey: bundle.template.templateTypeKey,
        organizationId: bundle.template.organizationId,
        status: "draft",
        createdById: actorId,
      })
      .returning();
    const [version] = await tx
      .insert(templateVersions)
      .values({
        templateId: template.id,
        version: 1,
        status: "draft",
        nameEn: `${source.version.nameEn}${suffixEn}`.slice(0, 240),
        nameZh: `${source.version.nameZh}${suffixZh}`.slice(0, 240),
        descriptionEn: source.version.descriptionEn,
        descriptionZh: source.version.descriptionZh,
        configuration: {
          ...withoutReleaseNotes(
            source.version.configuration as Record<string, unknown>,
          ),
          duplicatedFromTemplateId: templateId,
          duplicatedFromVersionId: source.version.id,
          savedAsReusableTemplate: purpose === "template",
        },
        createdById: actorId,
      })
      .returning();

    const sectionMap = new Map<string, string>();
    for (const section of source.sections) {
      const [created] = await tx
        .insert(templateSections)
        .values({
          templateVersionId: version.id,
          key: section.key,
          labelEn: section.labelEn,
          labelZh: section.labelZh,
          helpTextEn: section.helpTextEn,
          helpTextZh: section.helpTextZh,
          sortOrder: section.sortOrder,
          configuration: section.configuration,
        })
        .returning();
      sectionMap.set(section.id, created.id);
    }
    const fieldMap = new Map<string, string>();
    for (const field of source.fields) {
      const templateSectionId = sectionMap.get(field.templateSectionId);
      if (!templateSectionId) continue;
      const [created] = await tx
        .insert(templateFields)
        .values({
          templateSectionId,
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
        })
        .returning();
      fieldMap.set(field.id, created.id);
    }
    for (const option of source.options) {
      const templateFieldId = fieldMap.get(option.templateFieldId);
      if (!templateFieldId) continue;
      await tx.insert(templateFieldOptions).values({
        templateFieldId,
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
    return { template, version };
  });
}

export async function unpublishTemplate(templateId: string, actorId: string) {
  const bundle = await getTemplateBundle(templateId);
  if (!bundle) throw new Error("Template not found");
  const published = bundle.versions.find(
    (version) => version.id === bundle.template.currentPublishedVersionId,
  );
  if (!published) throw new Error("Template is not currently published");
  const draft =
    bundle.versions.find((version) => version.status === "draft") ??
    (await createTemplateVersion(
      templateId,
      { fromVersionId: published.id },
      actorId,
    ));
  const [template] = await db
    .update(templates)
    .set({
      currentPublishedVersionId: null,
      status: "draft",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(templates.id, templateId),
        eq(templates.currentPublishedVersionId, published.id),
      ),
    )
    .returning();
  if (!template) throw new Error("Template publication changed; try again");
  return { template, version: draft, previousPublishedVersion: published };
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
      configuration:
        input.configuration ??
        (source
          ? withoutReleaseNotes(
              source.version.configuration as Record<string, unknown>,
            )
          : latest.configuration),
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

function withoutReleaseNotes(configuration: Record<string, unknown>) {
  const cloned = { ...configuration };
  delete cloned.releaseNotes;
  return cloned;
}

export async function publishTemplateVersion(versionId: string) {
  const bundle = await getTemplateVersionBundle(versionId);
  if (!bundle) throw new Error("Template version not found");
  if (bundle.version.status !== "draft")
    throw new Error("Only draft versions can be published");
  if (!bundle.sections.length)
    throw new Error("Add at least one section before publishing");
  if (!bundle.fields.length)
    throw new Error("Add at least one field before publishing");

  const orderedSections = bundle.sections.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const sectionIndexById = new Map(
    orderedSections.map((section, index) => [section.id, index]),
  );
  const orderedFields = orderedSections.flatMap((section) =>
    bundle.fields
      .filter((field) => field.templateSectionId === section.id)
      .toSorted((left, right) => left.sortOrder - right.sortOrder),
  );
  const fieldByKey = new Map<string, (typeof orderedFields)[number]>();
  const fieldIndexById = new Map<string, number>();
  for (const [index, field] of orderedFields.entries()) {
    if (fieldByKey.has(field.key))
      throw new Error(`Field key ${field.key} must be unique in the form`);
    fieldByKey.set(field.key, field);
    fieldIndexById.set(field.id, index);
  }
  for (const section of orderedSections) {
    const configuration = section.configuration as Record<string, unknown>;
    const rawConditions = configuration?.visibilityConditions;
    const conditions = validatedVisibilityConditions(
      rawConditions,
      `Section ${section.key}`,
    );
    const sectionIndex = sectionIndexById.get(section.id) ?? 0;
    for (const condition of conditions) {
      const source = fieldByKey.get(condition.fieldKey);
      if (!source)
        throw new Error(
          `Section ${section.key} references unknown field ${condition.fieldKey}`,
        );
      const sourceSectionIndex =
        sectionIndexById.get(source.templateSectionId) ?? sectionIndex;
      if (sourceSectionIndex >= sectionIndex)
        throw new Error(
          `Section ${section.key} can only depend on a field in an earlier section`,
        );
    }
  }
  for (const field of orderedFields) {
    const conditions = validatedVisibilityConditions(
      field.visibilityConditions,
      `Field ${field.key}`,
    );
    const fieldIndex = fieldIndexById.get(field.id) ?? 0;
    for (const condition of conditions) {
      const source = fieldByKey.get(condition.fieldKey);
      if (!source)
        throw new Error(
          `Field ${field.key} references unknown field ${condition.fieldKey}`,
        );
      if ((fieldIndexById.get(source.id) ?? fieldIndex) >= fieldIndex)
        throw new Error(
          `Field ${field.key} can only depend on an earlier field`,
        );
    }
    const branchRules = validatedBranchRules(
      field.branchingLogic,
      `Field ${field.key}`,
    );
    const sourceSectionIndex =
      sectionIndexById.get(field.templateSectionId) ?? 0;
    for (const rule of branchRules) {
      if (rule.action !== "go_to_section") continue;
      const target = orderedSections.find(
        (section) => section.key === rule.targetSectionKey,
      );
      if (!target)
        throw new Error(
          `Field ${field.key} branches to unknown section ${rule.targetSectionKey}`,
        );
      const targetSectionIndex = sectionIndexById.get(target.id) ?? 0;
      if (targetSectionIndex <= sourceSectionIndex)
        throw new Error(
          `Field ${field.key} can only branch to a later section`,
        );
    }
  }

  const emptySection = bundle.sections.find(
    (section) =>
      !bundle.fields.some(
        (field) => field.templateSectionId === section.id,
      ),
  );
  if (emptySection)
    throw new Error(`Section ${emptySection.key} must contain a field`);

  const fieldTypeRegistry = await listRegistry(
    "collection_field_type",
    "active",
  );
  const controls = new Map(
    (fieldTypeRegistry?.items ?? []).map((item) => [
      item.key,
      configuredFormControl(
        (item.metadata as Record<string, unknown> | null) ?? undefined,
      ),
    ]),
  );
  for (const field of bundle.fields) {
    if (!controls.has(field.fieldTypeKey))
      throw new Error(`Field ${field.key} uses an inactive field type`);
    const control = controls.get(field.fieldTypeKey);
    const validationError = formFieldValidationError(
      control ?? "text",
      validationRecord(field.validation),
    );
    if (validationError)
      throw new Error(`Field ${field.key}: ${validationError}`);
    if (
      (control === "single" ||
        control === "multi" ||
        control === "dropdown") &&
      !bundle.options.some(
        (option) =>
          option.templateFieldId === field.id && option.status === "active",
      )
    ) {
      throw new Error(`Choice field ${field.key} must contain an active option`);
    }
    if (
      control === "display" &&
      (field.required || field.allowMissingReason || field.allowCustomEntry)
    )
      throw new Error(
        `Information field ${field.key} cannot require an answer`,
      );
  }

  return db.transaction(async (tx) => {
    const version = (await tx.select().from(templateVersions).where(eq(templateVersions.id, versionId)).limit(1))[0];
    if (!version) throw new Error("Template version not found");
    if (version.status !== "draft") throw new Error("Only draft versions can be published");
    const [published] = await tx.update(templateVersions).set({ status: "published", publishedAt: new Date(), updatedAt: new Date() }).where(eq(templateVersions.id, versionId)).returning();
    await tx.update(templates).set({ currentPublishedVersionId: versionId, status: "active", updatedAt: new Date() }).where(eq(templates.id, version.templateId));
    return published;
  });
}

function validatedVisibilityConditions(input: unknown, owner: string) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input))
    throw new Error(`${owner} has invalid visibility conditions`);
  const conditions = parseFormVisibilityConditions(input);
  if (conditions.length !== input.length)
    throw new Error(`${owner} has invalid visibility conditions`);
  for (const condition of conditions) {
    if (
      !["answered", "not_answered"].includes(condition.operator) &&
      condition.value === undefined
    )
      throw new Error(`${owner} visibility condition requires a value`);
  }
  return conditions;
}

function validatedBranchRules(input: unknown, owner: string) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input))
    throw new Error(`${owner} has invalid branch rules`);
  const rules = parseFormBranchRules(input);
  if (rules.length !== input.length)
    throw new Error(`${owner} has invalid branch rules`);
  for (const rule of rules) {
    if (
      !["answered", "not_answered"].includes(rule.operator) &&
      rule.value === undefined
    )
      throw new Error(`${owner} branch rule requires a value`);
  }
  return rules;
}

export async function addTemplateSection(versionId: string, input: TemplateSectionInput) {
  await requireDraftVersion(versionId);
  const [section] = await db.insert(templateSections).values({ templateVersionId: versionId, ...input }).returning();
  return section;
}

export async function addTemplateField(sectionId: string, input: TemplateFieldInput) {
  await requireDraftSection(sectionId);
  const resource = await getTemplateAuthorizationResource("section", sectionId);
  if (!resource) throw new Error("Template section not found");
  const fieldType = await requireActiveRegistryItem("collection_field_type", input.fieldTypeKey, resource.organizationId);
  assertFieldValidation(fieldType.metadata, input.validation, `Field ${input.key}`);
  const [field] = await db.insert(templateFields).values({ templateSectionId: sectionId, ...input }).returning();
  return field;
}

export async function addTemplateFieldOption(fieldId: string, input: TemplateFieldOptionInput) {
  await requireDraftField(fieldId);
  const [option] = await db.insert(templateFieldOptions).values({ templateFieldId: fieldId, ...input }).returning();
  return option;
}

export async function updateTemplateSection(
  sectionId: string,
  input: TemplateSectionUpdateInput,
) {
  await requireDraftSection(sectionId);
  const existing = (
    await db
      .select()
      .from(templateSections)
      .where(eq(templateSections.id, sectionId))
      .limit(1)
  )[0];
  const [section] = await db
    .update(templateSections)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(templateSections.id, sectionId))
    .returning();
  return { existing, section };
}

export async function deleteTemplateSection(sectionId: string) {
  const { section } = await requireDraftSection(sectionId);
  return db.transaction(async (tx) => {
    const fields = await tx
      .select({ id: templateFields.id })
      .from(templateFields)
      .where(eq(templateFields.templateSectionId, sectionId));
    const fieldIds = fields.map((field) => field.id);
    if (fieldIds.length) {
      await tx
        .delete(templateFieldOptions)
        .where(inArray(templateFieldOptions.templateFieldId, fieldIds));
      await tx
        .delete(templateFields)
        .where(eq(templateFields.templateSectionId, sectionId));
    }
    await tx
      .delete(templateSections)
      .where(eq(templateSections.id, sectionId));
    return section;
  });
}

export async function duplicateTemplateSection(sectionId: string) {
  const { section } = await requireDraftSection(sectionId);
  const fields = await db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateSectionId, sectionId));
  const fieldIds = fields.map((field) => field.id);
  const options = fieldIds.length
    ? await db
        .select()
        .from(templateFieldOptions)
        .where(inArray(templateFieldOptions.templateFieldId, fieldIds))
    : [];
  const siblingSections = await db
    .select({ sortOrder: templateSections.sortOrder })
    .from(templateSections)
    .where(eq(templateSections.templateVersionId, section.templateVersionId));
  const nextSortOrder =
    Math.max(-1, ...siblingSections.map((item) => item.sortOrder)) + 1;
  return db.transaction(async (tx) => {
    const [createdSection] = await tx
      .insert(templateSections)
      .values({
        templateVersionId: section.templateVersionId,
        key: copyKey(section.key),
        labelEn: `${section.labelEn} (copy)`,
        labelZh: `${section.labelZh}（副本）`,
        helpTextEn: section.helpTextEn,
        helpTextZh: section.helpTextZh,
        sortOrder: nextSortOrder,
        configuration: section.configuration,
      })
      .returning();
    for (const field of fields) {
      const [createdField] = await tx
        .insert(templateFields)
        .values({
          templateSectionId: createdSection.id,
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
        })
        .returning();
      const fieldOptions = options.filter(
        (option) => option.templateFieldId === field.id,
      );
      if (fieldOptions.length)
        await tx.insert(templateFieldOptions).values(
          fieldOptions.map((option) => ({
            templateFieldId: createdField.id,
            key: option.key,
            labelEn: option.labelEn,
            labelZh: option.labelZh,
            helpTextEn: option.helpTextEn,
            helpTextZh: option.helpTextZh,
            status: option.status,
            sortOrder: option.sortOrder,
            canonicalRegistryItemId: option.canonicalRegistryItemId,
            configuration: option.configuration,
          })),
        );
    }
    return createdSection;
  });
}

export async function updateTemplateField(
  fieldId: string,
  input: TemplateFieldUpdateInput,
) {
  const current = await requireDraftField(fieldId);
  const { templateSectionId, ...values } = input;
  let movedSortOrder: number | undefined;
  if (templateSectionId && templateSectionId !== current.section.id) {
    const target = await requireDraftSection(templateSectionId);
    if (target.version.id !== current.version.id)
      throw new Error("A field can only move within the same template version");
    const targetFields = await db
      .select({ sortOrder: templateFields.sortOrder })
      .from(templateFields)
      .where(eq(templateFields.templateSectionId, templateSectionId));
    movedSortOrder =
      Math.max(-1, ...targetFields.map((field) => field.sortOrder)) + 1;
  }
  if (values.fieldTypeKey || values.validation !== undefined) {
    const resource = await getTemplateAuthorizationResource("field", fieldId);
    const fieldType = await requireActiveRegistryItem(
      "collection_field_type",
      values.fieldTypeKey ?? current.field.fieldTypeKey,
      resource?.organizationId,
    );
    assertFieldValidation(
      fieldType.metadata,
      values.validation ?? current.field.validation,
      `Field ${values.key ?? current.field.key}`,
    );
  }
  const [field] = await db
    .update(templateFields)
    .set({
      ...values,
      ...(templateSectionId ? { templateSectionId } : {}),
      ...(movedSortOrder === undefined ? {} : { sortOrder: movedSortOrder }),
      updatedAt: new Date(),
    })
    .where(eq(templateFields.id, fieldId))
    .returning();
  return { existing: current.field, field };
}

function assertFieldValidation(
  metadata: unknown,
  validation: unknown,
  owner: string,
) {
  const control = configuredFormControl(
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : undefined,
  );
  const error = formFieldValidationError(control, validationRecord(validation));
  if (error) throw new Error(`${owner}: ${error}`);
}

function validationRecord(validation: unknown): Record<string, unknown> {
  return validation && typeof validation === "object" && !Array.isArray(validation)
    ? (validation as Record<string, unknown>)
    : {};
}

export async function deleteTemplateField(fieldId: string) {
  const { field } = await requireDraftField(fieldId);
  return db.transaction(async (tx) => {
    await tx
      .delete(templateFieldOptions)
      .where(eq(templateFieldOptions.templateFieldId, fieldId));
    await tx.delete(templateFields).where(eq(templateFields.id, fieldId));
    return field;
  });
}

export async function duplicateTemplateField(fieldId: string) {
  const { field } = await requireDraftField(fieldId);
  const options = await db
    .select()
    .from(templateFieldOptions)
    .where(eq(templateFieldOptions.templateFieldId, fieldId));
  const siblings = await db
    .select({ sortOrder: templateFields.sortOrder })
    .from(templateFields)
    .where(eq(templateFields.templateSectionId, field.templateSectionId));
  const nextSortOrder =
    Math.max(-1, ...siblings.map((item) => item.sortOrder)) + 1;
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(templateFields)
      .values({
        templateSectionId: field.templateSectionId,
        key: copyKey(field.key),
        fieldTypeKey: field.fieldTypeKey,
        labelEn: `${field.labelEn} (copy)`,
        labelZh: `${field.labelZh}（副本）`,
        helpTextEn: field.helpTextEn,
        helpTextZh: field.helpTextZh,
        placeholderEn: field.placeholderEn,
        placeholderZh: field.placeholderZh,
        required: field.required,
        allowMissingReason: field.allowMissingReason,
        allowCustomEntry: field.allowCustomEntry,
        sortOrder: nextSortOrder,
        validation: field.validation,
        visibilityConditions: field.visibilityConditions,
        branchingLogic: field.branchingLogic,
        canonicalMapping: field.canonicalMapping,
        configuration: field.configuration,
      })
      .returning();
    if (options.length)
      await tx.insert(templateFieldOptions).values(
        options.map((option) => ({
          templateFieldId: created.id,
          key: option.key,
          labelEn: option.labelEn,
          labelZh: option.labelZh,
          helpTextEn: option.helpTextEn,
          helpTextZh: option.helpTextZh,
          status: option.status,
          sortOrder: option.sortOrder,
          canonicalRegistryItemId: option.canonicalRegistryItemId,
          configuration: option.configuration,
        })),
      );
    return created;
  });
}

export async function updateTemplateFieldOption(
  optionId: string,
  input: TemplateFieldOptionUpdateInput,
) {
  const existing = (
    await db
      .select()
      .from(templateFieldOptions)
      .where(eq(templateFieldOptions.id, optionId))
      .limit(1)
  )[0];
  if (!existing) throw new Error("Option not found");
  await requireDraftField(existing.templateFieldId);
  const [option] = await db
    .update(templateFieldOptions)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(templateFieldOptions.id, optionId))
    .returning();
  return { existing, option };
}

export async function archiveTemplateFieldOption(optionId: string) {
  return updateTemplateFieldOption(optionId, { status: "archived" });
}

export async function reorderTemplateSections(
  versionId: string,
  orderedIds: string[],
) {
  await requireDraftVersion(versionId);
  const rows = await db
    .select({ id: templateSections.id })
    .from(templateSections)
    .where(eq(templateSections.templateVersionId, versionId));
  assertSameIds(
    rows.map((row) => row.id),
    orderedIds,
  );
  return db.transaction(async (tx) => {
    const updated = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [section] = await tx
        .update(templateSections)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(templateSections.id, id))
        .returning();
      updated.push(section);
    }
    return updated;
  });
}

export async function reorderTemplateFields(
  sectionId: string,
  orderedIds: string[],
) {
  await requireDraftSection(sectionId);
  const rows = await db
    .select({ id: templateFields.id })
    .from(templateFields)
    .where(eq(templateFields.templateSectionId, sectionId));
  assertSameIds(
    rows.map((row) => row.id),
    orderedIds,
  );
  return db.transaction(async (tx) => {
    const updated = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [field] = await tx
        .update(templateFields)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(templateFields.id, id))
        .returning();
      updated.push(field);
    }
    return updated;
  });
}

export async function reorderTemplateFieldOptions(
  fieldId: string,
  orderedIds: string[],
) {
  await requireDraftField(fieldId);
  const rows = await db
    .select({ id: templateFieldOptions.id })
    .from(templateFieldOptions)
    .where(
      and(
        eq(templateFieldOptions.templateFieldId, fieldId),
        ne(templateFieldOptions.status, "archived"),
      ),
    );
  assertSameIds(
    rows.map((row) => row.id),
    orderedIds,
  );
  return db.transaction(async (tx) => {
    const updated = [];
    for (const [sortOrder, id] of orderedIds.entries()) {
      const [option] = await tx
        .update(templateFieldOptions)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(templateFieldOptions.id, id))
        .returning();
      updated.push(option);
    }
    return updated;
  });
}
