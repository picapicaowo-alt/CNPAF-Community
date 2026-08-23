import { z } from "zod";
import { uuidSchema } from "./contracts";

export const permissionEffectSchema = z.enum(["allow", "deny"]);
export const scopeReferenceSchema = z.object({
  scopeType: z.string().min(1).max(80),
  scopeId: uuidSchema.nullable().optional(),
  scopeKey: z.string().min(1).max(160).nullable().optional(),
  effect: permissionEffectSchema.default("allow"),
  permissionKey: z.string().min(1).max(160).nullable().optional(),
  roleAssignmentId: uuidSchema.nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
});
export const scopeReferenceUpdateSchema = scopeReferenceSchema.partial();

export const roleAssignmentInputSchema = z.object({
  roleId: uuidSchema.optional(),
  roleKey: z.string().min(1).max(120).optional(),
  organizationId: uuidSchema.nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
}).refine((value) => value.roleId || value.roleKey, { message: "roleId or roleKey is required" });

export const permissionOverrideInputSchema = z.object({
  permissionId: uuidSchema.optional(),
  permissionKey: z.string().min(1).max(160).optional(),
  effect: permissionEffectSchema,
  scopeType: z.string().min(1).max(80).nullable().optional(),
  scopeId: uuidSchema.nullable().optional(),
  scopeKey: z.string().min(1).max(160).nullable().optional(),
  reason: z.string().max(2000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
}).refine((value) => value.permissionId || value.permissionKey, {
  message: "permissionId or permissionKey is required",
});

export const replaceUserAccessBodySchema = z.object({
  roleAssignments: z.array(roleAssignmentInputSchema).default([]),
  scopeAssignments: z.array(scopeReferenceSchema).default([]),
  scopes: z
    .object({
      organizationIds: z.array(uuidSchema).default([]),
      siteIds: z.array(uuidSchema).default([]),
      serviceIds: z.array(uuidSchema).default([]),
      serviceKeys: z.array(z.string().min(1)).default([]),
      templateIds: z.array(uuidSchema).default([]),
      dataClasses: z.array(z.string().min(1)).default([]),
      researchUse: z.array(z.string().min(1)).default([]),
    })
    .partial()
    .optional(),
  overrides: z.array(permissionOverrideInputSchema).default([]),
  reason: z.string().max(2000).nullable().optional(),
});

export const roleCreateBodySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/).max(120),
  nameEn: z.string().min(1).max(160),
  nameZh: z.string().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  organizationId: uuidSchema.nullable().optional(),
  permissionKeys: z.array(z.string().min(1)).default([]),
});

export const roleUpdateBodySchema = roleCreateBodySchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

export const adminUserUpdateBodySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(20).optional(),
  organizationId: uuidSchema.nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

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
  siteIds: z.array(uuidSchema).max(500).optional(),
  serviceTypeKeys: z.array(z.string().min(1).max(120)).max(100).optional(),
  populationKeys: z.array(z.string().min(1).max(160)).max(500).optional(),
  sourceOrigins: z.array(z.string().min(1).max(120)).max(100).optional(),
  templateVersionIds: z.array(uuidSchema).max(500).optional(),
  findingTypes: z.array(z.string().min(1).max(120)).max(100).optional(),
  themeOrConcernIds: z.array(uuidSchema).max(500).optional(),
}).passthrough().refine(
  (filters) => !filters.dateFrom || !filters.dateTo || Date.parse(filters.dateFrom) <= Date.parse(filters.dateTo),
  { message: "dateFrom must be before or equal to dateTo" },
);

export const reportEvidencePolicySchema = z.object({
  approvedOnly: z.literal(true).default(true),
  researchUseEligible: z.boolean().default(true),
}).passthrough();

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
  scope: z.record(z.unknown()).default({}),
});

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
  scope: z.record(z.unknown()).default({}),
  filters: reportFiltersSchema.default({}),
  dataClassification: z.string().min(1).max(120).default("approved_evidence"),
});

export type ReplaceUserAccessBody = z.infer<typeof replaceUserAccessBodySchema>;
export type AuthorizationScopeInput = z.infer<typeof scopeReferenceSchema>;
