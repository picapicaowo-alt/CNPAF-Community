type Locale = "zh" | "en";

const sourceKindLabels: Record<string, { zh: string; en: string }> = {
  field_visit: { zh: "现场访视", en: "Field visit" },
  expert_interview: { zh: "专家访谈", en: "Expert interview" },
  literature: { zh: "文献资料", en: "Literature" },
};

const reviewItemLabels: Record<string, { zh: string; en: string }> = {
  record: { zh: "记录", en: "Record" },
  privacy_flag: { zh: "隐私检查", en: "Privacy review" },
  safety_flag: { zh: "安全检查", en: "Safety review" },
  ai_finding: { zh: "AI 建议", en: "AI finding" },
  custom_entry: { zh: "自定义选项", en: "Custom entry" },
};

const workflowLabels: Record<string, { zh: string; en: string }> = {
  pending: { zh: "待处理", en: "Pending" },
  open: { zh: "待处理", en: "Open" },
  clear: { zh: "通过", en: "Clear" },
  redacted: { zh: "已脱敏", en: "Redacted" },
  dismissed: { zh: "无需处理", en: "Dismiss" },
  resolved: { zh: "已解决", en: "Resolve" },
  escalated: { zh: "升级处理", en: "Escalate" },
  approve: { zh: "批准", en: "Approve" },
  edit: { zh: "编辑后批准", en: "Edit and approve" },
  needs_completion: { zh: "退回补充", en: "Return for completion" },
  re_run_requested: { zh: "重新分析", en: "Run analysis again" },
  keep_free_text: { zh: "保留原文", en: "Keep as free text" },
};

function humanize(value: string) {
  const spaced = value.replaceAll("_", " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function sourceKindLabel(value: string, locale: Locale) {
  return sourceKindLabels[value]?.[locale] ?? humanize(value);
}

export function reviewItemLabel(value: string, locale: Locale) {
  return reviewItemLabels[value]?.[locale] ?? humanize(value);
}

export function workflowLabel(value: string, locale: Locale) {
  return workflowLabels[value]?.[locale] ?? humanize(value);
}

export function reviewItemSummary(
  item: { itemType: string; sourceKind?: string; summary: string },
  locale: Locale,
) {
  if (item.itemType === "record") {
    const source = sourceKindLabel(item.sourceKind ?? "record", locale);
    return locale === "zh" ? `${source}记录` : `${source} record`;
  }
  if (item.itemType === "privacy_flag")
    return locale === "zh" ? "需要隐私审核" : "Privacy review required";
  return item.summary;
}
