import { z } from "zod";
import { reviewBodySchema, uuidSchema } from "./contracts";

export const permissionEffectSchema = z.enum(["allow", "deny"]);
export const scopeReferenceSchema = z.object({
  scopeType: z.string().min(1).max(80),
  scopeId: uuidSchema.nullable().optional(),
  scopeKey: z.string().min(1).max(160).nullable().optional(),
  effect: permissionEffectSchema.default("allow"),
  permissionKey: z.string().min(1).max(160).nullable().optional(),
  roleAssignmentId: uuidSchema.nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
}).strict();
export const scopeReferenceUpdateSchema = scopeReferenceSchema.partial();

export const roleAssignmentInputSchema = z.object({
  roleId: uuidSchema.optional(),
  roleKey: z.string().min(1).max(120).optional(),
  organizationId: uuidSchema.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).strict().refine((value) => value.roleId || value.roleKey, { message: "roleId or roleKey is required" });

export const permissionOverrideInputSchema = z.object({
  permissionId: uuidSchema.optional(),
  permissionKey: z.string().min(1).max(160).optional(),
  effect: permissionEffectSchema,
  scopeType: z.string().min(1).max(80).nullable().optional(),
  scopeId: uuidSchema.nullable().optional(),
  scopeKey: z.string().min(1).max(160).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).strict().refine((value) => value.permissionId || value.permissionKey, {
  message: "permissionId or permissionKey is required",
});

export const replaceUserAccessBodySchema = z.object({
  roleAssignments: z.array(roleAssignmentInputSchema).default([]),
  scopeAssignments: z.array(scopeReferenceSchema).default([]),
  scopes: z
    .object({
      organizationIds: z.array(uuidSchema).default([]),
      programIds: z.array(uuidSchema).default([]),
      siteIds: z.array(uuidSchema).default([]),
      locationIds: z.array(uuidSchema).default([]),
      serviceIds: z.array(uuidSchema).default([]),
      serviceKeys: z.array(z.string().min(1)).default([]),
      templateIds: z.array(uuidSchema).default([]),
      formIds: z.array(uuidSchema).default([]),
      dataClasses: z.array(z.string().min(1)).default([]),
      researchUse: z.array(z.string().min(1)).default([]),
    })
    .partial()
    .strict()
    .optional(),
  overrides: z.array(permissionOverrideInputSchema).default([]),
  reason: z.string().max(2000).nullable().optional(),
}).strict();

export const roleCreateBodySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(120),
  nameEn: z.string().min(1).max(160),
  nameZh: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  organizationId: uuidSchema.nullable().optional(),
  permissionKeys: z.array(z.string().min(1)).default([]),
}).strict();

export const roleUpdateBodySchema = roleCreateBodySchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
}).strict();

export const adminUserUpdateBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(20).optional(),
  status: z.enum(["active", "inactive"]).optional(),
}).strict();

export const registryCreateBodySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(120),
  nameEn: z.string().min(1).max(160),
  nameZh: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  handlerKey: z.string().max(120).nullable().optional(),
});

export const registryItemBodySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(160),
  labelEn: z.string().min(1).max(240),
  labelZh: z.string().min(1).max(240),
  helpTextEn: z.string().max(4000).nullable().optional(),
  helpTextZh: z.string().max(4000).nullable().optional(),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.unknown()).default({}),
  canonicalItemId: uuidSchema.nullable().optional(),
  organizationId: uuidSchema.nullable().optional(),
});

export const registryItemUpdateBodySchema = registryItemBodySchema.partial().extend({
  publishNewVersion: z.boolean().default(false),
});

export const templateCreateBodySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(160),
  templateTypeKey: z.string().min(1).max(120),
  organizationId: uuidSchema.nullable().optional(),
  nameEn: z.string().min(1).max(240),
  nameZh: z.string().min(1).max(240),
  descriptionEn: z.string().max(4000).nullable().optional(),
  descriptionZh: z.string().max(4000).nullable().optional(),
  configuration: z.record(z.unknown()).default({}),
});

export const templateVersionCreateBodySchema = z.object({
  fromVersionId: uuidSchema.nullable().optional(),
  nameEn: z.string().min(1).max(240).optional(),
  nameZh: z.string().min(1).max(240).optional(),
  descriptionEn: z.string().max(4000).nullable().optional(),
  descriptionZh: z.string().max(4000).nullable().optional(),
  configuration: z.record(z.unknown()).optional(),
});

export const templateVersionUpdateBodySchema = z.object({
  nameEn: z.string().min(1).max(240).optional(),
  nameZh: z.string().min(1).max(240).optional(),
  descriptionEn: z.string().max(4000).nullable().optional(),
  descriptionZh: z.string().max(4000).nullable().optional(),
  configuration: z.record(z.unknown()).optional(),
});

export const templateSectionBodySchema = z.object({
  key: z.string().min(1).max(160),
  labelEn: z.string().min(1).max(240),
  labelZh: z.string().min(1).max(240),
  helpTextEn: z.string().max(4000).nullable().optional(),
  helpTextZh: z.string().max(4000).nullable().optional(),
  sortOrder: z.number().int().default(0),
  configuration: z.record(z.unknown()).default({}),
});

export const templateFieldBodySchema = z.object({
  key: z.string().min(1).max(160),
  fieldTypeKey: z.string().min(1).max(120),
  labelEn: z.string().min(1).max(240),
  labelZh: z.string().min(1).max(240),
  helpTextEn: z.string().max(4000).nullable().optional(),
  helpTextZh: z.string().max(4000).nullable().optional(),
  placeholderEn: z.string().max(1000).nullable().optional(),
  placeholderZh: z.string().max(1000).nullable().optional(),
  required: z.boolean().default(false),
  allowMissingReason: z.boolean().default(false),
  allowCustomEntry: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  validation: z.record(z.unknown()).default({}),
  visibilityConditions: z.array(z.unknown()).default([]),
  branchingLogic: z.array(z.unknown()).default([]),
  canonicalMapping: z.record(z.unknown()).default({}),
  configuration: z.record(z.unknown()).default({}),
});

export const templateFieldOptionBodySchema = z.object({
  key: z.string().min(1).max(160),
  labelEn: z.string().min(1).max(240),
  labelZh: z.string().min(1).max(240),
  helpTextEn: z.string().max(4000).nullable().optional(),
  helpTextZh: z.string().max(4000).nullable().optional(),
  status: z.enum(["active", "draft", "archived"]).default("draft"),
  sortOrder: z.number().int().default(0),
  canonicalRegistryItemId: uuidSchema.nullable().optional(),
  configuration: z.record(z.unknown()).default({}),
});

export const privacyResolveBodySchema = z.object({
  resolution: z.enum(["clear", "redacted", "dismissed"]),
  redactedText: z.string().max(100_000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const safetyResolveBodySchema = z.object({
  resolution: z.enum(["resolved", "dismissed", "escalated"]),
  notes: z.string().max(4000).nullable().optional(),
});

export const customEntryDecisionBodySchema = z.object({
  canonicalOptionId: uuidSchema.nullable().optional(),
  registryKey: z.string().min(1).max(120).optional(),
  newOption: registryItemBodySchema.optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export const aiReclassifyBodySchema = z.object({
  reviewerInstruction: z.string().min(1).max(10_000),
  workflowVersionId: uuidSchema.nullable().optional(),
  idempotencyKey: z.string().min(8).max(160),
});

export const aiFindingReviewBodySchema = z.object({
  decision: z.enum(["approve", "edit", "dismiss", "re_run_requested"]),
  editedStatement: z.string().max(20_000).nullable().optional(),
  canonicalRegistryItemId: uuidSchema.nullable().optional(),
  reviewerNotes: z.string().max(4000).nullable().optional(),
}).strict().refine((value) => value.decision !== "edit" || Boolean(value.editedStatement?.trim()), {
  message: "editedStatement is required when decision is edit",
  path: ["editedStatement"],
}).refine((value) => value.decision !== "re_run_requested" || Boolean(value.reviewerNotes?.trim()), {
  message: "reviewerNotes is required when decision requests a re-run",
  path: ["reviewerNotes"],
});

export const aiWorkflowBodySchema = z.object({
  key: z.string().min(1).max(160),
  nameEn: z.string().min(1).max(240),
  nameZh: z.string().min(1).max(240),
  workflowTypeKey: z.string().min(1).max(120),
});

export const aiWorkflowVersionBodySchema = z.object({
  promptVersionId: uuidSchema.nullable().optional(),
  outputSchemaVersionId: uuidSchema.nullable().optional(),
  providerConfigId: uuidSchema.nullable().optional(),
  modelConfigId: uuidSchema.nullable().optional(),
  triggerRules: z.record(z.unknown()).default({}),
  permittedInputs: z.record(z.unknown()).default({}),
  privacyRequirements: z.record(z.unknown()).default({}),
  retryPolicy: z.record(z.unknown()).default({}),
  costCeiling: z.number().nonnegative().nullable().optional(),
  humanApprovalRequired: z.boolean().default(true),
  featureFlags: z.record(z.unknown()).default({}),
});

export const aiWorkflowVersionUpdateBodySchema = aiWorkflowVersionBodySchema.partial();

export const promptVersionBodySchema = z.object({
  version: z.number().int().positive().optional(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  outputSchemaVersion: z.string().min(1).max(120),
  systemPrompt: z.string().min(1).max(100_000),
});

export const outputSchemaVersionBodySchema = z.object({
  key: z.string().min(1).max(160),
  version: z.number().int().positive().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  schema: z.record(z.unknown()),
});
export const outputSchemaVersionUpdateBodySchema = outputSchemaVersionBodySchema.omit({ key: true, version: true }).partial();

export const aiProviderConfigBodySchema = z.object({
  key: z.string().min(1).max(160),
  displayName: z.string().min(1).max(240),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  configuration: z.record(z.unknown()).default({}),
});
export const aiProviderConfigUpdateBodySchema = aiProviderConfigBodySchema.partial();

export const aiModelConfigBodySchema = z.object({
  providerConfigId: uuidSchema,
  key: z.string().min(1).max(160),
  modelName: z.string().min(1).max(240),
  status: z.enum(["active", "inactive", "archived"]).default("active"),
  configuration: z.record(z.unknown()).default({}),
});
export const aiModelConfigUpdateBodySchema = aiModelConfigBodySchema.omit({ providerConfigId: true }).partial();

const reportDateSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid ISO date");

export const reportFiltersSchema = z.object({
  dateFrom: reportDateSchema.optional(),
  dateTo: reportDateSchema.optional(),
  organizationIds: z.array(uuidSchema).max(500).optional(),
  programIds: z.array(uuidSchema).max(500).optional(),
  siteIds: z.array(uuidSchema).max(500).optional(),
  locationIds: z.array(uuidSchema).max(500).optional(),
  serviceTypeKeys: z.array(z.string().min(1).max(120)).max(100).optional(),
  populationKeys: z.array(z.string().min(1).max(160)).max(500).optional(),
  sourceOrigins: z.array(z.string().min(1).max(120)).max(100).optional(),
  templateVersionIds: z.array(uuidSchema).max(500).optional(),
  formVersionIds: z.array(uuidSchema).max(500).optional(),
  collectorIds: z.array(uuidSchema).max(500).optional(),
  reviewStatuses: z.array(z.string().min(1).max(120)).max(100).optional(),
  researchUseStatuses: z.array(z.string().min(1).max(120)).max(100).optional(),
  findingTypes: z.array(z.string().min(1).max(120)).max(100).optional(),
  themeOrConcernIds: z.array(uuidSchema).max(500).optional(),
}).strict().refine(
  (filters) => !filters.dateFrom || !filters.dateTo || Date.parse(filters.dateFrom) <= Date.parse(filters.dateTo),
  { message: "dateFrom must be before or equal to dateTo" },
);

export const reportEvidencePolicySchema = z.object({
  approvedOnly: z.literal(true).default(true),
  researchUseEligible: z.boolean().default(true),
}).strict();

export const reportRunBodySchema = z.object({
  reportTemplateVersionId: uuidSchema,
  workflowVersionId: uuidSchema.nullable().optional(),
  filters: reportFiltersSchema.default({}),
  evidencePolicy: reportEvidencePolicySchema.default({ approvedOnly: true, researchUseEligible: true }),
});

export const reportApprovalBodySchema = z.object({
  decision: z.enum(["approve", "archive"]),
  notes: z.string().max(4000).nullable().optional(),
});

export const reportAiOutputSchema = z.object({
  title: z.string().min(1).max(500),
  executiveSummary: z.string().min(1).max(20_000),
  sections: z.array(z.object({
    key: z.string().min(1).max(160),
    title: z.string().min(1).max(500),
    body: z.string().max(40_000),
  })).max(100),
  citations: z.array(uuidSchema).max(10_000),
});

export const reportTemplateBodySchema = z.object({
  key: z.string().min(1).max(160),
  nameEn: z.string().min(1).max(240),
  nameZh: z.string().min(1).max(240),
  reportTypeKey: z.string().min(1).max(160),
});

export const reportTemplateVersionBodySchema = z.object({
  fromVersionId: uuidSchema.nullable().optional(),
  sections: z.array(z.unknown()).default([]),
  configuration: z.record(z.unknown()).default({}),
});
export const reportTemplateVersionUpdateBodySchema = reportTemplateVersionBodySchema.omit({ fromVersionId: true }).partial();

export const askConversationBodySchema = z.object({
  title: z.string().max(240).nullable().optional(),
  scope: reportFiltersSchema.default({}),
}).strict();

export const askMessageBodySchema = z.object({
  content: z.string().min(1).max(40_000),
});

export const askAiOutputSchema = z.object({
  answer: z.string().min(1).max(40_000),
  citations: z.array(z.object({
    sourceId: uuidSchema,
    claim: z.string().min(1).max(4000),
  })).max(100),
});

export const exportJobBodySchema = z.object({
  exportTypeKey: z.string().min(1).max(120),
  scope: reportFiltersSchema.default({}),
  filters: reportFiltersSchema.default({}),
  dataClassification: z.string().min(1).max(120).default("approved_evidence"),
}).strict();

export const programCreateBodySchema = z.object({
  organizationId: uuidSchema,
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(120),
  nameEn: z.string().min(1).max(240),
  nameZh: z.string().min(1).max(240),
  descriptionEn: z.string().max(10_000).nullable().optional(),
  descriptionZh: z.string().max(10_000).nullable().optional(),
  status: z.enum(["draft", "active"]).default("active"),
  configuration: z.record(z.unknown()).default({}),
}).strict();
export const programUpdateBodySchema = programCreateBodySchema.omit({ organizationId: true, key: true }).partial().extend({
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
}).strict();

export const programMembershipBodySchema = z.object({
  userId: uuidSchema,
  membershipRoleKey: z.string().min(1).max(120),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).strict().refine(
  (value) => !value.startsAt || !value.endsAt || Date.parse(value.startsAt) < Date.parse(value.endsAt),
  { message: "endsAt must be after startsAt", path: ["endsAt"] },
);

export const affiliationBodySchema = z.object({
  organizationId: uuidSchema.nullable().optional(),
  programId: uuidSchema.nullable().optional(),
  affiliationTypeKey: z.string().min(1).max(120),
  institutionName: z.string().min(1).max(500),
  institutionTypeKey: z.string().max(120).nullable().optional(),
  departmentName: z.string().max(500).nullable().optional(),
  title: z.string().max(240).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
  isPrimary: z.boolean().default(false),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).strict();

const taskBodyBaseSchema = z.object({
  programId: uuidSchema,
  templateVersionId: uuidSchema,
  siteId: uuidSchema.nullable().optional(),
  taskTypeKey: z.string().min(1).max(120),
  title: z.string().min(1).max(500),
  instructions: z.string().max(20_000).nullable().optional(),
  priority: z.number().int().min(-100).max(100).default(0),
  dueAt: z.string().datetime().nullable().optional(),
  opensAt: z.string().datetime().nullable().optional(),
  closesAt: z.string().datetime().nullable().optional(),
  configuration: z.record(z.unknown()).default({}),
}).strict();
export const taskCreateBodySchema = taskBodyBaseSchema.refine(
  (value) => !value.opensAt || !value.closesAt || Date.parse(value.opensAt) < Date.parse(value.closesAt),
  { message: "closesAt must be after opensAt", path: ["closesAt"] },
);
export const taskUpdateBodySchema = taskBodyBaseSchema.omit({ programId: true, templateVersionId: true }).partial().extend({
  status: z.enum(["draft", "open", "closed", "cancelled", "archived"]).optional(),
}).strict();
export const taskAssignmentBodySchema = z.object({
  assigneeIds: z.array(uuidSchema).min(1).max(500),
  notes: z.string().max(4000).nullable().optional(),
}).strict();
export const taskAssignmentTransitionBodySchema = z.object({
  status: z.enum(["in_progress", "completed", "declined", "cancelled"]),
  recordId: uuidSchema.nullable().optional(),
  declineReason: z.string().max(4000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
}).strict().refine((value) => value.status !== "declined" || Boolean(value.declineReason?.trim()), {
  message: "declineReason is required when declining an assignment",
  path: ["declineReason"],
});

export const notificationPreferenceBodySchema = z.object({
  kindKey: z.string().min(1).max(120),
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
}).strict();

export const manualAccountCreateBodySchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  organizationId: uuidSchema.nullable().optional(),
  locale: z.string().min(2).max(20).default("zh"),
  temporaryPassword: z.string().min(12).max(200).optional(),
  requirePasswordChange: z.boolean().default(true),
  roleAssignments: z.array(roleAssignmentInputSchema).min(1).max(20),
  // A role assignment does not exist until this account is created. Initial
  // scopes therefore apply to the new user as a whole and cannot reference an
  // arbitrary pre-existing role assignment ID.
  scopeAssignments: z.array(scopeReferenceSchema.omit({ roleAssignmentId: true })).max(500).default([]),
  affiliations: z.array(affiliationBodySchema).max(100).default([]),
  programMemberships: z.array(z.object({
    programId: uuidSchema,
    membershipRoleKey: z.string().min(1).max(120),
  }).strict()).max(100).default([]),
}).strict();
export const resetPasswordBodySchema = z.object({
  temporaryPassword: z.string().min(12).max(200).optional(),
  reason: z.string().min(1).max(2000),
}).strict();

export const reportSectionInputSchema = z.object({
  sectionKey: z.string().min(1).max(160),
  title: z.string().min(1).max(500),
  content: z.string().max(100_000).default(""),
  sortOrder: z.number().int().default(0),
}).strict();
export const reportSectionDuplicateBodySchema = z.object({
  sectionKey: z.string().min(1).max(160).optional(),
  title: z.string().min(1).max(500).optional(),
}).strict();
export const editableReportCreateBodySchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema.nullable().optional(),
  reportTemplateVersionId: uuidSchema.nullable().optional(),
  sourceReportArtifactId: uuidSchema.nullable().optional(),
  title: z.string().min(1).max(500),
  filters: reportFiltersSchema.default({}),
  evidencePolicy: reportEvidencePolicySchema.default({ approvedOnly: true, researchUseEligible: true }),
  sections: z.array(reportSectionInputSchema).min(1).max(200),
}).strict().refine((value) => new Set(value.sections.map((section) => section.sectionKey)).size === value.sections.length, {
  message: "sectionKey values must be unique",
  path: ["sections"],
});
export const editableReportUpdateBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  programId: uuidSchema.nullable().optional(),
  status: z.enum(["draft", "archived"]).optional(),
}).strict();
export const editableReportVersionBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  changeSummary: z.string().max(4000).nullable().optional(),
  filters: reportFiltersSchema.optional(),
  evidencePolicy: reportEvidencePolicySchema.optional(),
  sections: z.array(reportSectionInputSchema).min(1).max(200),
}).strict().refine((value) => new Set(value.sections.map((section) => section.sectionKey)).size === value.sections.length, {
  message: "sectionKey values must be unique",
  path: ["sections"],
});
export const editableReportVersionUpdateBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  changeSummary: z.string().max(4000).nullable().optional(),
}).strict();
export const reportSectionUpdateBodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().max(100_000).optional(),
  sortOrder: z.number().int().optional(),
  aiSuggestionAction: z.enum(["accept", "dismiss"]).optional(),
}).strict();
export const reportSectionAiDraftBodySchema = z.object({
  instruction: z.string().min(1).max(10_000),
  workflowVersionId: uuidSchema.nullable().optional(),
  idempotencyKey: z.string().min(8).max(160),
}).strict();
export const reportSectionReorderBodySchema = z.object({
  sortOrder: z.number().int(),
}).strict();

export const datasetFieldKeySchema = z.enum([
  "structured_answers",
  "approved_findings",
  "evidence_excerpts",
  "collector_notes",
  "form_version_information",
  "audit_metadata",
  "personal_fields",
]);
export const datasetFieldPolicySchema = z.object({
  include: z.array(datasetFieldKeySchema).max(1000).default([]),
  exclude: z.array(datasetFieldKeySchema).max(1000).default([]),
  redactionProfileKey: z.string().min(1).max(120).nullable().optional(),
}).strict();
export const datasetSelectionSchema = z.object({
  recordIds: z.array(uuidSchema).min(1).max(10_000).optional(),
  filters: reportFiltersSchema.optional(),
}).strict().refine((value) => value.recordIds?.length || value.filters, {
  message: "recordIds or filters is required",
});
export const datasetCreateBodySchema = z.object({
  organizationId: uuidSchema,
  programId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(10_000).nullable().optional(),
  dataClassification: z.string().min(1).max(120).default("approved_evidence"),
  selection: datasetSelectionSchema,
  fieldPolicy: datasetFieldPolicySchema.default({ include: [], exclude: [] }),
}).strict();
export const datasetRefreshBodySchema = z.object({
  selection: datasetSelectionSchema.optional(),
  fieldPolicy: datasetFieldPolicySchema.optional(),
}).strict();
export const datasetShareBodySchema = z.object({
  datasetVersionId: uuidSchema.nullable().optional(),
  recipientLabel: z.string().max(500).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  accessScope: z.object({
    userIds: z.array(uuidSchema).max(500).optional(),
    organizationIds: z.array(uuidSchema).max(100).optional(),
  }).strict().default({}),
}).strict();
export const recordShareBodySchema = z.object({
  recordVersionId: uuidSchema.nullable().optional(),
  recipientLabel: z.string().max(500).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  fieldPolicy: datasetFieldPolicySchema.default({ include: [], exclude: [] }),
}).strict();
export const dataDownloadBodySchema = z.object({
  format: z.enum(["json", "csv", "pdf"]),
  versionId: uuidSchema.nullable().optional(),
  fieldPolicy: datasetFieldPolicySchema.optional(),
}).strict();
export const locationCreateBodySchema = z.object({
  organizationId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(500),
  siteType: z.string().min(1).max(120),
  region: z.string().max(240).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  aliases: z.array(z.object({
    displayAlias: z.string().min(1).max(500),
    language: z.string().max(20).nullable().optional(),
  }).strict()).max(100).default([]),
}).strict().refine((value) => (value.latitude == null) === (value.longitude == null), {
  message: "latitude and longitude must be provided together",
  path: ["latitude"],
});
export const locationAliasBodySchema = z.object({
  displayAlias: z.string().min(1).max(500),
  language: z.string().max(20).nullable().optional(),
}).strict();
export const locationMergeBodySchema = z.object({
  destinationLocationId: uuidSchema,
  reason: z.string().min(1).max(4000),
}).strict();
export const unifiedReviewDecisionBodySchema = z.discriminatedUnion("itemType", [
  z.object({ itemType: z.literal("record"), decision: reviewBodySchema }),
  z.object({ itemType: z.literal("privacy_flag"), decision: privacyResolveBodySchema }),
  z.object({ itemType: z.literal("safety_flag"), decision: safetyResolveBodySchema }),
  z.object({ itemType: z.literal("ai_finding"), decision: aiFindingReviewBodySchema }),
  z.object({
    itemType: z.literal("custom_entry"),
    action: z.enum(["mapped_existing", "created_new", "keep_free_text", "dismissed"]),
    decision: customEntryDecisionBodySchema,
  }),
]);

export type ReplaceUserAccessBody = z.infer<typeof replaceUserAccessBodySchema>;
export type AuthorizationScopeInput = z.infer<typeof scopeReferenceSchema>;
