import assert from "node:assert/strict";
import test from "node:test";
import {
  aiFindingReviewBodySchema,
  askConversationBodySchema,
  locationCreateBodySchema,
  manualAccountCreateBodySchema,
  reportFiltersSchema,
  sourceKindPolicySchema,
  taskAssignmentTransitionBodySchema,
} from "@cnpaf/shared";
import { matchesEvidenceFilters } from "../src/lib/evidence-filters";
import { toCsv, toSimplePdf } from "../src/lib/export-format";

const ids = {
  organization: "00000000-0000-0000-0000-000000000001",
  program: "00000000-0000-0000-0000-000000000002",
  location: "00000000-0000-0000-0000-000000000003",
  form: "00000000-0000-0000-0000-000000000004",
  collector: "00000000-0000-0000-0000-000000000005",
  role: "00000000-0000-0000-0000-000000000006",
  roleAssignment: "00000000-0000-0000-0000-000000000007",
  canonical: "00000000-0000-0000-0000-000000000008",
};

test("V4 evidence filters apply every declared scope dimension", () => {
  const filters = reportFiltersSchema.parse({
    dateFrom: "2026-08-01T00:00:00.000Z",
    dateTo: "2026-08-31T23:59:59.999Z",
    organizationIds: [ids.organization],
    programIds: [ids.program],
    locationIds: [ids.location],
    serviceTypeKeys: ["configured_service"],
    populationKeys: ["configured_population"],
    sourceOrigins: ["configured_origin"],
    formVersionIds: [ids.form],
    collectorIds: [ids.collector],
    reviewStatuses: ["approved"],
    researchUseStatuses: ["approved_for_research"],
    findingTypes: ["configured_finding"],
    themeOrConcernIds: [ids.canonical],
  });
  const record = {
    organizationId: ids.organization,
    programId: ids.program,
    siteId: ids.location,
    sourceKind: "configured_service",
    createdById: ids.collector,
    reviewStatus: "approved",
    researchUseStatus: "approved_for_research",
  };
  const version = {
    occurredAt: new Date("2026-08-23T12:00:00.000Z"),
    submittedAt: new Date("2026-08-23T13:00:00.000Z"),
    createdAt: new Date("2026-08-23T11:00:00.000Z"),
    templateVersionId: ids.form,
    quantitative: { population: "configured_population" },
    attribution: {},
  };
  const finding = {
    findingType: "configured_finding",
    canonicalRegistryItemId: ids.canonical,
    approvedValue: { origin: "configured_origin" },
    createdAt: new Date("2026-08-23T14:00:00.000Z"),
  };
  assert.equal(matchesEvidenceFilters(filters, record, version, finding), true);
  assert.equal(matchesEvidenceFilters({ ...filters, programIds: [ids.organization] }, record, version, finding), false);
  assert.equal(matchesEvidenceFilters({ ...filters, sourceOrigins: ["other_origin"] }, record, version, finding), false);
});

test("security-sensitive filter and Ask scopes reject unknown fields", () => {
  assert.equal(reportFiltersSchema.safeParse({ ignoredBroadeningFilter: ["x"] }).success, false);
  assert.equal(askConversationBodySchema.safeParse({ scope: { ignoredBroadeningFilter: ["x"] } }).success, false);
});

test("AI finding edits and re-runs require explicit reviewer input", () => {
  assert.equal(aiFindingReviewBodySchema.safeParse({ decision: "edit" }).success, false);
  assert.equal(aiFindingReviewBodySchema.safeParse({ decision: "edit", editedStatement: "Human-corrected finding" }).success, true);
  assert.equal(aiFindingReviewBodySchema.safeParse({ decision: "re_run_requested" }).success, false);
  assert.equal(aiFindingReviewBodySchema.safeParse({ decision: "re_run_requested", reviewerNotes: "Separate observation from inferred cause." }).success, true);
});

test("task decline remains distinct and requires a reason", () => {
  assert.equal(taskAssignmentTransitionBodySchema.safeParse({ status: "declined" }).success, false);
  assert.equal(taskAssignmentTransitionBodySchema.safeParse({ status: "declined", declineReason: "Schedule conflict" }).success, true);
  assert.equal(taskAssignmentTransitionBodySchema.safeParse({ status: "cancelled" }).success, true);
});

test("manual account provisioning cannot reference an unrelated role assignment", () => {
  const parsed = manualAccountCreateBodySchema.safeParse({
    email: "person@example.org",
    name: "Person",
    organizationId: ids.organization,
    roleAssignments: [{ roleId: ids.role }],
    scopeAssignments: [{
      roleAssignmentId: ids.roleAssignment,
      scopeType: "organization",
      scopeId: ids.organization,
      effect: "allow",
    }],
  });
  assert.equal(parsed.success, false);
});

test("location coordinates are paired and bounded", () => {
  assert.equal(locationCreateBodySchema.safeParse({
    organizationId: ids.organization,
    name: "Configured location",
    siteType: "configured_location_type",
    latitude: 34.02,
  }).success, false);
  assert.equal(locationCreateBodySchema.safeParse({
    organizationId: ids.organization,
    name: "Configured location",
    siteType: "configured_location_type",
    latitude: 34.02,
    longitude: -118.28,
  }).success, true);
});

test("source-kind behavior is validated as registry metadata", () => {
  const policy = sourceKindPolicySchema.parse({ defaultConcernOriginKey: "configured_origin" });
  assert.equal(policy.requiresVisit, false);
  assert.equal(policy.privacyDisposition, "flag");
  assert.equal(sourceKindPolicySchema.safeParse({ defaultConcernOriginKey: "x", runtimeBranch: true }).success, false);
});

test("download serializers are deterministic and escape content", () => {
  assert.equal(toCsv([{ name: "A, B", note: "said \"hello\"" }]), '"name","note"\r\n"A, B","said ""hello"""');
  const pdf = toSimplePdf("CNPAF", { value: "测试" });
  assert.equal(pdf.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(pdf.toString("ascii"), /startxref/);
});
