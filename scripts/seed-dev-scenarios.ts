import { createHash } from "node:crypto";
import { config } from "dotenv";
import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "@cnpaf/db";
import {
  annotations,
  auditEvents,
  programMemberships,
  programs,
  recordFieldAnswers,
  records,
  recordVersions,
  reviewDecisions,
  sites,
  taskAssignments,
  tasks,
  templateFields,
  templateSections,
  templates,
  templateVersions,
  users,
} from "@cnpaf/db/schema";

config({ path: ".env" });
config({ path: "apps/web/.env.local" });

const TARGET = process.env.CNPAF_DATA_TARGET?.trim();
if (TARGET !== "dev") {
  throw new Error("CNPAF_DATA_TARGET=dev is required; this fixture never runs against an unspecified or production target");
}

const SCENARIO_KEY = "cnpaf-community-workflows-2026-v1";
const db = createDb();

function stableUuid(key: string) {
  const hex = createHash("sha256").update(`${SCENARIO_KEY}:${key}`).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(hex[16]!, 16) % 4]!;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function daysAgo(days: number, hour = 10) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

const requiredAccounts = [
  "admin@cnpaf.local",
  "ops@cnpaf.local",
  "usc.gerontology.alex@cnpaf.local",
  "usc.gerontology.maya@cnpaf.local",
  "usc.socialwork.jordan@cnpaf.local",
  "usc.publicpolicy.priya@cnpaf.local",
  "usc.engineering.ethan@cnpaf.local",
  "usc.medicine.sofia@cnpaf.local",
  "usc.dornsife.noah@cnpaf.local",
] as const;

const fieldDefinitions = [
  { key: "attendance-estimate", fieldTypeKey: "number", labelEn: "Participants present", labelZh: "现场参与人数", required: true },
  { key: "mobility-access-rating", fieldTypeKey: "rating_scale", labelEn: "Mobility accessibility", labelZh: "行动无障碍程度", required: true },
  { key: "language-access", fieldTypeKey: "multi_select", labelEn: "Languages requested", labelZh: "需要提供的语言", required: true },
  { key: "transport-barriers", fieldTypeKey: "long_text", labelEn: "Transportation barriers", labelZh: "交通接送障碍", required: true },
  { key: "program-preferences", fieldTypeKey: "long_text", labelEn: "Activity preferences", labelZh: "活动偏好", required: true },
  { key: "follow-up-required", fieldTypeKey: "boolean", labelEn: "Follow-up required", labelZh: "是否需要跟进", required: true },
  { key: "staff-observation", fieldTypeKey: "long_text", labelEn: "Staff observation", labelZh: "工作人员观察", required: true },
  { key: "next-action", fieldTypeKey: "long_text", labelEn: "Recommended next action", labelZh: "建议的下一步行动", required: true },
] as const;

const workflows = [
  {
    key: "golden-years-accessibility",
    location: { name: "Golden Years Adult Day Health Care", city: "Monterey Park", address: "Monterey Park, CA" },
    taskTitle: "Weekly accessibility and transportation check-in — Golden Years ADHC",
    dueOffset: 2,
    records: [
      { collector: requiredAccounts[2], status: "approved", days: 12, attendance: 27, mobility: 4, languages: ["Mandarin", "Cantonese"], transport: "Two participants reported that return trips after 3:30 p.m. require more reliable pickup windows.", preferences: "Seated tai chi, calligraphy, and small-group music were the most frequently requested activities.", followUp: true, staff: "The west entrance remained accessible; staff assisted one participant with the heavier interior door.", next: "Confirm the transportation vendor's late-afternoon capacity and add bilingual pickup reminders." },
      { collector: requiredAccounts[3], status: "approved", days: 8, attendance: 31, mobility: 5, languages: ["Mandarin", "English"], transport: "No missed pickups were reported. Two families asked for text notifications when vehicles leave the center.", preferences: "Participants preferred a mix of low-impact exercise and memory games after lunch.", followUp: true, staff: "The revised large-print schedule was used independently by several participants.", next: "Pilot opt-in departure text notifications with de-identified household contact records." },
      { collector: requiredAccounts[4], status: "pending", days: 3, attendance: 24, mobility: 4, languages: ["Cantonese", "English"], transport: "One route arrived 18 minutes late during road construction on Atlantic Boulevard.", preferences: "Participants requested one additional intergenerational activity each month.", followUp: true, staff: "Staff recorded the delay and provided an indoor waiting area with seating.", next: "Reviewer should verify the transportation delay log before approving the operational finding." },
    ],
  },
  {
    key: "harmony-language-follow-up",
    location: { name: "Harmony Adult Day Health Care", city: "San Gabriel", address: "San Gabriel, CA" },
    taskTitle: "Multilingual activity schedule follow-up — Harmony ADHC",
    dueOffset: 5,
    records: [
      { collector: requiredAccounts[5], status: "needs_completion", days: 10, attendance: 19, mobility: 3, languages: ["Mandarin", "Vietnamese"], transport: "The original note did not distinguish center-operated transportation from family-arranged rides.", preferences: "Participants requested gardening and familiar-song sessions.", followUp: true, staff: "Reviewer requested the source of the transportation count and the observation time.", next: "Add the route source, observation window, and separate family rides from center transportation." },
      { collector: requiredAccounts[6], status: "pending", days: 2, attendance: 22, mobility: 4, languages: ["Mandarin", "Vietnamese", "English"], transport: "Three caregivers asked whether standing pickup windows could be narrowed from 45 to 20 minutes.", preferences: "A bilingual cooking demonstration and chair yoga had the strongest sign-up interest.", followUp: true, staff: "Front-desk staff confirmed that translated schedules are currently printed weekly.", next: "Review pickup logs for two weeks before changing the published transportation window." },
      { collector: requiredAccounts[7], status: "draft", days: 0, attendance: 17, mobility: 4, languages: ["Mandarin", "English"], transport: "Draft observation: one caregiver asked about an earlier Friday return route.", preferences: "Draft notes indicate interest in watercolor and walking groups.", followUp: true, staff: "Collector is waiting for the shift lead to confirm the Friday route detail.", next: "Confirm the route detail and complete the form before submission." },
    ],
  },
  {
    key: "evergreen-caregiver-respite",
    location: { name: "Evergreen Adult Day Health Care", city: "Alhambra", address: "Alhambra, CA" },
    taskTitle: "Caregiver respite and weekend programming review — Evergreen ADHC",
    dueOffset: 9,
    records: [
      { collector: requiredAccounts[8], status: "draft", days: 1, attendance: 26, mobility: 5, languages: ["Mandarin", "Spanish", "English"], transport: "Draft notes show no transportation interruption during the observation window.", preferences: "Several caregivers asked about one Saturday respite session per month.", followUp: true, staff: "Weekend staffing availability has not yet been confirmed.", next: "Complete the staffing interview and add a feasible pilot window." },
      { collector: requiredAccounts[2], status: "approved", days: 15, attendance: 29, mobility: 4, languages: ["Mandarin", "Spanish"], transport: "Families using the eastern route reported consistent arrivals within the published 30-minute window.", preferences: "Music therapy and caregiver education were the highest-priority additions in the listening session.", followUp: true, staff: "The observation covered a full morning program and used the approved de-identification checklist.", next: "Schedule a bilingual caregiver education pilot and measure registration, attendance, and cancellations." },
      { collector: requiredAccounts[4], status: "approved", days: 6, attendance: 25, mobility: 4, languages: ["Mandarin", "English"], transport: "One wheelchair-accessible vehicle was available; no participant was turned away during the observed period.", preferences: "Participants asked for more outdoor time when air quality permits.", followUp: false, staff: "Staff used the air-quality threshold already documented in the operating plan.", next: "Continue the current process and reassess outdoor participation after four weeks." },
    ],
  },
] as const;

async function main() {
const accountRows = await db.select().from(users).where(inArray(users.email, [...requiredAccounts]));
const accountByEmail = new Map(accountRows.map((user) => [user.email, user]));
const missing = requiredAccounts.filter((email) => !accountByEmail.has(email));
if (missing.length) throw new Error(`Missing synthetic accounts: ${missing.join(", ")}`);
if (accountRows.some((user) => !user.email.endsWith("@cnpaf.local"))) throw new Error("Fixture safety check failed: a non-synthetic account entered scope");
const admin = accountByEmail.get(requiredAccounts[0])!;
const reviewer = accountByEmail.get(requiredAccounts[1])!;
if (!admin.organizationId) throw new Error("Synthetic admin must belong to a development organization");
const organizationId = admin.organizationId;

const templateId = stableUuid("template");
const templateVersionId = stableUuid("template-version");
const sectionId = stableUuid("template-section");
const existingTemplate = (await db.select().from(templates).where(and(eq(templates.organizationId, organizationId), eq(templates.key, "community-access-follow-up"))).limit(1))[0];
if (!existingTemplate) {
  await db.transaction(async (tx) => {
    await tx.insert(templates).values({ id: templateId, key: "community-access-follow-up", templateTypeKey: "observation", organizationId, status: "published", currentPublishedVersionId: templateVersionId, createdById: admin.id });
    await tx.insert(templateVersions).values({ id: templateVersionId, templateId, version: 1, status: "published", nameEn: "Community Access and Follow-up Visit", nameZh: "社区服务可及性与跟进访视表", descriptionEn: "Structured operational follow-up for accessibility, language, transportation, and program preference observations.", descriptionZh: "用于记录无障碍、语言、交通接送与活动偏好的结构化运营访视。", configuration: { fixture: SCENARIO_KEY }, publishedAt: daysAgo(30), createdById: admin.id });
    await tx.insert(templateSections).values({ id: sectionId, templateVersionId, key: "visit-observation", labelEn: "Visit observation", labelZh: "访视观察", helpTextEn: "Record de-identified operational observations only.", helpTextZh: "仅记录已去标识化的运营观察。", sortOrder: 0 });
    await tx.insert(templateFields).values(fieldDefinitions.map((field, index) => ({ id: stableUuid(`field:${field.key}`), templateSectionId: sectionId, ...field, sortOrder: index, allowMissingReason: false, allowCustomEntry: false, validation: field.fieldTypeKey === "rating_scale" ? { min: 1, max: 5 } : {}, configuration: { fixture: SCENARIO_KEY } })));
  });
}
const actualTemplate = existingTemplate ?? (await db.select().from(templates).where(eq(templates.id, templateId)).limit(1))[0];
const actualVersionId = actualTemplate.currentPublishedVersionId ?? templateVersionId;
const fieldRows = await db.select().from(templateFields).innerJoin(templateSections, eq(templateFields.templateSectionId, templateSections.id)).where(eq(templateSections.templateVersionId, actualVersionId));
const fieldByKey = new Map(fieldRows.map(({ template_fields: field }) => [field.key, field]));
if (fieldByKey.size !== fieldDefinitions.length) throw new Error("Development scenario form does not match the expected field contract");

const programId = stableUuid("program");
let program = (await db.select().from(programs).where(and(eq(programs.organizationId, organizationId), eq(programs.key, "community-access-pilot-2026"))).limit(1))[0];
if (!program) {
  [program] = await db.insert(programs).values({ id: programId, organizationId, key: "community-access-pilot-2026", nameEn: "Community Access Improvement Pilot 2026", nameZh: "2026 社区服务可及性改进试点", descriptionEn: "A realistic development workflow spanning accessibility observation, reviewer follow-up, and approved operational evidence.", descriptionZh: "覆盖可及性观察、审核补充与已批准运营证据的开发环境业务流。", status: "active", configuration: { fixture: SCENARIO_KEY }, createdById: admin.id }).returning();
}
for (const email of requiredAccounts.slice(2)) {
  await db.insert(programMemberships).values({ id: stableUuid(`membership:${email}`), programId: program.id, userId: accountByEmail.get(email)!.id, membershipRoleKey: "member", status: "active", assignedById: admin.id }).onConflictDoNothing();
}

const createdSummary: Array<{ workflow: string; task: string; states: string[] }> = [];
for (const workflow of workflows) {
  let location = (await db.select().from(sites).where(and(eq(sites.organizationId, organizationId), eq(sites.name, workflow.location.name))).limit(1))[0];
  if (!location) {
    [location] = await db.insert(sites).values({ id: stableUuid(`site:${workflow.key}`), organizationId, name: workflow.location.name, siteType: "adhc", region: "Los Angeles County", city: workflow.location.city, state: "CA", country: "United States", address: workflow.location.address, canonicalStatus: "canonical", createdById: admin.id }).returning();
  }
  const taskId = stableUuid(`task:${workflow.key}`);
  let task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
  if (!task) {
    [task] = await db.insert(tasks).values({ id: taskId, programId: program.id, organizationId, templateVersionId: actualVersionId, siteId: location.id, taskTypeKey: "data_collection", title: workflow.taskTitle, instructions: "Complete a de-identified operational observation, verify the source of each statement, and submit it for human review.", status: "open", priority: 8, opensAt: daysAgo(16), dueAt: daysAgo(-workflow.dueOffset), closesAt: daysAgo(-workflow.dueOffset - 14), configuration: { fixture: SCENARIO_KEY, workflow: workflow.key }, createdById: admin.id }).returning();
  }
  for (const [index, fixture] of workflow.records.entries()) {
    const collector = accountByEmail.get(fixture.collector)!;
    const recordId = stableUuid(`record:${workflow.key}:${index}`);
    const versionId = stableUuid(`version:${workflow.key}:${index}`);
    const assignmentId = stableUuid(`assignment:${workflow.key}:${fixture.collector}`);
    const occurredAt = daysAgo(fixture.days, 17);
    const snapshot = fixture.status !== "draft";
    const recordStatus = fixture.status === "draft" || fixture.status === "needs_completion" ? "draft" : "submitted";
    const reviewStatus = fixture.status;
    const assignmentStatus = fixture.status === "draft" ? "in_progress" : "completed";
    await db.insert(taskAssignments).values({ id: assignmentId, taskId: task.id, assigneeId: collector.id, assignedById: admin.id, status: assignmentStatus, assignedAt: daysAgo(18), startedAt: daysAgo(Math.max(fixture.days + 1, 1)), completedAt: assignmentStatus === "completed" ? occurredAt : null, recordId }).onConflictDoNothing();
    const exists = (await db.select({ id: records.id }).from(records).where(eq(records.id, recordId)).limit(1))[0];
    if (exists) continue;
    await db.transaction(async (tx) => {
      await tx.insert(records).values({ id: recordId, clientRecordId: stableUuid(`client:${workflow.key}:${index}`), sourceKind: "field_visit", siteId: location.id, organizationId, programId: program.id, taskId: task.id, taskAssignmentId: assignmentId, createdById: collector.id, collectionPurpose: "operational", researchUseStatus: fixture.status === "approved" ? "approved_for_research" : "not_assessed", recordStatus, reviewStatus, aiStatus: "not_required", privacyStatus: "clear", headVersionId: versionId, completenessScore: "1.000", createdAt: occurredAt, updatedAt: occurredAt });
      await tx.insert(recordVersions).values({ id: versionId, recordId, versionNumber: 1, occurredAt, submittedAt: snapshot ? occurredAt : null, submittedById: snapshot ? collector.id : null, templateVersionId: actualVersionId, quantitative: {}, qualitative: `${fixture.staff} ${fixture.next}`, attribution: {}, piiAttestation: true, contentLanguage: "en", localVersion: 1, serverVersion: 1, isSnapshot: snapshot, createdAt: occurredAt, updatedAt: occurredAt });
      const valuesByKey: Record<string, string | number | boolean | string[]> = { "attendance-estimate": fixture.attendance, "mobility-access-rating": fixture.mobility, "language-access": [...fixture.languages], "transport-barriers": fixture.transport, "program-preferences": fixture.preferences, "follow-up-required": fixture.followUp, "staff-observation": fixture.staff, "next-action": fixture.next };
      await tx.insert(recordFieldAnswers).values(fieldDefinitions.map((definition, fieldIndex) => { const field = fieldByKey.get(definition.key)!; return { id: stableUuid(`answer:${workflow.key}:${index}:${definition.key}`), recordVersionId: versionId, templateVersionId: actualVersionId, templateSectionId: field.templateSectionId, templateFieldId: field.id, sectionKey: "visit-observation", sectionLabelEn: "Visit observation", sectionLabelZh: "访视观察", sectionSortOrder: 0, fieldKey: definition.key, fieldSortOrder: fieldIndex, fieldTypeKey: definition.fieldTypeKey, labelEn: definition.labelEn, labelZh: definition.labelZh, value: valuesByKey[definition.key] }; }));
      if (fixture.status === "approved" || fixture.status === "needs_completion") {
        const decisionId = stableUuid(`decision:${workflow.key}:${index}`);
        await tx.insert(reviewDecisions).values({ id: decisionId, recordId, recordVersionId: versionId, reviewerId: reviewer.id, action: fixture.status === "approved" ? "approve" : "needs_completion", annotation: fixture.status === "approved" ? "Approved after source, privacy, and completeness checks." : "Please identify the transportation source and observation window before resubmitting.", correctionFieldIds: fixture.status === "needs_completion" ? [fieldByKey.get("transport-barriers")!.id, fieldByKey.get("staff-observation")!.id] : [], findingDecisions: [], createdAt: daysAgo(Math.max(fixture.days - 1, 0)) });
        if (fixture.status === "needs_completion") await tx.insert(annotations).values({ id: stableUuid(`annotation:${workflow.key}:${index}`), recordId, recordVersionId: versionId, authorId: reviewer.id, body: "Please identify the transportation source and observation window before resubmitting.", visibleToVolunteer: true, createdAt: daysAgo(Math.max(fixture.days - 1, 0)) });
      }
      await tx.insert(auditEvents).values({ id: stableUuid(`audit:${workflow.key}:${index}`), actorId: collector.id, action: snapshot ? "submit" : "draft.saved", entityType: "record", entityId: recordId, afterState: { fixture: SCENARIO_KEY, status: fixture.status }, metadata: { workflow: workflow.key }, createdAt: occurredAt });
    });
  }
  createdSummary.push({ workflow: workflow.key, task: task.title, states: workflow.records.map((record) => record.status) });
}

console.log(JSON.stringify({ ok: true, target: TARGET, fixture: SCENARIO_KEY, program: program.nameEn, workflows: createdSummary }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
