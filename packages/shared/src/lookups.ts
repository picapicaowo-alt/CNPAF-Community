/**
 * Single source of truth for business lookups.
 * Seeded into DB; TypeScript imports the same keys.
 * Do not use Postgres ENUMs for these.
 */

export const LOOKUP_CATEGORIES = [
  "source_kind",
  "site_type",
  "missing_reason",
  "concern_origin",
  "safety_flag_type",
  "user_role",
  "canonical_status",
  "record_status",
  "review_status",
  "ai_status",
  "privacy_status",
  "collection_purpose",
  "research_use_status",
  "attribution_permission",
  "quote_permission",
  "finding_kind",
  "job_status",
] as const;

export type LookupCategory = (typeof LOOKUP_CATEGORIES)[number];

export type LookupRow = {
  category: LookupCategory;
  key: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
};

export const LOOKUPS: LookupRow[] = [
  { category: "source_kind", key: "field_visit", nameZh: "现场访视", nameEn: "Field visit", sortOrder: 1 },
  { category: "source_kind", key: "professor_interview", nameZh: "专家访谈", nameEn: "Expert interview", sortOrder: 2 },
  { category: "source_kind", key: "literature", nameZh: "文献资料", nameEn: "Literature", sortOrder: 3 },
  { category: "source_kind", key: "other", nameZh: "其他来源", nameEn: "Other source", sortOrder: 4 },

  { category: "site_type", key: "adhc", nameZh: "成人日间护理中心", nameEn: "Adult day health care", sortOrder: 1 },
  { category: "site_type", key: "nursing_home", nameZh: "养老院", nameEn: "Nursing home", sortOrder: 2 },
  { category: "site_type", key: "school", nameZh: "学校", nameEn: "School", sortOrder: 3 },
  { category: "site_type", key: "university", nameZh: "大学", nameEn: "University", sortOrder: 4 },
  { category: "site_type", key: "other", nameZh: "其他", nameEn: "Other", sortOrder: 5 },

  { category: "missing_reason", key: "recorded", nameZh: "已记录", nameEn: "Recorded", sortOrder: 1 },
  { category: "missing_reason", key: "not_recorded", nameZh: "未记录或忘记", nameEn: "Not recorded", sortOrder: 2 },
  { category: "missing_reason", key: "not_applicable", nameZh: "不适用", nameEn: "Not applicable", sortOrder: 3 },
  { category: "missing_reason", key: "unknown", nameZh: "不知道或未观察到", nameEn: "Unknown or not observed", sortOrder: 4 },
  { category: "missing_reason", key: "refused", nameZh: "拒绝回答", nameEn: "Refused", sortOrder: 5 },

  { category: "concern_origin", key: "field_observation", nameZh: "现场观察", nameEn: "Field observation", sortOrder: 1 },
  { category: "concern_origin", key: "participant_feedback", nameZh: "参与者反馈", nameEn: "Participant feedback", sortOrder: 2 },
  { category: "concern_origin", key: "expert_interview", nameZh: "专家访谈", nameEn: "Expert interview", sortOrder: 3 },
  { category: "concern_origin", key: "literature", nameZh: "文献支持", nameEn: "Literature", sortOrder: 4 },

  { category: "safety_flag_type", key: "urgent_human_review", nameZh: "建议紧急人工查看", nameEn: "Flagged for urgent human review", sortOrder: 1 },

  { category: "user_role", key: "volunteer", nameZh: "志愿者", nameEn: "Volunteer", sortOrder: 1 },
  { category: "user_role", key: "coordinator", nameZh: "运营协调员", nameEn: "Coordinator", sortOrder: 2 },
  { category: "user_role", key: "admin", nameZh: "管理员", nameEn: "Admin", sortOrder: 3 },

  { category: "canonical_status", key: "unverified", nameZh: "未核对", nameEn: "Unverified", sortOrder: 1 },
  { category: "canonical_status", key: "canonical", nameZh: "规范", nameEn: "Canonical", sortOrder: 2 },
  { category: "canonical_status", key: "merged", nameZh: "已合并", nameEn: "Merged", sortOrder: 3 },

  { category: "record_status", key: "draft", nameZh: "草稿", nameEn: "Draft", sortOrder: 1 },
  { category: "record_status", key: "submitted", nameZh: "已提交", nameEn: "Submitted", sortOrder: 2 },
  { category: "record_status", key: "superseded", nameZh: "已替代", nameEn: "Superseded", sortOrder: 3 },

  { category: "review_status", key: "not_submitted", nameZh: "未提交", nameEn: "Not submitted", sortOrder: 1 },
  { category: "review_status", key: "pending", nameZh: "待审核", nameEn: "Pending", sortOrder: 2 },
  { category: "review_status", key: "needs_completion", nameZh: "需补全", nameEn: "Needs completion", sortOrder: 3 },
  { category: "review_status", key: "approved", nameZh: "已通过", nameEn: "Approved", sortOrder: 4 },
  { category: "review_status", key: "rejected", nameZh: "已退回", nameEn: "Rejected", sortOrder: 5 },

  { category: "ai_status", key: "not_required", nameZh: "不需要", nameEn: "Not required", sortOrder: 1 },
  { category: "ai_status", key: "queued", nameZh: "排队中", nameEn: "Queued", sortOrder: 2 },
  { category: "ai_status", key: "running", nameZh: "分析中", nameEn: "Running", sortOrder: 3 },
  { category: "ai_status", key: "succeeded", nameZh: "已完成", nameEn: "Succeeded", sortOrder: 4 },
  { category: "ai_status", key: "failed", nameZh: "失败", nameEn: "Failed", sortOrder: 5 },
  { category: "ai_status", key: "skipped_privacy", nameZh: "因隐私跳过", nameEn: "Skipped for privacy", sortOrder: 6 },

  { category: "privacy_status", key: "not_scanned", nameZh: "未扫描", nameEn: "Not scanned", sortOrder: 1 },
  { category: "privacy_status", key: "clear", nameZh: "通过", nameEn: "Clear", sortOrder: 2 },
  { category: "privacy_status", key: "redacted", nameZh: "已脱敏", nameEn: "Redacted", sortOrder: 3 },
  { category: "privacy_status", key: "flagged", nameZh: "需人工检查", nameEn: "Privacy flagged", sortOrder: 4 },

  { category: "collection_purpose", key: "operational", nameZh: "运营", nameEn: "Operational", sortOrder: 1 },
  { category: "collection_purpose", key: "program_evaluation", nameZh: "项目评估", nameEn: "Program evaluation", sortOrder: 2 },
  { category: "collection_purpose", key: "research", nameZh: "研究", nameEn: "Research", sortOrder: 3 },

  { category: "research_use_status", key: "not_assessed", nameZh: "未评估", nameEn: "Not assessed", sortOrder: 1 },
  { category: "research_use_status", key: "operations_only", nameZh: "仅运营", nameEn: "Operations only", sortOrder: 2 },
  { category: "research_use_status", key: "eligible_for_review", nameZh: "可提交审查", nameEn: "Eligible for review", sortOrder: 3 },
  { category: "research_use_status", key: "approved_for_research", nameZh: "已批准用于研究", nameEn: "Approved for research", sortOrder: 4 },
  { category: "research_use_status", key: "restricted", nameZh: "受限", nameEn: "Restricted", sortOrder: 5 },

  { category: "attribution_permission", key: "internal_named", nameZh: "内部可署名", nameEn: "Internal named", sortOrder: 1 },
  { category: "attribution_permission", key: "public_named", nameZh: "公开可署名", nameEn: "Public named", sortOrder: 2 },
  { category: "attribution_permission", key: "anonymous", nameZh: "匿名", nameEn: "Anonymous", sortOrder: 3 },

  { category: "quote_permission", key: "internal", nameZh: "仅内部引用", nameEn: "Internal quote", sortOrder: 1 },
  { category: "quote_permission", key: "public", nameZh: "可公开引用", nameEn: "Public quote", sortOrder: 2 },
  { category: "quote_permission", key: "no_quote", nameZh: "不可引用", nameEn: "No quote", sortOrder: 3 },

  { category: "finding_kind", key: "summary", nameZh: "摘要", nameEn: "Summary", sortOrder: 1 },
  { category: "finding_kind", key: "theme", nameZh: "主题", nameEn: "Theme", sortOrder: 2 },
  { category: "finding_kind", key: "concern", nameZh: "关注点", nameEn: "Concern", sortOrder: 3 },
  { category: "finding_kind", key: "quantitative_suggestion", nameZh: "定量建议", nameEn: "Quantitative suggestion", sortOrder: 4 },
  { category: "finding_kind", key: "safety_suspect", nameZh: "安全疑似", nameEn: "Safety suspect", sortOrder: 5 },

  { category: "job_status", key: "queued", nameZh: "排队", nameEn: "Queued", sortOrder: 1 },
  { category: "job_status", key: "running", nameZh: "运行中", nameEn: "Running", sortOrder: 2 },
  { category: "job_status", key: "succeeded", nameZh: "成功", nameEn: "Succeeded", sortOrder: 3 },
  { category: "job_status", key: "failed", nameZh: "失败", nameEn: "Failed", sortOrder: 4 },
  { category: "job_status", key: "dead", nameZh: "死信", nameEn: "Dead letter", sortOrder: 5 },
];

export const SOURCE_KINDS: readonly string[] = ["field_visit", "professor_interview", "literature", "other"];
export type SourceKind = string;

export const SITE_TYPES: readonly string[] = ["adhc", "nursing_home", "school", "university", "other"];
export type SiteType = string;

export const MISSING_REASONS = [
  "recorded",
  "not_recorded",
  "not_applicable",
  "unknown",
  "refused",
] as const;
export type MissingReason = string;

export const CONCERN_ORIGINS = [
  "field_observation",
  "participant_feedback",
  "expert_interview",
  "literature",
] as const;
export type ConcernOrigin = string;

export type UserRole = string;

export function lookupsByCategory(category: LookupCategory): LookupRow[] {
  return LOOKUPS.filter((row) => row.category === category).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

export function isLookupKey(category: LookupCategory, key: string): boolean {
  return LOOKUPS.some((row) => row.category === category && row.key === key);
}
