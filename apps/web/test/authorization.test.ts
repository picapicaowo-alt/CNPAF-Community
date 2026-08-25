import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuthorization, type AccessContext } from "../src/lib/authorization";

function context(input?: Partial<AccessContext>): AccessContext {
  return {
    userId: "user-a",
    roles: [{ assignmentId: "assignment-a", roleId: "role-a", key: "reviewer", nameEn: "Reviewer", nameZh: "审核员", organizationId: "org-a" }],
    grants: [],
    scopes: [],
    overrides: [],
    ...input,
  };
}

function grant(permissionKey: string, effect = "allow" as const) {
  return { roleAssignmentId: "assignment-a", roleId: "role-a", roleKey: "reviewer", organizationId: "org-a", permissionId: `permission:${permissionKey}`, permissionKey, effect };
}

test("role default allows a permission inside its organization", () => {
  const decision = evaluateAuthorization(context({ grants: [grant("records.review")] }), "records.review", { organizationId: "org-a", siteId: "site-a" });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "role_default");
});

test("role organization prevents cross-organization access", () => {
  const decision = evaluateAuthorization(context({ grants: [grant("records.review")] }), "records.review", { organizationId: "org-b", siteId: "site-a" });
  assert.equal(decision.allowed, false);
});

test("site scopes intersect with role permission", () => {
  const scoped = context({
    grants: [grant("records.review")],
    scopes: [{ id: "scope-a", roleAssignmentId: "assignment-a", permissionId: null, permissionKey: null, scopeType: "site", scopeId: "site-a", scopeKey: null, effect: "allow" }],
  });
  assert.equal(evaluateAuthorization(scoped, "records.review", { organizationId: "org-a", siteId: "site-a" }).allowed, true);
  assert.equal(evaluateAuthorization(scoped, "records.review", { organizationId: "org-a", siteId: "site-b" }).allowed, false);
});

test("explicit deny wins over explicit allow and role allow", () => {
  const access = context({
    grants: [grant("exports.create")],
    overrides: [
      { id: "allow", permissionId: "p", permissionKey: "exports.create", effect: "allow", scopeType: null, scopeId: null, scopeKey: null },
      { id: "deny", permissionId: "p", permissionKey: "exports.create", effect: "deny", scopeType: null, scopeId: null, scopeKey: null },
    ],
  });
  const decision = evaluateAuthorization(access, "exports.create", { organizationId: "org-a" });
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "explicit_deny");
});

test("own-only permissions never authorize another user's record", () => {
  const access = context({ grants: [grant("records.view_own"), grant("records.edit_own")] });
  assert.equal(evaluateAuthorization(access, "records.view_own", { ownerUserId: "user-b", organizationId: "org-a" }).reason, "owner_required");
  assert.equal(evaluateAuthorization(access, "records.edit_own", { ownerUserId: "user-b", organizationId: "org-a" }).allowed, false);
  assert.equal(evaluateAuthorization(access, "records.view_own", { ownerUserId: "user-a", organizationId: "org-a" }).allowed, true);
});

test("approved-evidence role does not imply raw record access", () => {
  const access = context({ grants: [grant("records.view_approved")] });
  assert.equal(evaluateAuthorization(access, "records.view_approved", { organizationId: "org-a", dataClassification: "approved_evidence" }).allowed, true);
  assert.equal(evaluateAuthorization(access, "records.view", { organizationId: "org-a", dataClassification: "raw_operational" }).allowed, false);
});

test("program scope restricts records even inside the same organization", () => {
  const scoped = context({
    grants: [grant("records.review")],
    scopes: [{ id: "scope-program", roleAssignmentId: "assignment-a", permissionId: null, permissionKey: null, scopeType: "program", scopeId: "program-a", scopeKey: null, effect: "allow" }],
  });
  assert.equal(evaluateAuthorization(scoped, "records.review", { organizationId: "org-a", programId: "program-a" }).allowed, true);
  assert.equal(evaluateAuthorization(scoped, "records.review", { organizationId: "org-a", programId: "program-b" }).allowed, false);
});

test("location and form aliases are evaluated as first-class scopes", () => {
  const scoped = context({
    grants: [grant("records.create")],
    scopes: [
      { id: "location", roleAssignmentId: "assignment-a", permissionId: null, permissionKey: null, scopeType: "location", scopeId: "site-a", scopeKey: null, effect: "allow" },
      { id: "form", roleAssignmentId: "assignment-a", permissionId: null, permissionKey: null, scopeType: "form", scopeId: "template-a", scopeKey: null, effect: "allow" },
    ],
  });
  assert.equal(evaluateAuthorization(scoped, "records.create", { organizationId: "org-a", locationId: "site-a", formId: "template-a" }).allowed, true);
  assert.equal(evaluateAuthorization(scoped, "records.create", { organizationId: "org-a", locationId: "site-a", formId: "template-b" }).allowed, false);
});
