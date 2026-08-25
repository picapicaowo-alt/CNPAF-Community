export type FormVersionChangeType =
  | "added"
  | "removed"
  | "modified"
  | "moved";

export type FormVersionEntityType = "version" | "section" | "field" | "option";

export type FormVersionChange = {
  changeType: FormVersionChangeType;
  entityType: FormVersionEntityType;
  key: string;
  labelEn: string;
  labelZh: string;
  parentKey?: string;
  details: string[];
};

export type FormVersionSnapshot = {
  version: {
    id: string;
    version: number;
    nameEn: string;
    nameZh: string;
    descriptionEn?: string | null;
    descriptionZh?: string | null;
    configuration?: Record<string, unknown>;
  };
  sections: Array<{
    id: string;
    key: string;
    labelEn: string;
    labelZh: string;
    helpTextEn?: string | null;
    helpTextZh?: string | null;
    sortOrder: number;
    configuration?: Record<string, unknown>;
  }>;
  fields: Array<{
    id: string;
    templateSectionId: string;
    key: string;
    fieldTypeKey: string;
    labelEn: string;
    labelZh: string;
    helpTextEn?: string | null;
    helpTextZh?: string | null;
    placeholderEn?: string | null;
    placeholderZh?: string | null;
    required: boolean;
    allowMissingReason: boolean;
    allowCustomEntry: boolean;
    sortOrder: number;
    validation?: unknown;
    visibilityConditions?: unknown;
    branchingLogic?: unknown;
    configuration?: Record<string, unknown>;
  }>;
  options: Array<{
    id: string;
    templateFieldId: string;
    key: string;
    labelEn: string;
    labelZh: string;
    helpTextEn?: string | null;
    helpTextZh?: string | null;
    status: string;
    sortOrder: number;
    configuration?: Record<string, unknown>;
  }>;
};

export type FormVersionComparison = {
  from: { id: string; version: number; nameEn: string; nameZh: string };
  to: { id: string; version: number; nameEn: string; nameZh: string };
  summary: Record<FormVersionChangeType, number>;
  changes: FormVersionChange[];
};

export function compareFormVersionSnapshots(
  from: FormVersionSnapshot,
  to: FormVersionSnapshot,
): FormVersionComparison {
  const changes: FormVersionChange[] = [];
  const versionDetails = changedProperties(
    versionValues(from.version),
    versionValues(to.version),
  );
  if (versionDetails.length)
    changes.push({
      changeType: "modified",
      entityType: "version",
      key: "version-metadata",
      labelEn: "Version information",
      labelZh: "版本信息",
      details: versionDetails,
    });

  const fromSections = new Map(from.sections.map((section) => [section.key, section]));
  const toSections = new Map(to.sections.map((section) => [section.key, section]));
  compareCollections({
    changes,
    entityType: "section",
    fromItems: fromSections,
    toItems: toSections,
    values: sectionValues,
  });

  const fromSectionKeyById = new Map(
    from.sections.map((section) => [section.id, section.key]),
  );
  const toSectionKeyById = new Map(
    to.sections.map((section) => [section.id, section.key]),
  );
  const fromFields = new Map(from.fields.map((field) => [field.key, field]));
  const toFields = new Map(to.fields.map((field) => [field.key, field]));
  compareCollections({
    changes,
    entityType: "field",
    fromItems: fromFields,
    toItems: toFields,
    parentKey: (field, side) =>
      (side === "from" ? fromSectionKeyById : toSectionKeyById).get(
        field.templateSectionId,
      ),
    values: fieldValues,
  });

  const fromFieldKeyById = new Map(
    from.fields.map((field) => [field.id, field.key]),
  );
  const toFieldKeyById = new Map(to.fields.map((field) => [field.id, field.key]),
  );
  const optionIdentity = (
    option: FormVersionSnapshot["options"][number],
    fieldKeyById: Map<string, string>,
  ) => `${fieldKeyById.get(option.templateFieldId) ?? "unknown"}:${option.key}`;
  const fromOptions = new Map(
    from.options.map((option) => [optionIdentity(option, fromFieldKeyById), option]),
  );
  const toOptions = new Map(
    to.options.map((option) => [optionIdentity(option, toFieldKeyById), option]),
  );
  compareCollections({
    changes,
    entityType: "option",
    fromItems: fromOptions,
    toItems: toOptions,
    parentKey: (option, side) =>
      (side === "from" ? fromFieldKeyById : toFieldKeyById).get(
        option.templateFieldId,
      ),
    values: optionValues,
  });

  const summary: FormVersionComparison["summary"] = {
    added: 0,
    removed: 0,
    modified: 0,
    moved: 0,
  };
  for (const change of changes) summary[change.changeType] += 1;
  return {
    from: versionIdentity(from.version),
    to: versionIdentity(to.version),
    summary,
    changes,
  };
}

function compareCollections<
  Item extends {
    key: string;
    labelEn: string;
    labelZh: string;
    sortOrder: number;
  },
>({
  changes,
  entityType,
  fromItems,
  parentKey,
  toItems,
  values,
}: {
  changes: FormVersionChange[];
  entityType: Exclude<FormVersionEntityType, "version">;
  fromItems: Map<string, Item>;
  parentKey?: (item: Item, side: "from" | "to") => string | undefined;
  toItems: Map<string, Item>;
  values: (item: Item) => Record<string, unknown>;
}) {
  const allKeys = new Set([...fromItems.keys(), ...toItems.keys()]);
  for (const key of [...allKeys].sort()) {
    const before = fromItems.get(key);
    const after = toItems.get(key);
    if (!before && after) {
      changes.push({
        changeType: "added",
        entityType,
        key,
        labelEn: after.labelEn,
        labelZh: after.labelZh,
        parentKey: parentKey?.(after, "to"),
        details: [],
      });
      continue;
    }
    if (before && !after) {
      changes.push({
        changeType: "removed",
        entityType,
        key,
        labelEn: before.labelEn,
        labelZh: before.labelZh,
        parentKey: parentKey?.(before, "from"),
        details: [],
      });
      continue;
    }
    if (!before || !after) continue;
    const beforeParent = parentKey?.(before, "from");
    const afterParent = parentKey?.(after, "to");
    const moved =
      beforeParent !== afterParent || before.sortOrder !== after.sortOrder;
    if (moved)
      changes.push({
        changeType: "moved",
        entityType,
        key,
        labelEn: after.labelEn,
        labelZh: after.labelZh,
        parentKey: afterParent,
        details: beforeParent !== afterParent ? ["parentKey", "sortOrder"] : ["sortOrder"],
      });
    const details = changedProperties(values(before), values(after)).filter(
      (property) => property !== "sortOrder",
    );
    if (details.length)
      changes.push({
        changeType: "modified",
        entityType,
        key,
        labelEn: after.labelEn,
        labelZh: after.labelZh,
        parentKey: afterParent,
        details,
      });
  }
}

function versionIdentity(version: FormVersionSnapshot["version"]) {
  return {
    id: version.id,
    version: version.version,
    nameEn: version.nameEn,
    nameZh: version.nameZh,
  };
}

function versionValues(version: FormVersionSnapshot["version"]) {
  const configuration = { ...(version.configuration ?? {}) };
  delete configuration.releaseNotes;
  return {
    nameEn: version.nameEn,
    nameZh: version.nameZh,
    descriptionEn: version.descriptionEn,
    descriptionZh: version.descriptionZh,
    configuration,
  };
}

function sectionValues(section: FormVersionSnapshot["sections"][number]) {
  return {
    labelEn: section.labelEn,
    labelZh: section.labelZh,
    helpTextEn: section.helpTextEn,
    helpTextZh: section.helpTextZh,
    sortOrder: section.sortOrder,
    configuration: section.configuration,
  };
}

function fieldValues(field: FormVersionSnapshot["fields"][number]) {
  return {
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
    configuration: field.configuration,
  };
}

function optionValues(option: FormVersionSnapshot["options"][number]) {
  return {
    labelEn: option.labelEn,
    labelZh: option.labelZh,
    helpTextEn: option.helpTextEn,
    helpTextZh: option.helpTextZh,
    status: option.status,
    sortOrder: option.sortOrder,
    configuration: option.configuration,
  };
}

function changedProperties(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const properties = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...properties].filter(
    (property) => stableJson(before[property]) !== stableJson(after[property]),
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
