import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const quantitativeValueSchema = z.object({
  reason: z.string().min(1),
  value: z.number().nullable(),
});

export const attributionSchema = z
  .object({
    professorName: z.string().optional(),
    affiliation: z.string().optional(),
    attributionPermission: z.enum(["internal_named", "public_named", "anonymous"]).optional(),
    quotePermission: z.enum(["internal", "public", "no_quote"]).optional(),
    title: z.string().optional(),
    url: z.string().url().optional().or(z.literal("")),
    authors: z.string().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
  })
  .partial();

export const recordFieldAnswerSchema = z
  .object({
    templateFieldId: uuidSchema,
    value: z
      .union([
        z.string().max(100_000),
        z.number(),
        z.boolean(),
        z.array(z.string().min(1).max(160)).max(1000),
      ])
      .nullable()
      .default(null),
    missingReasonKey: z.string().min(1).max(120).nullable().optional(),
    customText: z.string().max(20_000).nullable().optional(),
  })
  .refine(
    (answer) =>
      answer.value !== null ||
      Boolean(answer.missingReasonKey) ||
      Boolean(answer.customText?.trim()),
    "A value, missing reason, or custom answer is required",
  );

export const draftBodySchema = z.object({
  clientRecordId: uuidSchema,
  idempotencyKey: z.string().min(8).max(80),
  localVersion: z.number().int().min(1),
  sourceKind: z.string().min(1).max(120),
  siteId: uuidSchema.nullable().optional(),
  programId: uuidSchema.nullable().optional(),
  taskId: uuidSchema.nullable().optional(),
  taskAssignmentId: uuidSchema.nullable().optional(),
  visitId: uuidSchema.nullable().optional(),
  activityDefinitionId: uuidSchema.nullable().optional(),
  templateVersionId: uuidSchema.nullable().optional(),
  fieldAnswers: z.array(recordFieldAnswerSchema).max(5000).default([]),
  structuredSelections: z.array(z.object({
    templateFieldId: uuidSchema,
    optionId: uuidSchema,
    value: z.record(z.unknown()).default({}),
  })).default([]),
  customEntries: z.array(z.object({
    templateFieldId: uuidSchema,
    categoryId: uuidSchema.nullable().optional(),
    customText: z.string().min(1).max(20_000),
  })).default([]),
  qualitative: z.string().default(""),
  quantitative: z.record(quantitativeValueSchema).default({}),
  attribution: attributionSchema.default({}),
  contentLanguage: z.enum(["zh", "en"]).default("zh"),
  occurredAt: z.string().datetime().optional(),
});

export const submitBodySchema = draftBodySchema.extend({
  piiAttestation: z.boolean(),
});

export const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(8).max(200),
  newPassword: z.string().min(12).max(200),
}).refine((value) => value.currentPassword !== value.newPassword, {
  message: "New password must differ from current password",
  path: ["newPassword"],
});

export const inviteBodySchema = z.object({
  email: z.string().email(),
  roleId: uuidSchema.optional(),
  roleKey: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(120).optional(),
  organizationId: uuidSchema.nullable().optional(),
  initialScopes: z
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
    .default({}),
  name: z.string().min(1).max(120).optional(),
}).strict().refine((value) => value.roleId || value.roleKey || value.role, {
  message: "roleId or roleKey is required",
  path: ["roleId"],
});

export const acceptInviteBodySchema = z.object({
  token: z.string().min(8),
  name: z.string().min(1).max(120),
  password: z.string().min(12).max(200),
}).strict();

export const siteCreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  siteType: z.string().min(1),
  region: z.string().max(120).optional(),
  organizationId: uuidSchema.nullable().optional(),
  organizationName: z.string().max(200).optional(),
}).strict();

export const reviewBodySchema = z.object({
  action: z.enum(["approve", "needs_completion"]),
  annotation: z.string().max(4000).optional(),
  correctionFieldIds: z.array(uuidSchema).max(200).default([]),
  researchUseStatus: z.string().min(1).max(120).optional(),
  findings: z
    .array(
      z.object({
        findingId: uuidSchema,
        decision: z.enum(["approve", "edit", "reject"]),
        editedStatement: z.string().optional(),
        canonicalThemeId: uuidSchema.nullable().optional(),
        origin: z.string().min(1).optional(),
      }).strict(),
    )
    .default([]),
}).strict().refine(
  (value) =>
    value.action !== "needs_completion" || Boolean(value.annotation?.trim()),
  {
    message: "A correction reason is required when returning a record",
    path: ["annotation"],
  },
);

export const evidenceSchema = z.object({
  text: z.string(),
  start: z.number().int().min(0),
  end: z.number().int().min(0),
});

export const aiOutputSchema = z.object({
  summary: z.object({
    zh: z.string(),
    en: z.string(),
  }),
  themes: z.array(
    z.object({
      rawLabel: z.string(),
      suggestedCanonicalKey: z.string(),
      confidence: z.number().min(0).max(1),
      evidence: z.array(evidenceSchema).min(1),
    }),
  ),
  concerns: z.array(
    z.object({
      statement: z.string(),
      suggestedCanonicalKey: z.string(),
      origin: z.string().min(1),
      confidence: z.number().min(0).max(1),
      evidence: z.array(evidenceSchema).min(1),
    }),
  ),
  quantitativeSuggestions: z
    .array(
      z.object({
        fieldKey: z.string(),
        value: z.number(),
        confidence: z.number().min(0).max(1),
        evidence: z.array(evidenceSchema).optional(),
      }),
    )
    .default([]),
  safetySuspect: z
    .array(
      z.object({
        statement: z.string(),
        needsUrgentHumanReview: z.literal(true),
        evidence: z.array(evidenceSchema).min(1),
      }),
    )
    .default([]),
});

export const AI_OUTPUT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "themes", "concerns", "quantitativeSuggestions", "safetySuspect"],
  properties: {
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["zh", "en"],
      properties: { zh: { type: "string" }, en: { type: "string" } },
    },
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rawLabel", "suggestedCanonicalKey", "confidence", "evidence"],
        properties: {
          rawLabel: { type: "string" },
          suggestedCanonicalKey: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: { $ref: "#/$defs/evidenceList" },
        },
      },
    },
    concerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "suggestedCanonicalKey", "origin", "confidence", "evidence"],
        properties: {
          statement: { type: "string" },
          suggestedCanonicalKey: { type: "string" },
          origin: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: { $ref: "#/$defs/evidenceList" },
        },
      },
    },
    quantitativeSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fieldKey", "value", "confidence", "evidence"],
        properties: {
          fieldKey: { type: "string" },
          value: { type: "number" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
        },
      },
    },
    safetySuspect: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["statement", "needsUrgentHumanReview", "evidence"],
        properties: {
          statement: { type: "string" },
          needsUrgentHumanReview: { type: "boolean", const: true },
          evidence: { $ref: "#/$defs/evidenceList" },
        },
      },
    },
  },
  $defs: {
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["text", "start", "end"],
      properties: {
        text: { type: "string" },
        start: { type: "integer", minimum: 0 },
        end: { type: "integer", minimum: 0 },
      },
    },
    evidenceList: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/evidence" },
    },
  },
} as const;

export type DraftBody = z.infer<typeof draftBodySchema>;
export type SubmitBody = z.infer<typeof submitBodySchema>;
export type AiOutput = z.infer<typeof aiOutputSchema>;
export type ReviewBody = z.infer<typeof reviewBodySchema>;
export type SiteCreateBody = z.infer<typeof siteCreateBodySchema>;
