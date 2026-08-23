import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const lookups = pgTable(
  "lookups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull(),
    key: text("key").notNull(),
    nameZh: text("name_zh").notNull(),
    nameEn: text("name_en").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("lookups_category_key").on(t.category, t.key)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  collectionPurpose: text("collection_purpose").notNull().default("operational"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    locale: text("locale").notNull().default("zh"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("invites_token_hash").on(t.tokenHash)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("sessions_token_hash").on(t.tokenHash), index("sessions_user").on(t.userId)],
);

export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    name: text("name").notNull(),
    siteType: text("site_type").notNull(),
    region: text("region"),
    canonicalStatus: text("canonical_status").notNull().default("unverified"),
    mergedIntoId: uuid("merged_into_id"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("sites_name").on(t.name), index("sites_org").on(t.organizationId)],
);

export const activityDefinitions = pgTable(
  "activity_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    nameZh: text("name_zh").notNull(),
    nameEn: text("name_en").notNull(),
    fields: jsonb("fields").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("activity_def_key_version").on(t.key, t.version)],
);

export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    outputSchemaVersion: text("output_schema_version").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("prompt_versions_version").on(t.version)],
);

export const canonicalThemes = pgTable(
  "canonical_themes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("active"),
    nameZh: text("name_zh").notNull(),
    nameEn: text("name_en").notNull(),
    definition: text("definition").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("canonical_themes_key_version").on(t.key, t.version)],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").references(() => sites.id),
    activityDefinitionId: uuid("activity_definition_id").references(() => activityDefinitions.id),
    conductedById: uuid("conducted_by_id")
      .notNull()
      .references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("visits_site").on(t.siteId), index("visits_user").on(t.conductedById)],
);

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientRecordId: uuid("client_record_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    visitId: uuid("visit_id").references(() => visits.id),
    siteId: uuid("site_id").references(() => sites.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    activityDefinitionId: uuid("activity_definition_id").references(() => activityDefinitions.id),
    collectionPurpose: text("collection_purpose").notNull().default("operational"),
    researchUseStatus: text("research_use_status").notNull().default("not_assessed"),
    recordStatus: text("record_status").notNull().default("draft"),
    reviewStatus: text("review_status").notNull().default("not_submitted"),
    aiStatus: text("ai_status").notNull().default("not_required"),
    privacyStatus: text("privacy_status").notNull().default("not_scanned"),
    headVersionId: uuid("head_version_id"),
    completenessScore: numeric("completeness_score"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("records_client_id").on(t.clientRecordId),
    index("records_created_by").on(t.createdById),
    index("records_review").on(t.reviewStatus),
    index("records_source").on(t.sourceKind),
  ],
);

export const recordVersions = pgTable(
  "record_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id),
    versionNumber: integer("version_number").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedById: uuid("submitted_by_id").references(() => users.id),
    activityDefinitionId: uuid("activity_definition_id").references(() => activityDefinitions.id),
    quantitative: jsonb("quantitative").notNull().default({}),
    quantitativeMissing: jsonb("quantitative_missing").notNull().default({}),
    qualitative: text("qualitative").notNull().default(""),
    attribution: jsonb("attribution").notNull().default({}),
    piiAttestation: boolean("pii_attestation").notNull().default(false),
    contentLanguage: text("content_language").notNull().default("zh"),
    contentHash: text("content_hash"),
    localVersion: integer("local_version").notNull().default(1),
    serverVersion: integer("server_version").notNull().default(1),
    idempotencyKey: text("idempotency_key"),
    isSnapshot: boolean("is_snapshot").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("record_versions_record_n").on(t.recordId, t.versionNumber),
    uniqueIndex("record_versions_idempotency").on(t.idempotencyKey),
    index("record_versions_record").on(t.recordId),
  ],
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordVersionId: uuid("record_version_id")
    .notNull()
    .references(() => recordVersions.id),
  kind: text("kind").notNull().default("photo"),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull().default(0),
  exifStripped: boolean("exif_stripped").notNull().default(true),
  sentToAi: boolean("sent_to_ai").notNull().default(false),
  ...timestamps,
});

export const themeMappings = pgTable(
  "theme_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawLabel: text("raw_label").notNull(),
    canonicalThemeId: uuid("canonical_theme_id")
      .notNull()
      .references(() => canonicalThemes.id),
    confidence: numeric("confidence"),
    approvedById: uuid("approved_by_id").references(() => users.id),
    reviewDecisionId: uuid("review_decision_id"),
    status: text("status").notNull().default("proposed"),
    ...timestamps,
  },
  (t) => [index("theme_mappings_raw").on(t.rawLabel)],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordVersionId: uuid("record_version_id")
      .notNull()
      .references(() => recordVersions.id),
    promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    inputHash: text("input_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status").notNull().default("queued"),
    error: text("error"),
    rawOutput: text("raw_output"),
    parsedOutput: jsonb("parsed_output"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cost: numeric("cost"),
    ...timestamps,
  },
  (t) => [uniqueIndex("ai_runs_record_version").on(t.recordVersionId)],
);

export const aiFindings = pgTable(
  "ai_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aiRunId: uuid("ai_run_id")
      .notNull()
      .references(() => aiRuns.id),
    kind: text("kind").notNull(),
    statement: text("statement").notNull(),
    suggestedRawLabel: text("suggested_raw_label"),
    suggestedCanonicalThemeId: uuid("suggested_canonical_theme_id").references(
      () => canonicalThemes.id,
    ),
    origin: text("origin"),
    confidence: numeric("confidence"),
    evidence: jsonb("evidence").notNull().default([]),
    safetySuspect: boolean("safety_suspect").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("ai_findings_run").on(t.aiRunId)],
);

export const reviewDecisions = pgTable("review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id")
    .notNull()
    .references(() => records.id),
  recordVersionId: uuid("record_version_id")
    .notNull()
    .references(() => recordVersions.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  annotation: text("annotation"),
  findingDecisions: jsonb("finding_decisions").notNull().default([]),
  ...timestamps,
});

export const concerns = pgTable(
  "concerns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id),
    recordVersionId: uuid("record_version_id")
      .notNull()
      .references(() => recordVersions.id),
    aiFindingId: uuid("ai_finding_id").references(() => aiFindings.id),
    statement: text("statement").notNull(),
    canonicalThemeId: uuid("canonical_theme_id").references(() => canonicalThemes.id),
    origin: text("origin").notNull(),
    evidence: jsonb("evidence").notNull().default([]),
    reviewStatus: text("review_status").notNull().default("approved"),
    aiConfidence: numeric("ai_confidence"),
    ...timestamps,
  },
  (t) => [index("concerns_origin").on(t.origin), index("concerns_theme").on(t.canonicalThemeId)],
);

export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  recordId: uuid("record_id")
    .notNull()
    .references(() => records.id),
  recordVersionId: uuid("record_version_id").references(() => recordVersions.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  visibleToVolunteer: boolean("visible_to_volunteer").notNull().default(true),
  ...timestamps,
});

export const safetyFlags = pgTable(
  "safety_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id),
    recordVersionId: uuid("record_version_id").references(() => recordVersions.id),
    aiFindingId: uuid("ai_finding_id").references(() => aiFindings.id),
    statement: text("statement").notNull(),
    flagType: text("flag_type").notNull().default("urgent_human_review"),
    status: text("status").notNull().default("open"),
    evidence: jsonb("evidence").notNull().default([]),
    ...timestamps,
  },
  (t) => [index("safety_flags_status").on(t.status)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    recordVersionId: uuid("record_version_id").references(() => recordVersions.id),
    payload: jsonb("payload").notNull().default({}),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("jobs_kind_version").on(t.kind, t.recordVersionId),
    index("jobs_status_run").on(t.status, t.runAfter),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity").on(t.entityType, t.entityId)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("feature_flags_key").on(t.key)],
);

export const schema = {
  lookups,
  organizations,
  users,
  invites,
  sessions,
  sites,
  activityDefinitions,
  promptVersions,
  canonicalThemes,
  visits,
  records,
  recordVersions,
  attachments,
  themeMappings,
  aiRuns,
  aiFindings,
  reviewDecisions,
  concerns,
  annotations,
  safetyFlags,
  jobs,
  auditEvents,
  featureFlags,
};
