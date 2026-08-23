import { z } from "zod";
import { CONCERN_ORIGINS, MISSING_REASONS, SOURCE_KINDS } from "./lookups";

export const uuidSchema = z.string().uuid();

export const quantitativeValueSchema = z.object({
  reason: z.enum(MISSING_REASONS),
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

export const draftBodySchema = z.object({
  clientRecordId: uuidSchema,
  idempotencyKey: z.string().min(8).max(80),
  localVersion: z.number().int().min(1),
  sourceKind: z.enum(SOURCE_KINDS),
  siteId: uuidSchema.nullable().optional(),
  visitId: uuidSchema.nullable().optional(),
  activityDefinitionId: uuidSchema.nullable().optional(),
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

export const inviteBodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["volunteer", "coordinator", "admin"]),
  name: z.string().min(1).max(120).optional(),
});

export const acceptInviteBodySchema = z.object({
  token: z.string().min(8),
  name: z.string().min(1).max(120),
  password: z.string().min(8),
});

export const siteCreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  siteType: z.string().min(1),
  region: z.string().max(120).optional(),
  organizationId: uuidSchema.nullable().optional(),
  organizationName: z.string().max(200).optional(),
});

export const reviewBodySchema = z.object({
  action: z.enum(["approve", "needs_completion"]),
  annotation: z.string().max(4000).optional(),
  findings: z
    .array(
      z.object({
        findingId: uuidSchema,
        decision: z.enum(["approve", "edit", "reject"]),
        editedStatement: z.string().optional(),
        canonicalThemeId: uuidSchema.nullable().optional(),
        origin: z.enum(CONCERN_ORIGINS).optional(),
      }),
    )
    .default([]),
});

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
      origin: z.enum(CONCERN_ORIGINS),
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

export type DraftBody = z.infer<typeof draftBodySchema>;
export type SubmitBody = z.infer<typeof submitBodySchema>;
export type AiOutput = z.infer<typeof aiOutputSchema>;
export type ReviewBody = z.infer<typeof reviewBodySchema>;
export type SiteCreateBody = z.infer<typeof siteCreateBodySchema>;
