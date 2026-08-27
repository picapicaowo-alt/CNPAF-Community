import {
  bigint,
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
import { sql } from "drizzle-orm";

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
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    avatarStorageKey: text("avatar_storage_key"),
    avatarMimeType: text("avatar_mime_type"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    description: text("description"),
    organizationId: uuid("organization_id").references(() => organizations.id),
    isSystemRole: boolean("is_system_role").notNull().default(false),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("roles_global_key").on(t.key).where(sql`${t.organizationId} is null`),
    uniqueIndex("roles_org_key").on(t.organizationId, t.key).where(sql`${t.organizationId} is not null`),
    index("roles_organization").on(t.organizationId),
  ],
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    module: text("module").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [uniqueIndex("permissions_key").on(t.key), index("permissions_module").on(t.module)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id),
    effect: text("effect").notNull().default("allow"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("role_permissions_role_permission").on(t.roleId, t.permissionId),
    index("role_permissions_permission").on(t.permissionId),
  ],
);

export const userRoleAssignments = pgTable(
  "user_role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    assignedById: uuid("assigned_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("user_role_assignments_user_status").on(t.userId, t.status),
    index("user_role_assignments_role").on(t.roleId),
    index("user_role_assignments_organization").on(t.organizationId),
  ],
);

export const permissionScopeAssignments = pgTable(
  "permission_scope_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    permissionId: uuid("permission_id").references(() => permissions.id),
    roleAssignmentId: uuid("role_assignment_id").references(() => userRoleAssignments.id),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    scopeKey: text("scope_key"),
    effect: text("effect").notNull().default("allow"),
    assignedById: uuid("assigned_by_id").references(() => users.id),
    reason: text("reason"),
    ...timestamps,
  },
  (t) => [
    index("permission_scopes_user_type").on(t.userId, t.scopeType),
    index("permission_scopes_permission").on(t.permissionId),
    index("permission_scopes_role_assignment").on(t.roleAssignmentId),
    index("permission_scopes_scope_id").on(t.scopeId),
  ],
);

export const userPermissionOverrides = pgTable(
  "user_permission_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id),
    effect: text("effect").notNull(),
    scopeType: text("scope_type"),
    scopeId: uuid("scope_id"),
    scopeKey: text("scope_key"),
    assignedById: uuid("assigned_by_id").references(() => users.id),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("permission_overrides_user_permission").on(t.userId, t.permissionId),
    index("permission_overrides_expires").on(t.expiresAt),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: text("role").notNull(),
    roleId: uuid("role_id").references(() => roles.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    initialScopes: jsonb("initial_scopes").notNull().default({}),
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
    address: text("address"),
    city: text("city"),
    state: text("state"),
    country: text("country"),
    latitude: numeric("latitude", { precision: 9, scale: 6 }),
    longitude: numeric("longitude", { precision: 9, scale: 6 }),
    canonicalStatus: text("canonical_status").notNull().default("unverified"),
    mergedIntoId: uuid("merged_into_id"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("sites_name").on(t.name), index("sites_org").on(t.organizationId)],
);

export const configRegistries = pgTable(
  "config_registries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    description: text("description"),
    handlerKey: text("handler_key"),
    status: text("status").notNull().default("active"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("config_registries_key").on(t.key)],
);

export const configRegistryItems = pgTable(
  "config_registry_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registryId: uuid("registry_id").notNull().references(() => configRegistries.id),
    key: text("key").notNull(),
    version: integer("version").notNull().default(1),
    labelEn: text("label_en").notNull(),
    labelZh: text("label_zh").notNull(),
    helpTextEn: text("help_text_en"),
    helpTextZh: text("help_text_zh"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    canonicalItemId: uuid("canonical_item_id"),
    supersedesItemId: uuid("supersedes_item_id"),
    organizationId: uuid("organization_id").references(() => organizations.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("config_registry_item_key_version").on(t.registryId, t.key, t.version),
    index("config_registry_items_status_order").on(t.registryId, t.status, t.sortOrder),
    index("config_registry_items_organization").on(t.organizationId),
    index("config_registry_items_canonical").on(t.canonicalItemId),
  ],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    templateTypeKey: text("template_type_key").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    status: text("status").notNull().default("draft"),
    currentPublishedVersionId: uuid("current_published_version_id"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("templates_org_key").on(t.organizationId, t.key),
    index("templates_type_status").on(t.templateTypeKey, t.status),
  ],
);

export const templateVersions = pgTable(
  "template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id").notNull().references(() => templates.id),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    descriptionEn: text("description_en"),
    descriptionZh: text("description_zh"),
    configuration: jsonb("configuration").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("template_versions_template_version").on(t.templateId, t.version),
    index("template_versions_status").on(t.status),
  ],
);

export const templateSections = pgTable(
  "template_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateVersionId: uuid("template_version_id").notNull().references(() => templateVersions.id),
    key: text("key").notNull(),
    labelEn: text("label_en").notNull(),
    labelZh: text("label_zh").notNull(),
    helpTextEn: text("help_text_en"),
    helpTextZh: text("help_text_zh"),
    sortOrder: integer("sort_order").notNull().default(0),
    configuration: jsonb("configuration").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("template_sections_version_key").on(t.templateVersionId, t.key),
    index("template_sections_order").on(t.templateVersionId, t.sortOrder),
  ],
);

export const templateFields = pgTable(
  "template_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateSectionId: uuid("template_section_id").notNull().references(() => templateSections.id),
    key: text("key").notNull(),
    fieldTypeKey: text("field_type_key").notNull(),
    labelEn: text("label_en").notNull(),
    labelZh: text("label_zh").notNull(),
    helpTextEn: text("help_text_en"),
    helpTextZh: text("help_text_zh"),
    placeholderEn: text("placeholder_en"),
    placeholderZh: text("placeholder_zh"),
    required: boolean("required").notNull().default(false),
    allowMissingReason: boolean("allow_missing_reason").notNull().default(false),
    allowCustomEntry: boolean("allow_custom_entry").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    validation: jsonb("validation").notNull().default({}),
    visibilityConditions: jsonb("visibility_conditions").notNull().default([]),
    branchingLogic: jsonb("branching_logic").notNull().default([]),
    canonicalMapping: jsonb("canonical_mapping").notNull().default({}),
    configuration: jsonb("configuration").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("template_fields_section_key").on(t.templateSectionId, t.key),
    index("template_fields_order").on(t.templateSectionId, t.sortOrder),
  ],
);

export const templateFieldOptions = pgTable(
  "template_field_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateFieldId: uuid("template_field_id").notNull().references(() => templateFields.id),
    key: text("key").notNull(),
    labelEn: text("label_en").notNull(),
    labelZh: text("label_zh").notNull(),
    helpTextEn: text("help_text_en"),
    helpTextZh: text("help_text_zh"),
    status: text("status").notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    canonicalRegistryItemId: uuid("canonical_registry_item_id").references(() => configRegistryItems.id),
    configuration: jsonb("configuration").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("template_field_options_field_key").on(t.templateFieldId, t.key),
    index("template_field_options_order").on(t.templateFieldId, t.status, t.sortOrder),
    index("template_field_options_canonical").on(t.canonicalRegistryItemId),
  ],
);

export const programs = pgTable(
  "programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    key: text("key").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    descriptionEn: text("description_en"),
    descriptionZh: text("description_zh"),
    status: text("status").notNull().default("active"),
    configuration: jsonb("configuration").notNull().default({}),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("programs_org_key").on(t.organizationId, t.key),
    index("programs_org_status").on(t.organizationId, t.status),
  ],
);

export const programMemberships = pgTable(
  "program_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id").notNull().references(() => programs.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    membershipRoleKey: text("membership_role_key").notNull(),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    assignedById: uuid("assigned_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("program_memberships_active_unique").on(t.programId, t.userId).where(sql`${t.status} = 'active'`),
    index("program_memberships_user_status").on(t.userId, t.status),
    index("program_memberships_program_status").on(t.programId, t.status),
  ],
);

export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    institutionTypeKey: text("institution_type_key").notNull().default("organization"),
    status: text("status").notNull().default("active"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("institutions_org_name").on(t.organizationId, t.name),
    index("institutions_org_status_name").on(t.organizationId, t.status, t.name),
  ],
);

export const userAffiliations = pgTable(
  "user_affiliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    programId: uuid("program_id").references(() => programs.id),
    institutionId: uuid("institution_id").references(() => institutions.id),
    affiliationTypeKey: text("affiliation_type_key").notNull(),
    institutionName: text("institution_name").notNull(),
    institutionTypeKey: text("institution_type_key"),
    departmentName: text("department_name"),
    title: text("title"),
    metadata: jsonb("metadata").notNull().default({}),
    isPrimary: boolean("is_primary").notNull().default(false),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("user_affiliations_user_status").on(t.userId, t.status),
    index("user_affiliations_organization").on(t.organizationId),
    index("user_affiliations_program").on(t.programId),
    index("user_affiliations_institution").on(t.institutionId),
  ],
);

export const personGroups = pgTable(
  "person_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    key: text("key").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    descriptionEn: text("description_en"),
    descriptionZh: text("description_zh"),
    status: text("status").notNull().default("active"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("person_groups_org_key").on(t.organizationId, t.key),
    index("person_groups_org_status").on(t.organizationId, t.status, t.nameEn),
  ],
);

export const personGroupMemberships = pgTable(
  "person_group_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => personGroups.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    status: text("status").notNull().default("active"),
    addedById: uuid("added_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("person_group_memberships_group_user").on(t.groupId, t.userId),
    index("person_group_memberships_user_status").on(t.userId, t.status),
    index("person_group_memberships_group_status").on(t.groupId, t.status),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id").notNull().references(() => programs.id),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    templateVersionId: uuid("template_version_id").notNull().references(() => templateVersions.id),
    siteId: uuid("site_id").references(() => sites.id),
    taskTypeKey: text("task_type_key").notNull(),
    title: text("title").notNull(),
    instructions: text("instructions"),
    status: text("status").notNull().default("draft"),
    priority: integer("priority").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    configuration: jsonb("configuration").notNull().default({}),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("tasks_program_status_due").on(t.programId, t.status, t.dueAt),
    index("tasks_organization_status").on(t.organizationId, t.status),
    index("tasks_template_version").on(t.templateVersionId),
    index("tasks_site").on(t.siteId),
  ],
);

export const taskAssignments = pgTable(
  "task_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id").notNull().references(() => tasks.id),
    assigneeId: uuid("assignee_id").notNull().references(() => users.id),
    assignedById: uuid("assigned_by_id").notNull().references(() => users.id),
    status: text("status").notNull().default("assigned"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    recordId: uuid("record_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("task_assignments_task_assignee").on(t.taskId, t.assigneeId),
    index("task_assignments_assignee_status").on(t.assigneeId, t.status),
    index("task_assignments_task_status").on(t.taskId, t.status),
  ],
);

export const locationAliases = pgTable(
  "location_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id").notNull().references(() => sites.id),
    organizationId: uuid("organization_id").references(() => organizations.id),
    normalizedAlias: text("normalized_alias").notNull(),
    displayAlias: text("display_alias").notNull(),
    language: text("language"),
    status: text("status").notNull().default("active"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("location_aliases_org_normalized").on(t.organizationId, t.normalizedAlias),
    index("location_aliases_site").on(t.siteId),
  ],
);

export const locationMergeHistory = pgTable(
  "location_merge_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSiteId: uuid("source_site_id").notNull().references(() => sites.id),
    destinationSiteId: uuid("destination_site_id").notNull().references(() => sites.id),
    mergedById: uuid("merged_by_id").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    movedRecordCount: integer("moved_record_count").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("location_merge_source").on(t.sourceSiteId), index("location_merge_destination").on(t.destinationSiteId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    kindKey: text("kind_key").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    status: text("status").notNull().default("unread"),
    readAt: timestamp("read_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("notifications_user_status_created").on(t.userId, t.status, t.createdAt),
    index("notifications_entity").on(t.entityType, t.entityId),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    kindKey: text("kind_key").notNull(),
    inAppEnabled: boolean("in_app_enabled").notNull().default(true),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("notification_preferences_user_kind").on(t.userId, t.kindKey)],
);

export const taskRecurrenceSeries = pgTable(
  "task_recurrence_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateTaskId: uuid("template_task_id").notNull().references(() => tasks.id),
    frequency: text("frequency").notNull(),
    interval: integer("interval").notNull().default(1),
    timezone: text("timezone").notNull(),
    nextOccurrenceAt: timestamp("next_occurrence_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    generatedCount: integer("generated_count").notNull().default(1),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("task_recurrence_series_status_next").on(t.status, t.nextOccurrenceAt),
    uniqueIndex("task_recurrence_series_template").on(t.templateTaskId),
  ],
);

export const taskRecurrenceOccurrences = pgTable(
  "task_recurrence_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id").notNull().references(() => taskRecurrenceSeries.id),
    taskId: uuid("task_id").notNull().references(() => tasks.id),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("task_recurrence_occurrences_series_time").on(t.seriesId, t.scheduledFor),
    uniqueIndex("task_recurrence_occurrences_task").on(t.taskId),
  ],
);

export const notificationEmailDeliveries = pgTable(
  "notification_email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").notNull().references(() => notifications.id),
    provider: text("provider").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notification_email_deliveries_notification").on(t.notificationId),
    index("notification_email_deliveries_status_created").on(t.status, t.createdAt),
  ],
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
    programId: uuid("program_id").references(() => programs.id),
    taskId: uuid("task_id").references(() => tasks.id),
    taskAssignmentId: uuid("task_assignment_id").references(() => taskAssignments.id),
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
    index("records_program").on(t.programId),
    index("records_task").on(t.taskId),
    index("records_task_assignment").on(t.taskAssignmentId),
    index("records_scope_review").on(t.organizationId, t.siteId, t.sourceKind, t.reviewStatus),
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
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedById: uuid("submitted_by_id").references(() => users.id),
    activityDefinitionId: uuid("activity_definition_id").references(() => activityDefinitions.id),
    templateVersionId: uuid("template_version_id").references(() => templateVersions.id),
    quantitative: jsonb("quantitative").notNull().default({}),
    quantitativeMissing: jsonb("quantitative_missing").notNull().default({}),
    qualitative: text("qualitative").notNull().default(""),
    attribution: jsonb("attribution").notNull().default({}),
    piiAttestation: boolean("pii_attestation").notNull().default(false),
    contentLanguage: text("content_language").notNull().default("zh"),
    contentHash: text("content_hash"),
    requestFingerprint: text("request_fingerprint"),
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
      index("record_versions_template").on(t.templateVersionId),
      index("record_versions_occurred").on(t.occurredAt),
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
  contentSha256: text("content_sha256"),
  exifStripped: boolean("exif_stripped").notNull().default(true),
  sentToAi: boolean("sent_to_ai").notNull().default(false),
  ...timestamps,
});

export const recordStructuredSelections = pgTable(
  "record_structured_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordVersionId: uuid("record_version_id").notNull().references(() => recordVersions.id),
    templateFieldId: uuid("template_field_id").notNull().references(() => templateFields.id),
    optionId: uuid("option_id").notNull().references(() => templateFieldOptions.id),
    value: jsonb("value").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("record_structured_selection_unique").on(t.recordVersionId, t.templateFieldId, t.optionId),
    index("record_structured_selections_field").on(t.templateFieldId),
    index("record_structured_selections_option").on(t.optionId),
  ],
);

export const recordCustomEntries = pgTable(
  "record_custom_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordVersionId: uuid("record_version_id").notNull().references(() => recordVersions.id),
    templateFieldId: uuid("template_field_id").notNull().references(() => templateFields.id),
    categoryId: uuid("category_id").references(() => configRegistryItems.id),
    customText: text("custom_text").notNull(),
    mappingStatus: text("mapping_status").notNull().default("pending"),
    mappedCanonicalOptionId: uuid("mapped_canonical_option_id").references(() => configRegistryItems.id),
    reviewedById: uuid("reviewed_by_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("record_custom_entries_status_created").on(t.mappingStatus, t.createdAt),
    index("record_custom_entries_record_version").on(t.recordVersionId),
    index("record_custom_entries_template_field").on(t.templateFieldId),
  ],
);

export const recordFieldAnswers = pgTable(
  "record_field_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordVersionId: uuid("record_version_id")
      .notNull()
      .references(() => recordVersions.id),
    templateVersionId: uuid("template_version_id")
      .notNull()
      .references(() => templateVersions.id),
    templateSectionId: uuid("template_section_id")
      .notNull()
      .references(() => templateSections.id),
    templateFieldId: uuid("template_field_id")
      .notNull()
      .references(() => templateFields.id),
    sectionKey: text("section_key").notNull(),
    sectionLabelEn: text("section_label_en").notNull(),
    sectionLabelZh: text("section_label_zh").notNull(),
    sectionSortOrder: integer("section_sort_order").notNull().default(0),
    fieldKey: text("field_key").notNull(),
    fieldSortOrder: integer("field_sort_order").notNull().default(0),
    fieldTypeKey: text("field_type_key").notNull(),
    labelEn: text("label_en").notNull(),
    labelZh: text("label_zh").notNull(),
    value: jsonb("value"),
    missingReasonKey: text("missing_reason_key"),
    customText: text("custom_text"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("record_field_answers_version_field").on(
      t.recordVersionId,
      t.templateFieldId,
    ),
    index("record_field_answers_record_version").on(t.recordVersionId),
    index("record_field_answers_template_field").on(
      t.templateVersionId,
      t.fieldKey,
    ),
    index("record_field_answers_missing_reason").on(t.missingReasonKey),
  ],
);

export const customEntryReviews = pgTable(
  "custom_entry_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customEntryId: uuid("custom_entry_id").notNull().references(() => recordCustomEntries.id),
    reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
    action: text("action").notNull(),
    mappedCanonicalOptionId: uuid("mapped_canonical_option_id").references(() => configRegistryItems.id),
    createdOptionId: uuid("created_option_id").references(() => configRegistryItems.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("custom_entry_reviews_entry").on(t.customEntryId)],
);

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

export const outputSchemaVersions = pgTable(
  "output_schema_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    schema: jsonb("schema").notNull(),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("output_schema_key_version").on(t.key, t.version)],
);

export const aiProviderConfigs = pgTable(
  "ai_provider_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    configuration: jsonb("configuration").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("ai_provider_configs_key").on(t.key)],
);

export const aiModelConfigs = pgTable(
  "ai_model_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerConfigId: uuid("provider_config_id").notNull().references(() => aiProviderConfigs.id),
    key: text("key").notNull(),
    modelName: text("model_name").notNull(),
    status: text("status").notNull().default("active"),
    configuration: jsonb("configuration").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ai_model_configs_provider_key").on(t.providerConfigId, t.key),
    index("ai_model_configs_status").on(t.status),
  ],
);

export const aiWorkflows = pgTable(
  "ai_workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    workflowTypeKey: text("workflow_type_key").notNull(),
    status: text("status").notNull().default("draft"),
    currentPublishedVersionId: uuid("current_published_version_id"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("ai_workflows_key").on(t.key), index("ai_workflows_type_status").on(t.workflowTypeKey, t.status)],
);

export const aiWorkflowVersions = pgTable(
  "ai_workflow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => aiWorkflows.id),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id),
    outputSchemaVersionId: uuid("output_schema_version_id").references(() => outputSchemaVersions.id),
    providerConfigId: uuid("provider_config_id").references(() => aiProviderConfigs.id),
    modelConfigId: uuid("model_config_id").references(() => aiModelConfigs.id),
    triggerRules: jsonb("trigger_rules").notNull().default({}),
    permittedInputs: jsonb("permitted_inputs").notNull().default({}),
    privacyRequirements: jsonb("privacy_requirements").notNull().default({}),
    retryPolicy: jsonb("retry_policy").notNull().default({}),
    costCeiling: numeric("cost_ceiling"),
    humanApprovalRequired: boolean("human_approval_required").notNull().default(true),
    featureFlags: jsonb("feature_flags").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ai_workflow_versions_workflow_version").on(t.workflowId, t.version),
    index("ai_workflow_versions_status").on(t.status),
  ],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowVersionId: uuid("workflow_version_id").references(() => aiWorkflowVersions.id),
    recordVersionId: uuid("record_version_id").references(() => recordVersions.id),
    reportRunId: uuid("report_run_id"),
    parentAiRunId: uuid("parent_ai_run_id"),
    reviewerInstruction: text("reviewer_instruction"),
    promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id),
    outputSchemaVersionId: uuid("output_schema_version_id").references(() => outputSchemaVersions.id),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: integer("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    inputHash: text("input_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().default("queued"),
    retryCount: integer("retry_count").notNull().default(0),
    idempotencyKey: text("idempotency_key"),
    inputSnapshot: jsonb("input_snapshot").notNull().default({}),
    error: text("error"),
    rawOutput: text("raw_output"),
    parsedOutput: jsonb("parsed_output"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cost: numeric("cost"),
    tokenUsage: jsonb("token_usage").notNull().default({}),
    costMetadata: jsonb("cost_metadata").notNull().default({}),
    errorMetadata: jsonb("error_metadata").notNull().default({}),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("ai_runs_record_version_created").on(t.recordVersionId, t.createdAt),
    index("ai_runs_parent").on(t.parentAiRunId),
    index("ai_runs_workflow_status").on(t.workflowVersionId, t.status),
    index("ai_runs_output_schema").on(t.outputSchemaVersionId),
    uniqueIndex("ai_runs_idempotency").on(t.idempotencyKey),
  ],
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

export const findingReviews = pgTable(
  "finding_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aiFindingId: uuid("ai_finding_id").notNull().references(() => aiFindings.id),
    reviewerId: uuid("reviewer_id").notNull().references(() => users.id),
    decision: text("decision").notNull(),
    editedStatement: text("edited_statement"),
    canonicalRegistryItemId: uuid("canonical_registry_item_id").references(() => configRegistryItems.id),
    reviewerNotes: text("reviewer_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finding_reviews_finding_created").on(t.aiFindingId, t.createdAt)],
);

export const approvedFindings = pgTable(
  "approved_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aiFindingId: uuid("ai_finding_id").notNull().references(() => aiFindings.id),
    findingReviewId: uuid("finding_review_id").notNull().references(() => findingReviews.id),
    recordVersionId: uuid("record_version_id").references(() => recordVersions.id),
    findingType: text("finding_type").notNull(),
    approvedValue: jsonb("approved_value").notNull(),
    evidence: jsonb("evidence").notNull().default([]),
    canonicalRegistryItemId: uuid("canonical_registry_item_id").references(() => configRegistryItems.id),
    approvedById: uuid("approved_by_id").notNull().references(() => users.id),
    status: text("status").notNull().default("approved"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("approved_findings_review").on(t.findingReviewId),
    index("approved_findings_record_type").on(t.recordVersionId, t.findingType),
    index("approved_findings_canonical").on(t.canonicalRegistryItemId),
  ],
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
  correctionFieldIds: jsonb("correction_field_ids").notNull().default([]),
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

export const privacyFlags = pgTable(
  "privacy_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id").notNull().references(() => records.id),
    recordVersionId: uuid("record_version_id").notNull().references(() => recordVersions.id),
    status: text("status").notNull().default("open"),
    hits: jsonb("hits").notNull().default([]),
    redactedText: text("redacted_text"),
    resolution: text("resolution"),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("privacy_flags_status_created").on(t.status, t.createdAt),
    index("privacy_flags_record_version").on(t.recordVersionId),
  ],
);

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
    resolution: text("resolution"),
    resolutionNotes: text("resolution_notes"),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("safety_flags_status").on(t.status)],
);

export const reportTemplates = pgTable(
  "report_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    nameEn: text("name_en").notNull(),
    nameZh: text("name_zh").notNull(),
    reportTypeKey: text("report_type_key").notNull(),
    status: text("status").notNull().default("draft"),
    currentPublishedVersionId: uuid("current_published_version_id"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("report_templates_key").on(t.key)],
);

export const reportTemplateVersions = pgTable(
  "report_template_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportTemplateId: uuid("report_template_id").notNull().references(() => reportTemplates.id),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    sections: jsonb("sections").notNull().default([]),
    configuration: jsonb("configuration").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("report_template_versions_template_version").on(t.reportTemplateId, t.version)],
);

export const reportRuns = pgTable(
  "report_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportTemplateVersionId: uuid("report_template_version_id").notNull().references(() => reportTemplateVersions.id),
    workflowVersionId: uuid("workflow_version_id").references(() => aiWorkflowVersions.id),
    requestedById: uuid("requested_by_id").notNull().references(() => users.id),
    status: text("status").notNull().default("queued"),
    filters: jsonb("filters").notNull().default({}),
    evidencePolicy: jsonb("evidence_policy").notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMetadata: jsonb("error_metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("report_runs_status_created").on(t.status, t.createdAt), index("report_runs_requester").on(t.requestedById)],
);

export const reportArtifacts = pgTable(
  "report_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportRunId: uuid("report_run_id").notNull().references(() => reportRuns.id),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"),
    title: text("title").notNull(),
    content: jsonb("content").notNull(),
    approvedById: uuid("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("report_artifacts_run_version").on(t.reportRunId, t.version),
    index("report_artifacts_status").on(t.status),
  ],
);

export const reportEvidenceLinks = pgTable(
  "report_evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportArtifactId: uuid("report_artifact_id").notNull().references(() => reportArtifacts.id),
    evidenceType: text("evidence_type").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    citationLabel: text("citation_label"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("report_evidence_link_unique").on(t.reportArtifactId, t.evidenceType, t.evidenceId),
    index("report_evidence_links_evidence").on(t.evidenceType, t.evidenceId),
  ],
);

// Human-authored reports are separate from generated report artifacts. The
// artifact is an AI/output snapshot; these tables preserve authoritative edits.
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    programId: uuid("program_id").references(() => programs.id),
    reportTemplateVersionId: uuid("report_template_version_id").references(() => reportTemplateVersions.id),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    headVersionId: uuid("head_version_id"),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    publishedById: uuid("published_by_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("reports_organization_status_updated").on(t.organizationId, t.status, t.updatedAt),
    index("reports_program").on(t.programId),
    index("reports_template_version").on(t.reportTemplateVersionId),
  ],
);

export const reportVersions = pgTable(
  "report_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id").notNull().references(() => reports.id),
    versionNumber: integer("version_number").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("draft"),
    changeSummary: text("change_summary"),
    filters: jsonb("filters").notNull().default({}),
    evidencePolicy: jsonb("evidence_policy").notNull().default({}),
    sourceReportArtifactId: uuid("source_report_artifact_id").references(() => reportArtifacts.id),
    sourceDatasetVersionId: uuid("source_dataset_version_id").references(() => datasetVersions.id),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("report_versions_report_number").on(t.reportId, t.versionNumber),
    index("report_versions_report_status").on(t.reportId, t.status),
    index("report_versions_source_artifact").on(t.sourceReportArtifactId),
    index("report_versions_source_dataset_version").on(t.sourceDatasetVersionId),
  ],
);

export const reportSections = pgTable(
  "report_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportVersionId: uuid("report_version_id").notNull().references(() => reportVersions.id),
    sectionKey: text("section_key").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    aiSuggestion: text("ai_suggestion"),
    aiSuggestionRunId: uuid("ai_suggestion_run_id").references(() => aiRuns.id),
    aiSuggestionStatus: text("ai_suggestion_status").notNull().default("none"),
    aiSuggestedAt: timestamp("ai_suggested_at", { withTimezone: true }),
    lastEditedById: uuid("last_edited_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("report_sections_version_key").on(t.reportVersionId, t.sectionKey),
    index("report_sections_version_order").on(t.reportVersionId, t.sortOrder),
    index("report_sections_ai_run").on(t.aiSuggestionRunId),
  ],
);

export const reportVersionEvidenceLinks = pgTable(
  "report_version_evidence_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportVersionId: uuid("report_version_id").notNull().references(() => reportVersions.id),
    reportSectionId: uuid("report_section_id").references(() => reportSections.id),
    evidenceType: text("evidence_type").notNull(),
    evidenceId: uuid("evidence_id").notNull(),
    citationLabel: text("citation_label"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("report_version_evidence_unique").on(t.reportVersionId, t.reportSectionId, t.evidenceType, t.evidenceId),
    index("report_version_evidence_lookup").on(t.evidenceType, t.evidenceId),
  ],
);

export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    programId: uuid("program_id").references(() => programs.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("active"),
    dataClassification: text("data_classification").notNull().default("approved_evidence"),
    selectionQuery: jsonb("selection_query").notNull().default({}),
    fieldPolicy: jsonb("field_policy").notNull().default({}),
    headVersionId: uuid("head_version_id"),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("datasets_organization_status_updated").on(t.organizationId, t.status, t.updatedAt),
    index("datasets_program").on(t.programId),
  ],
);

export const datasetVersions = pgTable(
  "dataset_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id").notNull().references(() => datasets.id),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("building"),
    selectionQuery: jsonb("selection_query").notNull().default({}),
    fieldPolicy: jsonb("field_policy").notNull().default({}),
    recordCount: integer("record_count").notNull().default(0),
    contentHash: text("content_hash").notNull(),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dataset_versions_dataset_number").on(t.datasetId, t.versionNumber),
    index("dataset_versions_dataset_created").on(t.datasetId, t.createdAt),
  ],
);

export const datasetRecords = pgTable(
  "dataset_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetVersionId: uuid("dataset_version_id").notNull().references(() => datasetVersions.id),
    recordId: uuid("record_id").notNull().references(() => records.id),
    recordVersionId: uuid("record_version_id").notNull().references(() => recordVersions.id),
    ordinal: integer("ordinal").notNull(),
    includedFields: jsonb("included_fields").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("dataset_records_version_record").on(t.datasetVersionId, t.recordId),
    uniqueIndex("dataset_records_version_ordinal").on(t.datasetVersionId, t.ordinal),
    index("dataset_records_record_version").on(t.recordVersionId),
  ],
);

export const sharedDatasets = pgTable(
  "shared_datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetVersionId: uuid("dataset_version_id").notNull().references(() => datasetVersions.id),
    tokenHash: text("token_hash").notNull(),
    recipientLabel: text("recipient_label"),
    accessScope: jsonb("access_scope").notNull().default({}),
    status: text("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedById: uuid("revoked_by_id").references(() => users.id),
    createdById: uuid("created_by_id").notNull().references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("shared_datasets_token_hash").on(t.tokenHash),
    index("shared_datasets_version_status").on(t.datasetVersionId, t.status),
    index("shared_datasets_expires").on(t.expiresAt),
  ],
);

export const sharedDatasetAccessLogs = pgTable(
  "shared_dataset_access_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sharedDatasetId: uuid("shared_dataset_id").notNull().references(() => sharedDatasets.id),
    action: text("action").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    requestId: text("request_id"),
    ipHash: text("ip_hash"),
    userAgentHash: text("user_agent_hash"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shared_dataset_access_share_created").on(t.sharedDatasetId, t.createdAt)],
);

export const askConversations = pgTable(
  "ask_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    title: text("title"),
    scope: jsonb("scope").notNull().default({}),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (t) => [index("ask_conversations_user_updated").on(t.userId, t.updatedAt)],
);

export const askMessages = pgTable(
  "ask_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id").notNull().references(() => askConversations.id),
    role: text("role").notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().default("completed"),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ask_messages_conversation_created").on(t.conversationId, t.createdAt)],
);

export const askMessageSources = pgTable(
  "ask_message_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => askMessages.id),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    citationLabel: text("citation_label"),
    excerpt: text("excerpt"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ask_message_sources_message").on(t.messageId), index("ask_message_sources_source").on(t.sourceType, t.sourceId)],
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
    idempotencyKey: text("idempotency_key"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("jobs_status_run").on(t.status, t.runAfter),
    uniqueIndex("jobs_idempotency").on(t.idempotencyKey),
  ],
);

export const exportJobs = pgTable(
  "export_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedById: uuid("requested_by_id").notNull().references(() => users.id),
    exportTypeKey: text("export_type_key").notNull(),
    status: text("status").notNull().default("queued"),
    scope: jsonb("scope").notNull().default({}),
    filters: jsonb("filters").notNull().default({}),
    dataClassification: text("data_classification").notNull().default("approved_evidence"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    errorMetadata: jsonb("error_metadata").notNull().default({}),
    approvedById: uuid("approved_by_id").references(() => users.id),
    recordVersionId: uuid("record_version_id").references(() => recordVersions.id),
    datasetVersionId: uuid("dataset_version_id").references(() => datasetVersions.id),
    ...timestamps,
  },
  (t) => [
    index("export_jobs_requester_created").on(t.requestedById, t.createdAt),
    index("export_jobs_status_created").on(t.status, t.createdAt),
    index("export_jobs_record_version").on(t.recordVersionId),
    index("export_jobs_dataset_version").on(t.datasetVersionId),
  ],
);

/**
 * Operational ledger for resumable object-storage migrations. Application
 * records continue to store backend-neutral storage keys; this ledger records
 * immutable source checksums and destination verification independently.
 */
export const storageMigrationRuns = pgTable(
  "storage_migration_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceBackend: text("source_backend").notNull(),
    targetBackend: text("target_backend").notNull(),
    status: text("status").notNull().default("manifested"),
    manifestHash: text("manifest_hash").notNull(),
    totalObjects: integer("total_objects").notNull().default(0),
    totalBytes: bigint("total_bytes", { mode: "number" }).notNull().default(0),
    completedObjects: integer("completed_objects").notNull().default(0),
    verifiedObjects: integer("verified_objects").notNull().default(0),
    failedObjects: integer("failed_objects").notNull().default(0),
    metadata: jsonb("metadata").notNull().default({}),
    ...timestamps,
  },
  (t) => [index("storage_migration_runs_status_created").on(t.status, t.createdAt)],
);

export const storageMigrationObjects = pgTable(
  "storage_migration_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    migrationRunId: uuid("migration_run_id").notNull().references(() => storageMigrationRuns.id),
    storageKey: text("storage_key").notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    status: text("status").notNull().default("pending"),
    targetEtag: text("target_etag"),
    lastError: text("last_error"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("storage_migration_objects_run_key").on(t.migrationRunId, t.storageKey),
    index("storage_migration_objects_run_status").on(t.migrationRunId, t.status),
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
    targetUserId: uuid("target_user_id").references(() => users.id),
    beforeState: jsonb("before_state"),
    afterState: jsonb("after_state"),
    reason: text("reason"),
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
  roles,
  permissions,
  rolePermissions,
  userRoleAssignments,
  permissionScopeAssignments,
  userPermissionOverrides,
  invites,
  sessions,
  sites,
  configRegistries,
  configRegistryItems,
  templates,
  templateVersions,
  templateSections,
  templateFields,
  templateFieldOptions,
  programs,
  programMemberships,
  institutions,
  userAffiliations,
  tasks,
  taskAssignments,
  locationAliases,
  locationMergeHistory,
  notifications,
  notificationPreferences,
  taskRecurrenceSeries,
  taskRecurrenceOccurrences,
  notificationEmailDeliveries,
  activityDefinitions,
  promptVersions,
  canonicalThemes,
  visits,
  records,
  recordVersions,
  attachments,
  recordStructuredSelections,
  recordCustomEntries,
  recordFieldAnswers,
  customEntryReviews,
  themeMappings,
  outputSchemaVersions,
  aiProviderConfigs,
  aiModelConfigs,
  aiWorkflows,
  aiWorkflowVersions,
  aiRuns,
  aiFindings,
  findingReviews,
  approvedFindings,
  reviewDecisions,
  concerns,
  annotations,
  privacyFlags,
  safetyFlags,
  reportTemplates,
  reportTemplateVersions,
  reportRuns,
  reportArtifacts,
  reportEvidenceLinks,
  reports,
  reportVersions,
  reportSections,
  reportVersionEvidenceLinks,
  datasets,
  datasetVersions,
  datasetRecords,
  sharedDatasets,
  sharedDatasetAccessLogs,
  askConversations,
  askMessages,
  askMessageSources,
  jobs,
  exportJobs,
  storageMigrationRuns,
  storageMigrationObjects,
  auditEvents,
  featureFlags,
};
