import { z } from "zod";
import type { Attribution } from "./attribution";

const attributionFieldSchema = z.enum([
  "professorName",
  "affiliation",
  "attributionPermission",
  "quotePermission",
  "title",
  "url",
  "authors",
  "year",
]);

// Source-kind behavior is data, not a closed TypeScript union. Administrators
// publish this policy in config_registry_items.metadata.policy.
export const sourceKindPolicySchema = z.object({
  requiresVisit: z.boolean().default(false),
  requiresSite: z.boolean().default(false),
  requiresActivity: z.boolean().default(false),
  requiresPiiAttestation: z.boolean().default(true),
  requiredAttributionFields: z.array(attributionFieldSchema).default([]),
  allowedIdentifierFields: z.array(attributionFieldSchema).default([]),
  privacyDisposition: z.enum(["flag", "redact"]).default("flag"),
  defaultConcernOriginKey: z.string().min(1).max(120),
}).strict();

export type SourceKindPolicy = z.infer<typeof sourceKindPolicySchema>;

export function validateSourceAttribution(policy: SourceKindPolicy, attribution: Attribution) {
  return policy.requiredAttributionFields.flatMap((field) => {
    const value = attribution[field];
    return value === undefined || value === null || String(value).trim() === ""
      ? [`Missing ${field}`]
      : [];
  });
}
