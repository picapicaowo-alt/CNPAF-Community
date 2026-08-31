import assert from "node:assert/strict";
import test from "node:test";
import {
  aiFindingReviewBodySchema,
  askConversationBodySchema,
  compareFormVersionSnapshots,
  datasetArchiveBodySchema,
  datasetFieldPolicySchema,
  draftBodySchema,
  editableReportCreateBodySchema,
  formFieldValidationError,
  formAnswerTriggersSafetyAlert,
  formRatingValues,
  affiliationBodySchema,
  institutionCreateBodySchema,
  institutionUpdateBodySchema,
  locationCreateBodySchema,
  forgotPasswordBodySchema,
  completePasswordResetBodySchema,
  manualAccountCreateBodySchema,
  notificationTemplateBodySchema,
  personGroupCreateBodySchema,
  personGroupUpdateBodySchema,
  programUpdateBodySchema,
  programMembershipRequestBodySchema,
  removeAccountBodySchema,
  recordLifecycleBodySchema,
  reportSectionAiDraftBodySchema,
  reportFiltersSchema,
  resolveFormBranchAction,
  resolveRuntimeFormVisibility,
  reviewBodySchema,
  sourceKindPolicySchema,
  taskCreateBodySchema,
  taskBulkActionBodySchema,
  taskAssignmentTransitionBodySchema,
  taskUpdateBodySchema,
} from "@cnpaf/shared";
import type {
  FormAnswers,
  RuntimeFormField,
  RuntimeFormSection,
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
  record: "00000000-0000-0000-0000-000000000009",
};

test("account recovery and notification templates reject unsafe or ambiguous input", () => {
  assert.equal(forgotPasswordBodySchema.safeParse({ email: "member@cnpaf.org" }).success, true);
  assert.equal(forgotPasswordBodySchema.safeParse({ email: "not-an-email" }).success, false);
  assert.equal(completePasswordResetBodySchema.safeParse({ token: "x".repeat(64), newPassword: "secure-pass-12" }).success, true);
  assert.equal(notificationTemplateBodySchema.safeParse({
    kindKey: "account_onboarding",
    titleTemplate: "Welcome {{recipient_name}}",
    bodyTemplate: "Open {{action_url}}",
    emailSubjectTemplate: "Welcome",
    actionLabelTemplate: "Set password",
  }).success, true);
  assert.equal(notificationTemplateBodySchema.safeParse({
    kindKey: "Account Onboarding",
    titleTemplate: "Welcome",
    bodyTemplate: "Message",
    emailSubjectTemplate: "Welcome",
    actionLabelTemplate: "Set password",
  }).success, false);
});

test("V4 evidence filters apply every declared scope dimension", () => {
  const filters = reportFiltersSchema.parse({
    dateFrom: "2026-08-01T00:00:00.000Z",
    dateTo: "2026-08-31T23:59:59.999Z",
    recordIds: [ids.record],
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
    id: ids.record,
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
  assert.equal(matchesEvidenceFilters({ ...filters, recordIds: [ids.form] }, record, version, finding), false);
  assert.equal(matchesEvidenceFilters({ ...filters, programIds: [ids.organization] }, record, version, finding), false);
  assert.equal(matchesEvidenceFilters({ ...filters, sourceOrigins: ["other_origin"] }, record, version, finding), false);
});

test("security-sensitive filter and Ask scopes reject unknown fields", () => {
  assert.equal(reportFiltersSchema.safeParse({ ignoredBroadeningFilter: ["x"] }).success, false);
  assert.equal(askConversationBodySchema.safeParse({ scope: { ignoredBroadeningFilter: ["x"] } }).success, false);
  assert.equal(
    askConversationBodySchema.safeParse({
      scope: {},
      datasetVersionId: ids.form,
      includeMedia: true,
      contextSources: [{ label: "CHART-METRICS", statement: "46 records; 35 approved." }],
    }).success,
    true,
  );
  assert.equal(
    askConversationBodySchema.safeParse({
      scope: { datasetVersionId: ids.form },
    }).success,
    false,
  );
});

test("Dataset media and AI media use require explicit contract fields", () => {
  assert.equal(
    datasetFieldPolicySchema.safeParse({
      include: ["structured_answers", "media_attachments"],
      exclude: [],
    }).success,
    true,
  );
  assert.equal(
    reportSectionAiDraftBodySchema.safeParse({
      instruction: "Draft from approved evidence only.",
      idempotencyKey: "media-test-001",
      includeMedia: true,
    }).success,
    true,
  );
  assert.equal(
    askConversationBodySchema.safeParse({
      scope: {},
      datasetVersionId: ids.form,
      includeMedia: "yes",
    }).success,
    false,
  );
});

test("Dataset archive requires an auditable reason", () => {
  assert.equal(datasetArchiveBodySchema.safeParse({}).success, false);
  assert.equal(datasetArchiveBodySchema.safeParse({ reason: "Superseded by a reviewed Dataset Version" }).success, true);
});

test("approved record revisions and deletion require explicit auditable actions", () => {
  assert.equal(recordLifecycleBodySchema.safeParse({ action: "archive" }).success, false);
  assert.equal(recordLifecycleBodySchema.safeParse({ action: "archive", reason: "Duplicate submission" }).success, true);
  assert.equal(recordLifecycleBodySchema.safeParse({ action: "submit_revision", reason: "unexpected" }).success, false);
  assert.equal(recordLifecycleBodySchema.safeParse({ action: "submit_revision" }).success, true);
});

test("an initial report accepts one pinned source kind, never two", () => {
  const input = {
    organizationId: ids.organization,
    programId: ids.program,
    title: "Initial report",
    sections: [{ sectionKey: "summary", title: "Summary", content: "", sortOrder: 0 }],
  };
  assert.equal(editableReportCreateBodySchema.safeParse({ ...input, sourceDatasetVersionId: ids.form }).success, true);
  assert.equal(editableReportCreateBodySchema.safeParse({ ...input, sourceDatasetVersionId: ids.form, sourceReportArtifactId: ids.canonical }).success, false);
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

test("task creation requires at least one assignee in the atomic workflow", () => {
  const base = {
    programId: ids.program,
    templateVersionId: ids.form,
    taskTypeKey: "configured_task_type",
    title: "Collection task",
  };
  assert.equal(taskCreateBodySchema.safeParse(base).success, false);
  assert.equal(
    taskCreateBodySchema.safeParse({ ...base, assigneeIds: [ids.collector] })
      .success,
    true,
  );
});

test("task priority is an optional configurable key", () => {
  const base = {
    programId: ids.program,
    templateVersionId: ids.form,
    taskTypeKey: "configured_task_type",
    title: "Collection task",
    assigneeIds: [ids.collector],
  };
  assert.equal(taskCreateBodySchema.safeParse(base).success, true);
  assert.equal(
    taskCreateBodySchema.safeParse({ ...base, priority: "low" }).success,
    true,
  );
  assert.equal(
    taskCreateBodySchema.safeParse({ ...base, priority: null }).success,
    true,
  );
  assert.equal(
    taskCreateBodySchema.safeParse({ ...base, priority: 1 }).success,
    false,
  );
  assert.equal(
    taskUpdateBodySchema.safeParse({ priority: "custom_urgent" }).success,
    true,
  );
  assert.equal(taskUpdateBodySchema.safeParse({ priority: null }).success, true);
});

test("recurring task creation requires a due date and a valid IANA timezone", () => {
  const base = {
    programId: ids.program,
    templateVersionId: ids.form,
    taskTypeKey: "configured_task_type",
    title: "Thursday ADHC activity",
    assigneeIds: [ids.collector],
  };
  assert.equal(taskCreateBodySchema.safeParse({
    ...base,
    recurrence: { frequency: "weekly", interval: 1, timezone: "America/Los_Angeles" },
  }).success, false);
  assert.equal(taskCreateBodySchema.safeParse({
    ...base,
    dueAt: "2026-09-03T17:00:00.000Z",
    recurrence: { frequency: "weekly", interval: 1, timezone: "Not/A_Timezone" },
  }).success, false);
  assert.equal(taskCreateBodySchema.safeParse({
    ...base,
    dueAt: "2026-09-03T17:00:00.000Z",
    recurrence: { frequency: "weekly", interval: 1, timezone: "America/Los_Angeles" },
  }).success, true);
});

test("task edits can select another published form version", () => {
  assert.equal(
    taskUpdateBodySchema.safeParse({ templateVersionId: ids.form }).success,
    true,
  );
  assert.equal(
    taskUpdateBodySchema.safeParse({ templateVersionId: "not-a-version" }).success,
    false,
  );
});

test("bulk task actions require bounded task and assignee selections", () => {
  assert.equal(
    taskBulkActionBodySchema.safeParse({
      action: "assign",
      taskIds: [ids.canonical],
      assigneeIds: [ids.collector],
    }).success,
    true,
  );
  assert.equal(
    taskBulkActionBodySchema.safeParse({ action: "close", taskIds: [] })
      .success,
    false,
  );
  assert.equal(
    taskBulkActionBodySchema.safeParse({
      action: "assign",
      taskIds: [ids.canonical],
      assigneeIds: [],
    }).success,
    false,
  );
});

test("program details are editable without allowing stable key mutation", () => {
  assert.equal(
    programUpdateBodySchema.safeParse({
      nameZh: "更新后的项目名",
      nameEn: "Updated program name",
      descriptionZh: "新的说明",
      descriptionEn: null,
    }).success,
    true,
  );
  assert.equal(
    programUpdateBodySchema.safeParse({ key: "renamed-internal-key" }).success,
    false,
  );
});

test("program membership requests accept a bounded multi-person selection", () => {
  assert.equal(
    programMembershipRequestBodySchema.safeParse({
      userIds: [ids.collector, ids.canonical],
      membershipRoleKey: "member",
    }).success,
    true,
  );
  assert.equal(
    programMembershipRequestBodySchema.safeParse({
      userIds: [ids.collector, ids.collector],
      membershipRoleKey: "member",
    }).success,
    false,
  );
});

test("people groups support cross-department membership without duplicate users", () => {
  assert.equal(
    personGroupCreateBodySchema.safeParse({
      key: "usc-interdisciplinary-team",
      nameEn: "USC Interdisciplinary Team",
      nameZh: "USC 跨学院小组",
      userIds: [ids.collector, ids.canonical],
    }).success,
    true,
  );
  assert.equal(
    personGroupCreateBodySchema.safeParse({
      key: "usc-team",
      nameEn: "USC Team",
      nameZh: "USC 小组",
      userIds: [ids.collector, ids.collector],
    }).success,
    false,
  );
  assert.equal(
    personGroupUpdateBodySchema.safeParse({ userIds: [] }).success,
    true,
  );
});

test("form version comparison identifies stable-key changes and moves", () => {
  const base = {
    version: {
      id: "version-1",
      version: 1,
      nameEn: "Form",
      nameZh: "表单",
      configuration: {},
    },
    sections: [
      {
        id: "section-1",
        key: "profile",
        labelEn: "Profile",
        labelZh: "资料",
        sortOrder: 0,
      },
    ],
    fields: [
      {
        id: "field-1",
        templateSectionId: "section-1",
        key: "age",
        fieldTypeKey: "number",
        labelEn: "Age",
        labelZh: "年龄",
        required: false,
        allowMissingReason: false,
        allowCustomEntry: false,
        sortOrder: 0,
      },
    ],
    options: [],
  };
  const comparison = compareFormVersionSnapshots(base, {
    ...base,
    version: { ...base.version, id: "version-2", version: 2 },
    sections: [
      ...base.sections,
      {
        id: "section-2",
        key: "follow-up",
        labelEn: "Follow-up",
        labelZh: "跟进",
        sortOrder: 1,
      },
    ],
    fields: [
      {
        ...base.fields[0]!,
        templateSectionId: "section-2",
        labelZh: "参与者年龄",
      },
    ],
  });
  assert.equal(comparison.summary.added, 1);
  assert.equal(comparison.summary.moved, 1);
  assert.equal(comparison.summary.modified, 1);
  assert.deepEqual(
    comparison.changes.map((change) => [change.changeType, change.key]),
    [
      ["added", "follow-up"],
      ["moved", "age"],
      ["modified", "age"],
    ],
  );
});

test("field-level answers preserve typed values and missing reasons", () => {
  const parsed = draftBodySchema.safeParse({
    clientRecordId: ids.canonical,
    idempotencyKey: "field-answer-draft",
    localVersion: 1,
    sourceKind: "configured_source",
    templateVersionId: ids.form,
    fieldAnswers: [
      { templateFieldId: ids.location, value: ["option-a", "option-b"] },
      {
        templateFieldId: ids.collector,
        value: null,
        missingReasonKey: "not_observed",
      },
    ],
  });
  assert.equal(parsed.success, true);
  assert.equal(
    draftBodySchema.safeParse({
      clientRecordId: ids.canonical,
      idempotencyKey: "empty-answer-draft",
      localVersion: 1,
      sourceKind: "configured_source",
      templateVersionId: ids.form,
      fieldAnswers: [{ templateFieldId: ids.location, value: null }],
    }).success,
    false,
  );
});

test("conditional form visibility ignores stale answers from hidden fields", () => {
  const sections: RuntimeFormSection[] = [
    {
      id: "section-1",
      key: "screening",
      labelEn: "Screening",
      labelZh: "筛选",
      sortOrder: 0,
    },
    {
      id: "section-2",
      key: "follow-up",
      labelEn: "Follow-up",
      labelZh: "跟进",
      sortOrder: 1,
      configuration: {
        visibilityConditions: [
          { fieldKey: "eligible", operator: "answered" },
        ],
      },
    },
  ];
  const field = (
    id: string,
    key: string,
    templateSectionId: string,
    sortOrder: number,
  ): RuntimeFormField => ({
    id,
    key,
    templateSectionId,
    sortOrder,
    fieldTypeKey: "short_answer",
    labelEn: key,
    labelZh: key,
    required: false,
    allowMissingReason: false,
    allowCustomEntry: false,
    validation: {},
  });
  const fields = [
    field("field-1", "eligible", "section-1", 0),
    {
      ...field("field-2", "details", "section-1", 1),
      visibilityConditions: [
        { fieldKey: "eligible", operator: "equals" as const, value: "yes" },
      ],
    },
    {
      ...field("field-3", "follow_up", "section-2", 0),
      visibilityConditions: [
        { fieldKey: "details", operator: "answered" as const },
      ],
    },
  ];
  const answers: FormAnswers = {
    "field-1": { value: "yes" },
    "field-2": { value: "saved stale answer" },
  };
  assert.deepEqual(
    resolveRuntimeFormVisibility({ answers, fields, sections }).visibleFields.map(
      (candidate) => candidate.key,
    ),
    ["eligible", "details", "follow_up"],
  );
  answers["field-1"] = { value: "no" };
  assert.deepEqual(
    resolveRuntimeFormVisibility({ answers, fields, sections }).visibleFields.map(
      (candidate) => candidate.key,
    ),
    ["eligible"],
  );
});

test("form branching uses stable answer keys and ignores hidden source fields", () => {
  const fields: RuntimeFormField[] = [
    {
      id: "field-1",
      key: "eligible",
      templateSectionId: "section-1",
      sortOrder: 0,
      fieldTypeKey: "single_select",
      labelEn: "Eligible",
      labelZh: "符合条件",
      required: false,
      allowMissingReason: false,
      allowCustomEntry: false,
      validation: {},
      branchingLogic: [
        { operator: "equals", value: "no", action: "end_form" },
      ],
    },
  ];
  const answers: FormAnswers = { "field-1": { value: "no" } };
  assert.deepEqual(
    resolveFormBranchAction({
      answers,
      fields,
      sectionId: "section-1",
      visibleFieldIds: new Set(["field-1"]),
    }),
    {
      operator: "equals",
      value: "no",
      action: "end_form",
      sourceFieldKey: "eligible",
    },
  );
  assert.equal(
    resolveFormBranchAction({
      answers,
      fields,
      sectionId: "section-1",
      visibleFieldIds: new Set(),
    }),
    null,
  );
});

test("rating fields generate bounded integer scales from configured limits", () => {
  assert.deepEqual(formRatingValues({ min: 1, max: 5 }), [1, 2, 3, 4, 5]);
  assert.deepEqual(formRatingValues({ min: 1, max: 10 }), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ]);
  assert.equal(formFieldValidationError("rating", { min: 10, max: 5 }), "Rating minimum cannot exceed its maximum");
  assert.equal(formFieldValidationError("rating", { min: 1, max: 21 }), "Rating maximum cannot exceed 20");
  assert.equal(formFieldValidationError("rating", { min: "1", max: 5 }), "Rating limits must be finite numbers");
  assert.deepEqual(formRatingValues({ min: 1, max: 21 }), []);
});

test("returning a record requires a reason and preserves field targets", () => {
  assert.equal(
    reviewBodySchema.safeParse({ action: "needs_completion" }).success,
    false,
  );
  const parsed = reviewBodySchema.safeParse({
    action: "needs_completion",
    annotation: "Please correct the participant count.",
    correctionFieldIds: [ids.location],
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(
    parsed.success ? parsed.data.correctionFieldIds : [],
    [ids.location],
  );
});

test("record approval accepts selected and unselected AI suggestions in one decision", () => {
  const parsed = reviewBodySchema.safeParse({
    action: "approve",
    findings: [
      { findingId: ids.location, decision: "approve" },
      { findingId: ids.organization, decision: "reject" },
    ],
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(
    parsed.success
      ? parsed.data.findings.map(({ findingId, decision }) => ({
          findingId,
          decision,
        }))
      : [],
    [
      { findingId: ids.location, decision: "approve" },
      { findingId: ids.organization, decision: "reject" },
    ],
  );
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

test("affiliations accept a managed institution id and institution directory inputs stay bounded", () => {
  assert.equal(affiliationBodySchema.safeParse({
    affiliationTypeKey: "staff",
    institutionId: ids.location,
  }).success, true);
  assert.equal(affiliationBodySchema.safeParse({
    affiliationTypeKey: "staff",
  }).success, false);
  assert.equal(institutionCreateBodySchema.safeParse({
    name: "University of Southern California",
    institutionTypeKey: "school",
  }).success, true);
  assert.equal(institutionUpdateBodySchema.safeParse({}).success, false);
  assert.equal(institutionUpdateBodySchema.safeParse({ status: "archived" }).success, true);
});

test("permanent identity removal requires an explicit confirmation and reason", () => {
  assert.equal(
    removeAccountBodySchema.safeParse({
      confirmation: "REMOVE",
      reason: "Created with the wrong email",
    }).success,
    true,
  );
  assert.equal(
    removeAccountBodySchema.safeParse({
      confirmation: "DELETE",
      reason: "Created with the wrong email",
    }).success,
    false,
  );
  assert.equal(
    removeAccountBodySchema.safeParse({ confirmation: "REMOVE", reason: "" })
      .success,
    false,
  );
});

test("location coordinates are paired and bounded", () => {
  assert.equal(locationCreateBodySchema.safeParse({
    organizationId: ids.organization,
    nameZh: "缺少英文名称",
    siteType: "configured_location_type",
  }).success, false);
  assert.equal(locationCreateBodySchema.safeParse({
    organizationId: ids.organization,
    nameEn: "Configured location",
    nameZh: "已配置地点",
    siteType: "configured_location_type",
    latitude: 34.02,
  }).success, false);
  assert.equal(locationCreateBodySchema.safeParse({
    organizationId: ids.organization,
    nameEn: "Configured location",
    nameZh: "已配置地点",
    siteType: "configured_location_type",
    latitude: 34.02,
    longitude: -118.28,
  }).success, true);
});

test("configured danger responses trigger the safety alert exactly", () => {
  const booleanConfiguration = {
    safetyAlert: { enabled: true, triggerValues: [true] },
  };
  assert.equal(
    formAnswerTriggersSafetyAlert(true, booleanConfiguration),
    true,
  );
  assert.equal(
    formAnswerTriggersSafetyAlert(false, booleanConfiguration),
    false,
  );
  const optionConfiguration = {
    safetyAlert: { enabled: true, triggerValues: ["urgent"] },
  };
  assert.equal(
    formAnswerTriggersSafetyAlert(["routine", "urgent"], optionConfiguration),
    true,
  );
  assert.equal(
    formAnswerTriggersSafetyAlert("routine", optionConfiguration),
    false,
  );
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
