import assert from "node:assert/strict";
import { config } from "dotenv";

config({ path: ".env" });
config({ path: "apps/web/.env.local" });

const baseUrl = (process.env.CNPAF_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const password = process.env.SEED_PASSWORD;
if (!password) {
  throw new Error("SEED_PASSWORD is required for the local full-chain test");
}
const expectedAiProvider = process.env.E2E_EXPECTED_AI_PROVIDER ?? "local_heuristic";
const expectedAiModel = process.env.E2E_EXPECTED_AI_MODEL ?? "local-v1";
const aiTimeoutMs = Number(process.env.E2E_AI_TIMEOUT_MS ?? 60_000);
if (!Number.isFinite(aiTimeoutMs) || aiTimeoutMs < 10_000 || aiTimeoutMs > 600_000) {
  throw new Error("E2E_AI_TIMEOUT_MS must be between 10000 and 600000 milliseconds");
}

const roleAccounts = [
  { email: "admin@cnpaf.local", role: "admin" },
  { email: "ops@cnpaf.local", role: "operations_reviewer" },
  { email: "research@cnpaf.local", role: "research_lead" },
  { email: "stakeholder@cnpaf.local", role: "winston_research" },
  { email: "volunteer@cnpaf.local", role: "volunteer" },
];

const defaultStudentAccounts = [
  {
    email: "usc.gerontology.alex@cnpaf.local",
    department: "USC Leonard Davis School of Gerontology",
  },
  {
    email: "usc.gerontology.maya@cnpaf.local",
    department: "USC Leonard Davis School of Gerontology",
  },
  {
    email: "usc.socialwork.jordan@cnpaf.local",
    department: "USC Suzanne Dworak-Peck School of Social Work",
  },
  {
    email: "usc.publicpolicy.priya@cnpaf.local",
    department: "USC Sol Price School of Public Policy",
  },
  {
    email: "usc.engineering.ethan@cnpaf.local",
    department: "USC Viterbi School of Engineering",
  },
  {
    email: "usc.medicine.sofia@cnpaf.local",
    department: "USC Keck School of Medicine",
  },
  {
    email: "usc.dornsife.noah@cnpaf.local",
    department: "USC Dornsife College of Letters, Arts and Sciences",
  },
];

function configuredVolunteerAccounts() {
  const configured = process.env.E2E_VOLUNTEERS_JSON;
  if (!configured) return defaultStudentAccounts;

  let accounts;
  try {
    accounts = JSON.parse(configured);
  } catch {
    throw new Error("E2E_VOLUNTEERS_JSON must be valid JSON");
  }
  if (
    !Array.isArray(accounts) ||
    accounts.length === 0 ||
    accounts.some(
      (account) =>
        !account ||
        typeof account.email !== "string" ||
        !account.email.endsWith("@cnpaf.local") ||
        (account.department !== undefined && typeof account.department !== "string"),
    )
  ) {
    throw new Error(
      "E2E_VOLUNTEERS_JSON must be a non-empty array of @cnpaf.local accounts with optional department values",
    );
  }
  return accounts.map((account) => ({
    email: account.email.toLowerCase(),
    department: account.department,
  }));
}

const studentAccounts = configuredVolunteerAccounts();

class ApiSession {
  constructor(email, cookie) {
    this.email = email;
    this.cookie = cookie;
  }

  static async login(email) {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(payload)}`);
    }
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    if (!cookie) throw new Error(`Login did not return a session cookie for ${email}`);
    return new ApiSession(email, cookie);
  }

  async raw(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("cookie", this.cookie);
    if (options.body !== undefined) headers.set("content-type", "application/json");
    return fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      body:
        options.body === undefined || typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
    });
  }

  async request(path, options = {}) {
    const response = await this.raw(path, options);
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(
        `${options.method ?? "GET"} ${path} as ${this.email}: ${response.status} ${JSON.stringify(payload)}`,
      );
    }
    return payload;
  }
}

async function readPayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function ensureLocation(admin, organizationId, input) {
  const nameEn = input.nameEn ?? input.name;
  const nameZh = input.nameZh ?? input.name;
  const result = await admin.request(
    `/api/v1/locations?q=${encodeURIComponent(nameEn)}`,
  );
  const existing = result.locations.find(
    (location) => location.nameEn === nameEn || location.name === nameEn,
  );
  if (existing) return existing;
  const created = await admin.request("/api/v1/locations", {
    method: "POST",
    body: { organizationId, ...input, nameEn, nameZh },
  });
  return created.location;
}

function answerForField(field, collectorIndex) {
  if (field.key === "observed-needs") {
    return "Participants requested clearer multilingual activity schedules and easier transportation coordination.";
  }
  if (field.key === "service-quality-rating") return 4 + (collectorIndex % 2);
  if (field.key === "follow-up-needed") return collectorIndex % 2 === 0;
  if (field.key === "collector-reflection") {
    return "The visit was completed with de-identified operational notes only.";
  }
  if (field.fieldTypeKey === "number" || field.fieldTypeKey === "rating_scale") return 4;
  if (field.fieldTypeKey === "boolean") return false;
  return "Completed during the CNPAF end-to-end operational test.";
}

const admin = await ApiSession.login("admin@cnpaf.local");
const identity = await admin.request("/api/v1/auth/me");
const organizationId = identity.user.organizationId;
assert.ok(organizationId, "Admin must belong to an organization");
assert.ok(
  identity.roles.some((role) => role.key === "admin"),
  "Admin account must resolve the admin role",
);
for (const permission of [
  "people.create_account",
  "tasks.create",
  "templates.create",
  "review.view",
  "records.view",
]) {
  assert.ok(
    identity.permissions.includes(permission),
    `Admin account is missing required permission ${permission}`,
  );
}

const people = await admin.request("/api/v1/admin/users?limit=250");
const peopleByEmail = new Map(people.users.map((user) => [user.email, user]));
for (const account of [...roleAccounts, ...studentAccounts]) {
  assert.ok(peopleByEmail.has(account.email), `Missing seeded account ${account.email}`);
}
for (const student of studentAccounts) {
  const user = peopleByEmail.get(student.email);
  if (student.department) {
    assert.ok(
      user.affiliations.some(
        (affiliation) =>
          affiliation.status === "active" &&
          affiliation.institutionName === "University of Southern California" &&
          affiliation.departmentName === student.department,
      ),
      `Missing USC department affiliation for ${student.email}`,
    );
  }
}

const locationInputs = [
  {
    name: "University of Southern California — CNPAF Partner Campus",
    siteType: "university",
    region: "Los Angeles County",
    address: "Los Angeles, CA",
    aliases: [{ displayAlias: "USC CNPAF Partner", language: "en" }],
  },
  {
    name: "CNPAF Demo Golden Years ADHC",
    siteType: "adhc",
    region: "Monterey Park",
    address: "Monterey Park, CA",
    aliases: [{ displayAlias: "金色年华成人日间护理（演示）", language: "zh" }],
  },
  {
    name: "CNPAF Demo Harmony ADHC",
    siteType: "adhc",
    region: "San Gabriel",
    address: "San Gabriel, CA",
    aliases: [{ displayAlias: "和谐成人日间护理（演示）", language: "zh" }],
  },
  {
    name: "CNPAF Demo Evergreen ADHC",
    siteType: "adhc",
    region: "Alhambra",
    address: "Alhambra, CA",
    aliases: [{ displayAlias: "长青成人日间护理（演示）", language: "zh" }],
  },
];
const locations = [];
for (const input of locationInputs) {
  locations.push(await ensureLocation(admin, organizationId, input));
}
assert.equal(
  locations.filter((location) => location.siteType === "adhc").length,
  3,
  "Three ADHC locations should be configured",
);

const runKey = `e2e-${Date.now().toString(36)}`;
const createdTemplate = await admin.request("/api/v1/templates", {
  method: "POST",
  body: {
    key: `cnpaf-community-visit-${runKey}`,
    templateTypeKey: "activity",
    organizationId,
    nameEn: `CNPAF Community Visit ${runKey}`,
    nameZh: `CNPAF 社区访视 ${runKey}`,
    descriptionEn: "End-to-end ADHC collection form.",
    descriptionZh: "用于全链路验收的 ADHC 采集表单。",
    configuration: { allowQuickCapture: true, e2eRunKey: runKey },
  },
});
const templateVersionId = createdTemplate.version.id;
const createdSection = await admin.request(
  `/api/v1/template-versions/${templateVersionId}/sections`,
  {
    method: "POST",
    body: {
      key: "visit-observation",
      labelEn: "Visit observation",
      labelZh: "访视观察",
      helpTextEn: "Do not include names or direct identifiers.",
      helpTextZh: "不要填写姓名或直接身份信息。",
      sortOrder: 0,
      configuration: { step: true },
    },
  },
);
const fieldDefinitions = [
  {
    key: "observed-needs",
    fieldTypeKey: "long_text",
    labelEn: "Observed needs",
    labelZh: "观察到的需求",
    required: true,
    sortOrder: 0,
  },
  {
    key: "service-quality-rating",
    fieldTypeKey: "rating_scale",
    labelEn: "Service quality rating",
    labelZh: "服务质量评分",
    required: true,
    sortOrder: 1,
    validation: { min: 1, max: 5 },
  },
  {
    key: "follow-up-needed",
    fieldTypeKey: "boolean",
    labelEn: "Follow-up needed",
    labelZh: "是否需要跟进",
    required: false,
    sortOrder: 2,
  },
  {
    key: "collector-reflection",
    fieldTypeKey: "long_text",
    labelEn: "Collector reflection",
    labelZh: "采集员备注",
    required: false,
    sortOrder: 3,
  },
];
for (const field of fieldDefinitions) {
  await admin.request(
    `/api/v1/template-sections/${createdSection.section.id}/fields`,
    {
      method: "POST",
      body: {
        helpTextEn: null,
        helpTextZh: null,
        placeholderEn: null,
        placeholderZh: null,
        allowMissingReason: false,
        allowCustomEntry: false,
        validation: {},
        visibilityConditions: [],
        branchingLogic: [],
        canonicalMapping: {},
        configuration: {},
        ...field,
      },
    },
  );
}
await admin.request(`/api/v1/template-versions/${templateVersionId}/publish`, {
  method: "POST",
});

const programResult = await admin.request("/api/v1/programs", {
  method: "POST",
  body: {
    organizationId,
    key: `usc-adhc-pilot-${runKey}`,
    nameEn: `USC–CNPAF ADHC Pilot ${runKey}`,
    nameZh: `USC–CNPAF ADHC 试点 ${runKey}`,
    descriptionEn: "Cross-school volunteer collection across three ADHC locations.",
    descriptionZh: "由多个学院志愿者在三个 ADHC 地点开展数据采集。",
    status: "active",
    configuration: {
      universityLocationId: locations[0].id,
      stakeholderModel: "CNPAF + university + ADHC",
    },
  },
});
const program = programResult.program;
const studentIds = studentAccounts.map(
  (student) => peopleByEmail.get(student.email).id,
);
await admin.request(`/api/v1/programs/${program.id}/memberships`, {
  method: "POST",
  body: { userIds: studentIds, membershipRoleKey: "member" },
});

const taskPlans = locations
  .slice(1)
  .map((location, locationIndex) => ({
    location,
    students: studentAccounts.filter(
      (_student, studentIndex) => studentIndex % (locations.length - 1) === locationIndex,
    ),
  }))
  .filter((plan) => plan.students.length > 0);
const now = Date.now();
const tasks = [];
for (const [index, plan] of taskPlans.entries()) {
  const result = await admin.request("/api/v1/tasks", {
    method: "POST",
    body: {
      programId: program.id,
      templateVersionId,
      siteId: plan.location.id,
      taskTypeKey: "data_collection",
      title: `${plan.location.name} — ${runKey}`,
      instructions: "Collect de-identified operational observations and submit for human review.",
      priority: ["high", "medium", "low"][index],
      opensAt: new Date(now - 5 * 60_000).toISOString(),
      dueAt: new Date(now + 24 * 60 * 60_000).toISOString(),
      closesAt: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
      configuration: { e2eRunKey: runKey },
      assigneeIds: plan.students.map(
        (student) => peopleByEmail.get(student.email).id,
      ),
      status: "open",
    },
  });
  tasks.push({ ...plan, task: result.task });
}

const submissions = [];
let collectorIndex = 0;
let authorizationCheckComplete = false;
for (const plan of tasks) {
  for (const student of plan.students) {
    const volunteer = await ApiSession.login(student.email);
    if (!authorizationCheckComplete) {
      const forbidden = await volunteer.raw("/api/v1/admin/users?limit=1");
      assert.equal(forbidden.status, 403, "Volunteer must not list all accounts");
      authorizationCheckComplete = true;
    }
    const taskPackage = await volunteer.request(
      `/api/v1/tasks/${plan.task.id}/package`,
    );
    assert.equal(taskPackage.assignment.status, "assigned");
    await volunteer.request(`/api/v1/tasks/${plan.task.id}/start`, {
      method: "POST",
    });
    const clientRecordId = crypto.randomUUID();
    const fieldAnswers = taskPackage.form.fields.map((field) => ({
      templateFieldId: field.id,
      value: answerForField(field, collectorIndex),
    }));
    const submitted = await volunteer.request("/api/v1/records", {
      method: "PUT",
      body: {
        clientRecordId,
        idempotencyKey: `submit-${crypto.randomUUID()}`,
        localVersion: 1,
        sourceKind: "field_visit",
        siteId: plan.location.id,
        programId: program.id,
        taskId: plan.task.id,
        taskAssignmentId: taskPackage.assignment.id,
        templateVersionId,
        fieldAnswers,
        structuredSelections: [],
        customEntries: [],
        qualitative:
          "A de-identified ADHC visit found demand for accessible activities, multilingual schedules, and transportation coordination.",
        quantitative: {},
        attribution: {},
        contentLanguage: "en",
        occurredAt: new Date().toISOString(),
        piiAttestation: true,
      },
    });
    assert.equal(submitted.record.reviewStatus, "pending");
    assert.equal(submitted.privacy.status, "clear");
    await volunteer.request(`/api/v1/tasks/${plan.task.id}/complete`, {
      method: "POST",
    });
    submissions.push({
      student,
      task: plan.task,
      location: plan.location,
      record: submitted.record,
      version: submitted.version,
    });
    collectorIndex += 1;
  }
}
assert.equal(submissions.length, studentAccounts.length);

const ops = await ApiSession.login("ops@cnpaf.local");
let runRows = [];
const aiDeadline = Date.now() + aiTimeoutMs;
while (Date.now() < aiDeadline) {
  await admin.request("/api/v1/jobs", { method: "POST" });
  const result = await ops.request("/api/v1/ai/runs");
  const versionIds = new Set(submissions.map((submission) => submission.version.id));
  runRows = result.runs.filter(
    (row) => row.run.recordVersionId && versionIds.has(row.run.recordVersionId),
  );
  if (
    runRows.length === submissions.length &&
    runRows.every((row) => row.run.status === "succeeded")
  ) {
    break;
  }
  await delay(1_000);
}
assert.equal(runRows.length, submissions.length, "Every submission needs an AI run");
assert.ok(
  runRows.every(
    (row) =>
      row.run.status === "succeeded" &&
      row.run.provider === expectedAiProvider &&
      row.run.model === expectedAiModel,
  ),
  `Every AI run should succeed with ${expectedAiProvider}/${expectedAiModel}`,
);

const runByVersion = new Map(
  runRows.map((row) => [row.run.recordVersionId, row.run]),
);
for (const submission of submissions) {
  const run = runByVersion.get(submission.version.id);
  const bundle = await ops.request(`/api/v1/ai/runs/${run.id}`);
  const findings = bundle.findings
    .filter((finding) => !finding.safetySuspect)
    .map((finding) => ({ findingId: finding.id, decision: "approve" }));
  await ops.request(`/api/v1/review/items/${submission.record.id}/decision`, {
    method: "POST",
    body: {
      itemType: "record",
      decision: {
        action: "approve",
        annotation: "Approved after de-identification and AI-assisted classification review.",
        correctionFieldIds: [],
        researchUseStatus: "approved_for_research",
        findings,
      },
    },
  });
}

const analytics = await ops.request("/api/v1/analytics");
const e2eRecordIds = new Set(submissions.map((submission) => submission.record.id));
const reviewedRecords = await ops.request("/api/v1/records");
const approvedE2eRecords = reviewedRecords.records.filter((record) =>
  e2eRecordIds.has(record.id),
);
assert.equal(approvedE2eRecords.length, submissions.length);
assert.ok(
  approvedE2eRecords.every(
    (record) =>
      record.reviewStatus === "approved" &&
      record.researchUseStatus === "approved_for_research",
  ),
);
assert.ok(analytics.authorizedRecordCount >= submissions.length);

const researchLead = await ApiSession.login("research@cnpaf.local");
const researchAnalytics = await researchLead.request("/api/v1/analytics");
assert.ok(researchAnalytics.authorizedRecordCount >= submissions.length);

const stakeholder = await ApiSession.login("stakeholder@cnpaf.local");
const stakeholderRecords = await stakeholder.request("/api/v1/records");
const stakeholderE2eIds = new Set(
  stakeholderRecords.records
    .filter((record) => e2eRecordIds.has(record.id))
    .map((record) => record.id),
);
assert.equal(
  stakeholderE2eIds.size,
  submissions.length,
  "Approved-data stakeholder should see every approved research-eligible record",
);

const providers = await admin.request("/api/v1/ai/provider-configs");
const workflows = await admin.request("/api/v1/ai/workflows");
assert.ok(
  providers.providers.some(
    (entry) =>
      entry.provider.key === expectedAiProvider &&
      entry.models.some((model) => model.key === expectedAiModel),
  ),
  `Expected AI provider/model ${expectedAiProvider}/${expectedAiModel} is not configured`,
);
assert.ok(
  providers.providers.some((entry) => entry.provider.key === "openai"),
  "OpenAI provider interface should be configured without storing its secret",
);
assert.ok(
  workflows.workflows.some(
    (entry) =>
      entry.workflow.key === "record_classification" &&
      entry.workflow.status === "active",
  ),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      runKey,
      accounts: {
        roles: roleAccounts,
        students: studentAccounts,
        passwordSource: "SEED_PASSWORD",
      },
      setup: {
        university: locations[0].name,
        adhcLocations: locations.slice(1).map((location) => location.name),
        program: program.nameEn,
        formVersionId: templateVersionId,
        tasks: tasks.length,
      },
      collection: {
        volunteers: studentAccounts.length,
        submitted: submissions.length,
        aiClassified: runRows.length,
        approved: approvedE2eRecords.length,
      },
      analytics: {
        authorizedRecordCount: analytics.authorizedRecordCount,
        recordsBySourceKind: analytics.recordsBySourceKind,
        concernsByOrigin: analytics.concernsByOrigin,
      },
      ai: {
        providers: providers.providers.map((entry) => entry.provider.key),
        recordClassificationProvider: expectedAiProvider,
        recordClassificationModel: expectedAiModel,
        openAiInterfaceReserved: true,
      },
    },
    null,
    2,
  ),
);
