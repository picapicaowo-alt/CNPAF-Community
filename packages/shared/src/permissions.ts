export const PERMISSION_KEYS = [
  "records.create",
  "records.edit_own",
  "records.submit",
  "records.view_own",
  "records.view",
  "records.view_approved",
  "records.view_restricted_pii",
  "records.review",
  "records.return",
  "records.download",
  "records.share",
  "privacy.view",
  "privacy.redact",
  "privacy.resolve",
  "safety.view",
  "safety.resolve",
  "templates.view",
  "templates.create",
  "templates.edit",
  "templates.publish",
  "templates.archive",
  "taxonomy.view",
  "taxonomy.edit",
  "taxonomy.approve_mapping",
  "ai.view_runs",
  "ai.retry_run",
  "ai.review_findings",
  "ai.request_reclassification",
  "ai.configure_workflows",
  "ai.configure_prompts",
  "analytics.view",
  "reports.view",
  "reports.generate",
  "reports.edit",
  "reports.publish",
  "chat.ask_collect",
  "ask_collect.use",
  "exports.create",
  "exports.download",
  "exports.research",
  "users.view",
  "users.invite",
  "users.edit",
  "users.deactivate",
  "people.view",
  "people.create_account",
  "people.reset_password",
  "people.edit_profile",
  "people.edit_affiliation",
  "roles.view",
  "roles.assign",
  "roles.manage",
  "permissions.assign",
  "sites.manage",
  "locations.view",
  "locations.manage",
  "programs.view",
  "programs.manage",
  "programs.manage_membership",
  "tasks.view",
  "tasks.create",
  "tasks.assign",
  "tasks.edit",
  "review.view",
  "review.decide",
  "findings.view",
  "findings.review",
  "insights.view",
  "notifications.view",
  "notifications.manage",
  "datasets.create",
  "datasets.download",
  "datasets.share",
  "datasets.refresh",
  "datasets.archive",
  "data.download",
  "data.share",
  "ai.configure",
  "services.manage",
  "settings.manage",
  "audit.view",
] as const;

// Permission keys are executable capabilities and therefore deliberately stable.
export type KnownPermissionKey = (typeof PERMISSION_KEYS)[number];
export type PermissionKey = KnownPermissionKey | (string & {});

export type PermissionEffect = "allow" | "deny";

export type AuthorizationResource = {
  organizationId?: string | null;
  programId?: string | null;
  siteId?: string | null;
  locationId?: string | null;
  serviceId?: string | null;
  serviceKey?: string | null;
  templateId?: string | null;
  formId?: string | null;
  taskId?: string | null;
  reportId?: string | null;
  datasetId?: string | null;
  dataClassification?: string | null;
  researchUse?: string | null;
  ownerUserId?: string | null;
};

export const SYSTEM_ROLE_SEEDS = [
  { key: "volunteer", nameEn: "Volunteer / Collector", nameZh: "志愿者 / 收集员" },
  { key: "operations_reviewer", nameEn: "Operations Reviewer", nameZh: "运营审核员" },
  { key: "research_lead", nameEn: "Research Lead", nameZh: "研究负责人" },
  { key: "admin", nameEn: "Admin", nameZh: "管理员" },
  { key: "winston_research", nameEn: "Winston Research", nameZh: "Winston 研究" },
] as const;
