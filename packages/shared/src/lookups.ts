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
  { category: "source_kind", key: "field_visit", nameZh: "现场访视 Field visit", nameEn: "Field visit 现场访视", sortOrder: 1 },
  { category: "source_kind", key: "professor_interview", nameZh: "教授访谈 Professor interview", nameEn: "Professor interview 教授访谈", sortOrder: 2 },
  { category: "source_kind", key: "literature", nameZh: "文献 Literature", nameEn: "Literature 文献", sortOrder: 3 },
  { category: "source_kind", key: "other", nameZh: "其他 Other", nameEn: "Other 其他", sortOrder: 4 },

  { category: "site_type", key: "adhc", nameZh: "成人日间护理 ADHC", nameEn: "ADHC 成人日间护理", sortOrder: 1 },
  { category: "site_type", key: "nursing_home", nameZh: "养老院 Nursing home", nameEn: "Nursing home 养老院", sortOrder: 2 },
  { category: "site_type", key: "school", nameZh: "学校 School", nameEn: "School 学校", sortOrder: 3 },
  { category: "site_type", key: "university", nameZh: "大学 University", nameEn: "University 大学", sortOrder: 4 },
  { category: "site_type", key: "other", nameZh: "其他 Other", nameEn: "Other 其他", sortOrder: 5 },

  { category: "missing_reason", key: "recorded", nameZh: "已记录 Recorded", nameEn: "Recorded 已记录", sortOrder: 1 },
  { category: "missing_reason", key: "not_recorded", nameZh: "未记录 / 忘记 Not recorded", nameEn: "Not recorded 未记录", sortOrder: 2 },
  { category: "missing_reason", key: "not_applicable", nameZh: "不适用 Not applicable", nameEn: "Not applicable 不适用", sortOrder: 3 },
  { category: "missing_reason", key: "unknown", nameZh: "不知道 / 没观察到 Unknown", nameEn: "Unknown / not observed 不知道", sortOrder: 4 },
  { category: "missing_reason", key: "refused", nameZh: "拒绝回答 Refused", nameEn: "Refused 拒绝回答", sortOrder: 5 },

  { category: "concern_origin", key: "field_observation", nameZh: "现场观察 Field observation", nameEn: "Field observation 现场观察", sortOrder: 1 },
  { category: "concern_origin", key: "participant_feedback", nameZh: "参与者反馈 Participant feedback", nameEn: "Participant feedback 参与者反馈", sortOrder: 2 },
  { category: "concern_origin", key: "expert_interview", nameZh: "专家访谈 Expert interview", nameEn: "Expert interview 专家访谈", sortOrder: 3 },
  { category: "concern_origin", key: "literature", nameZh: "文献支持 Literature", nameEn: "Literature 文献", sortOrder: 4 },

  { category: "safety_flag_type", key: "urgent_human_review", nameZh: "建议紧急人工查看", nameEn: "Flagged for urgent human review", sortOrder: 1 },

  { category: "user_role", key: "volunteer", nameZh: "志愿者 Volunteer", nameEn: "Volunteer 志愿者", sortOrder: 1 },
  { category: "user_role", key: "coordinator", nameZh: "运营 Coordinator", nameEn: "Coordinator 运营", sortOrder: 2 },
  { category: "user_role", key: "admin", nameZh: "管理员 Admin", nameEn: "Admin 管理员", sortOrder: 3 },

  { category: "canonical_status", key: "unverified", nameZh: "未核对 Unverified", nameEn: "Unverified 未核对", sortOrder: 1 },
  { category: "canonical_status", key: "canonical", nameZh: "规范 Canonical", nameEn: "Canonical 规范", sortOrder: 2 },
  { category: "canonical_status", key: "merged", nameZh: "已合并 Merged", nameEn: "Merged 已合并", sortOrder: 3 },

  { category: "record_status", key: "draft", nameZh: "草稿 Draft", nameEn: "Draft 草稿", sortOrder: 1 },
  { category: "record_status", key: "submitted", nameZh: "已提交 Submitted", nameEn: "Submitted 已提交", sortOrder: 2 },
  { category: "record_status", key: "superseded", nameZh: "已替代 Superseded", nameEn: "Superseded 已替代", sortOrder: 3 },

  { category: "review_status", key: "not_submitted", nameZh: "未提交 Not submitted", nameEn: "Not submitted 未提交", sortOrder: 1 },
  { category: "review_status", key: "pending", nameZh: "待审核 Pending", nameEn: "Pending 待审核", sortOrder: 2 },
  { category: "review_status", key: "needs_completion", nameZh: "需补全 Needs completion", nameEn: "Needs completion 需补全", sortOrder: 3 },
  { category: "review_status", key: "approved", nameZh: "已通过 Approved", nameEn: "Approved 已通过", sortOrder: 4 },
  { category: "review_status", key: "rejected", nameZh: "已退回 Rejected", nameEn: "Rejected 已退回", sortOrder: 5 },

  { category: "ai_status", key: "not_required", nameZh: "不需要 Not required", nameEn: "Not required 不需要", sortOrder: 1 },
  { category: "ai_status", key: "queued", nameZh: "排队中 Queued", nameEn: "Queued 排队中", sortOrder: 2 },
  { category: "ai_status", key: "running", nameZh: "分析中 Running", nameEn: "Running 分析中", sortOrder: 3 },
  { category: "ai_status", key: "succeeded", nameZh: "已完成 Succeeded", nameEn: "Succeeded 已完成", sortOrder: 4 },
  { category: "ai_status", key: "failed", nameZh: "失败 Failed", nameEn: "Failed 失败", sortOrder: 5 },
  { category: "ai_status", key: "skipped_privacy", nameZh: "因隐私跳过 Skipped (privacy)", nameEn: "Skipped (privacy) 因隐私跳过", sortOrder: 6 },

  { category: "privacy_status", key: "not_scanned", nameZh: "未扫描 Not scanned", nameEn: "Not scanned 未扫描", sortOrder: 1 },
  { category: "privacy_status", key: "clear", nameZh: "通过 Clear", nameEn: "Clear 通过", sortOrder: 2 },
  { category: "privacy_status", key: "redacted", nameZh: "已脱敏 Redacted", nameEn: "Redacted 已脱敏", sortOrder: 3 },
  { category: "privacy_status", key: "flagged", nameZh: "需人工 Privacy flagged", nameEn: "Flagged 需人工", sortOrder: 4 },

  { category: "collection_purpose", key: "operational", nameZh: "运营 Operational", nameEn: "Operational 运营", sortOrder: 1 },
  { category: "collection_purpose", key: "program_evaluation", nameZh: "项目评估 Program evaluation", nameEn: "Program evaluation 项目评估", sortOrder: 2 },
  { category: "collection_purpose", key: "research", nameZh: "研究 Research", nameEn: "Research 研究", sortOrder: 3 },

  { category: "research_use_status", key: "not_assessed", nameZh: "未评估 Not assessed", nameEn: "Not assessed 未评估", sortOrder: 1 },
  { category: "research_use_status", key: "operations_only", nameZh: "仅运营 Operations only", nameEn: "Operations only 仅运营", sortOrder: 2 },
  { category: "research_use_status", key: "eligible_for_review", nameZh: "可提交审查 Eligible for review", nameEn: "Eligible for review 可提交审查", sortOrder: 3 },
  { category: "research_use_status", key: "approved_for_research", nameZh: "已批准用于研究 Approved for research", nameEn: "Approved for research 已批准用于研究", sortOrder: 4 },
  { category: "research_use_status", key: "restricted", nameZh: "受限 Restricted", nameEn: "Restricted 受限", sortOrder: 5 },

  { category: "attribution_permission", key: "internal_named", nameZh: "内部可署名 Internal named", nameEn: "Internal named 内部可署名", sortOrder: 1 },
  { category: "attribution_permission", key: "public_named", nameZh: "公开可署名 Public named", nameEn: "Public named 公开可署名", sortOrder: 2 },
  { category: "attribution_permission", key: "anonymous", nameZh: "匿名 Anonymous", nameEn: "Anonymous 匿名", sortOrder: 3 },

  { category: "quote_permission", key: "internal", nameZh: "仅内部引用 Internal quote", nameEn: "Internal quote 仅内部引用", sortOrder: 1 },
  { category: "quote_permission", key: "public", nameZh: "可公开引用 Public quote", nameEn: "Public quote 可公开引用", sortOrder: 2 },
  { category: "quote_permission", key: "no_quote", nameZh: "不可引用 No quote", nameEn: "No quote 不可引用", sortOrder: 3 },

  { category: "finding_kind", key: "summary", nameZh: "摘要 Summary", nameEn: "Summary 摘要", sortOrder: 1 },
  { category: "finding_kind", key: "theme", nameZh: "主题 Theme", nameEn: "Theme 主题", sortOrder: 2 },
  { category: "finding_kind", key: "concern", nameZh: "关注点 Concern", nameEn: "Concern 关注点", sortOrder: 3 },
  { category: "finding_kind", key: "quantitative_suggestion", nameZh: "定量建议 Quantitative suggestion", nameEn: "Quantitative suggestion 定量建议", sortOrder: 4 },
  { category: "finding_kind", key: "safety_suspect", nameZh: "安全疑似 Safety suspect", nameEn: "Safety suspect 安全疑似", sortOrder: 5 },

  { category: "job_status", key: "queued", nameZh: "排队 Queued", nameEn: "Queued 排队", sortOrder: 1 },
  { category: "job_status", key: "running", nameZh: "运行中 Running", nameEn: "Running 运行中", sortOrder: 2 },
  { category: "job_status", key: "succeeded", nameZh: "成功 Succeeded", nameEn: "Succeeded 成功", sortOrder: 3 },
  { category: "job_status", key: "failed", nameZh: "失败 Failed", nameEn: "Failed 失败", sortOrder: 4 },
  { category: "job_status", key: "dead", nameZh: "死信 Dead letter", nameEn: "Dead letter 死信", sortOrder: 5 },
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
