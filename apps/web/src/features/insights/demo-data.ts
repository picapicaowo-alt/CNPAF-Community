export type InsightSourceKey =
  | "field_visit"
  | "professor_interview"
  | "literature"
  | "other";

export type InsightLocationKey =
  | "evergreen-adhc"
  | "harmony-adhc"
  | "golden-years-adhc"
  | "chinatown-hub"
  | "monterey-park-center";

export type InsightConcernKey =
  | "access_barrier"
  | "service_quality"
  | "participant_safety"
  | "follow_up_required"
  | "field_observation";

export type InsightDemoRecord = {
  id: string;
  occurredAt: string;
  sourceKind: InsightSourceKey;
  locationId: InsightLocationKey;
  stage: "started" | "submitted" | "approved";
  concern: InsightConcernKey | null;
  severity: "low" | "medium" | "high" | null;
  completeness: number;
};

export const INSIGHT_SOURCES: Array<{
  key: InsightSourceKey;
  zh: string;
  en: string;
}> = [
  { key: "field_visit", zh: "现场访视", en: "Field visit" },
  { key: "professor_interview", zh: "教授访谈", en: "Professor interview" },
  { key: "literature", zh: "文献", en: "Literature" },
  { key: "other", zh: "其他", en: "Other" },
];

export const INSIGHT_LOCATIONS: Array<{
  key: InsightLocationKey;
  zh: string;
  en: string;
}> = [
  { key: "evergreen-adhc", zh: "Evergreen 日间照护中心", en: "Evergreen ADHC" },
  { key: "harmony-adhc", zh: "Harmony 日间照护中心", en: "Harmony ADHC" },
  { key: "golden-years-adhc", zh: "Golden Years 日间照护中心", en: "Golden Years ADHC" },
  { key: "chinatown-hub", zh: "华埠社区服务站", en: "Chinatown Service Hub" },
  { key: "monterey-park-center", zh: "蒙特利公园社区中心", en: "Monterey Park Community Center" },
];

export const INSIGHT_CONCERNS: Array<{
  key: InsightConcernKey;
  zh: string;
  en: string;
}> = [
  { key: "access_barrier", zh: "服务可及性", en: "Access barrier" },
  { key: "service_quality", zh: "服务质量", en: "Service quality" },
  { key: "participant_safety", zh: "参与者安全", en: "Participant safety" },
  { key: "follow_up_required", zh: "需要跟进", en: "Follow-up required" },
  { key: "field_observation", zh: "现场观察", en: "Field observation" },
];

export const INSIGHT_SOURCE_TARGETS: Record<InsightSourceKey, number> = {
  field_visit: 44,
  professor_interview: 38,
  literature: 34,
  other: 28,
};

const approvalThresholds: Record<InsightSourceKey, number> = {
  field_visit: 67,
  professor_interview: 74,
  literature: 58,
  other: 49,
};

const submissionThresholds: Record<InsightSourceKey, number> = {
  field_visit: 86,
  professor_interview: 92,
  literature: 81,
  other: 76,
};

/**
 * Deterministic product-demo data. It is intentionally separate from approved
 * evidence and is labelled as simulated in the UI so it can never be mistaken
 * for research data.
 */
export const INSIGHT_DEMO_RECORDS: InsightDemoRecord[] = Array.from(
  { length: 144 },
  (_, index) => {
    const sourceIndex = (index * 7 + Math.floor(index / 11)) % INSIGHT_SOURCES.length;
    const locationIndex = (index * 3 + Math.floor(index / 7)) % INSIGHT_LOCATIONS.length;
    const sourceKind = INSIGHT_SOURCES[sourceIndex].key;
    const locationId = INSIGHT_LOCATIONS[locationIndex].key;
    const score = (index * 17 + sourceIndex * 13 + locationIndex * 9) % 100;
    const stage =
      score < approvalThresholds[sourceKind]
        ? "approved"
        : score < submissionThresholds[sourceKind]
          ? "submitted"
          : "started";
    const concernScore = (index * 19 + locationIndex * 21 + sourceIndex * 8) % 100;
    const hasConcern = stage !== "started" && concernScore < 46;
    const concern = hasConcern
      ? INSIGHT_CONCERNS[(index + sourceIndex * 2 + locationIndex) % INSIGHT_CONCERNS.length].key
      : null;
    const severity = !concern
      ? null
      : concernScore < 11
        ? "high"
        : concernScore < 28
          ? "medium"
          : "low";
    const dayOffset = Math.floor((index * 96) / 144);
    const occurredAt = new Date(Date.UTC(2026, 4, 20 + dayOffset, 16, 0, 0)).toISOString();

    return {
      id: `demo-${String(index + 1).padStart(3, "0")}`,
      occurredAt,
      sourceKind,
      locationId,
      stage,
      concern,
      severity,
      completeness:
        stage === "approved"
          ? 86 + ((index * 7) % 15)
          : stage === "submitted"
            ? 60 + ((index * 9) % 25)
            : 28 + ((index * 11) % 35),
    };
  },
);

export function insightSourceLabel(key: string, locale: "zh" | "en") {
  const source = INSIGHT_SOURCES.find((item) => item.key === key);
  return source?.[locale] ?? key.replaceAll("_", " ");
}

export function insightLocationLabel(key: string, locale: "zh" | "en") {
  const location = INSIGHT_LOCATIONS.find((item) => item.key === key);
  return location?.[locale] ?? key;
}

export function insightConcernLabel(key: string, locale: "zh" | "en") {
  const concern = INSIGHT_CONCERNS.find((item) => item.key === key);
  return concern?.[locale] ?? key.replaceAll("_", " ");
}
