import type { SourceKind } from "./lookups";
import type { Attribution } from "./attribution";

export type SourceKindHandler = {
  key: SourceKind;
  requiresVisit: boolean;
  requiresSite: boolean;
  requiresActivity: boolean;
  requiresPiiAttestation: boolean;
  validateAttribution(attribution: Attribution): string[];
  allowedIdentifierFields: (keyof Attribution)[];
};

function req(value: string | undefined, label: string): string[] {
  if (!value || !value.trim()) return [`Missing ${label}`];
  return [];
}

export const fieldVisitHandler: SourceKindHandler = {
  key: "field_visit",
  requiresVisit: true,
  requiresSite: true,
  requiresActivity: true,
  requiresPiiAttestation: true,
  allowedIdentifierFields: [],
  validateAttribution: () => [],
};

export const professorInterviewHandler: SourceKindHandler = {
  key: "professor_interview",
  requiresVisit: false,
  requiresSite: false,
  requiresActivity: false,
  requiresPiiAttestation: false,
  allowedIdentifierFields: ["professorName", "affiliation"],
  validateAttribution: (a) => [
    ...req(a.professorName, "professorName"),
    ...req(a.attributionPermission, "attributionPermission"),
    ...req(a.quotePermission, "quotePermission"),
  ],
};

export const literatureHandler: SourceKindHandler = {
  key: "literature",
  requiresVisit: false,
  requiresSite: false,
  requiresActivity: false,
  requiresPiiAttestation: false,
  allowedIdentifierFields: ["title", "authors", "url"],
  validateAttribution: (a) => [...req(a.title, "title")],
};

export const otherHandler: SourceKindHandler = {
  key: "other",
  requiresVisit: false,
  requiresSite: false,
  requiresActivity: false,
  requiresPiiAttestation: false,
  allowedIdentifierFields: [],
  validateAttribution: () => [],
};

export const SOURCE_KIND_HANDLERS: Record<SourceKind, SourceKindHandler> = {
  field_visit: fieldVisitHandler,
  professor_interview: professorInterviewHandler,
  literature: literatureHandler,
  other: otherHandler,
};

export function getSourceKindHandler(key: string): SourceKindHandler | undefined {
  return SOURCE_KIND_HANDLERS[key as SourceKind];
}
