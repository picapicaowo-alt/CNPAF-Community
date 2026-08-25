"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import {
  INSIGHT_DEMO_RECORDS,
  INSIGHT_LOCATIONS,
  INSIGHT_SOURCES,
  INSIGHT_SOURCE_TARGETS,
  insightConcernLabel,
  insightSourceLabel,
  type InsightSourceKey,
} from "@/features/insights/demo-data";
import {
  InsightScopePanel,
  type InsightScope,
} from "@/features/insights/InsightScopePanel";
import { apiFetch, errorMessage } from "@/lib/api-client";

const InsightCharts = dynamic(
  () => import("@/features/insights/InsightCharts"),
  {
    ssr: false,
    loading: () => <div className="card insight-viz-loading" aria-label="Loading charts" />,
  },
);

type Category = "changes" | "attention" | "gaps" | "coverage";
type SourceRow = {
  sourceKind: string;
  started: number;
  submitted: number;
  approved: number;
};
type Analytics = {
  authorizedRecordCount: number;
  recordsBySourceKind: SourceRow[];
  concernsByOrigin: Array<{
    origin: string;
    count: number;
    uniqueReferences: number;
  }>;
  themesByOrigin: Array<{ origin: string; themeId: string | null; n: number }>;
  completionBySourceKind: Array<{
    sourceKind: string;
    rate: number;
    started: number;
    submitted: number;
    approved: number;
  }>;
};
type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
type AskSource = {
  id: string;
  messageId: string;
  citationLabel?: string | null;
  excerpt?: string | null;
};
type AskBundle = {
  conversation: { id: string; title?: string | null };
  messages: AskMessage[];
  sources: AskSource[];
};
type InsightRecord = {
  id: string;
  sourceKind: string;
  reviewStatus: string;
  researchUseStatus: string;
  concernCount: number;
  occurredAt?: string | null;
  updatedAt: string;
};

const DEFAULT_SCOPE: InsightScope = {
  dateFrom: "2026-05-20",
  dateTo: "2026-08-24",
  sources: INSIGHT_SOURCES.map((source) => source.key),
  locations: INSIGHT_LOCATIONS.map((location) => location.key),
};

const categoryCopy: Record<
  Category,
  {
    eyebrowZh: string;
    eyebrowEn: string;
    titleZh: string;
    titleEn: string;
    descriptionZh: string;
    descriptionEn: string;
    tone: "blue" | "amber" | "violet" | "green";
  }
> = {
  changes: {
    eyebrowZh: "趋势概览",
    eyebrowEn: "Trend overview",
    titleZh: "发生了什么变化？",
    titleEn: "What changed?",
    descriptionZh: "比较不同来源的采集、提交和批准数量，找到变化最明显的部分。",
    descriptionEn: "Compare collection, submission, and approval volume to find the largest shifts.",
    tone: "blue",
  },
  attention: {
    eyebrowZh: "风险与关注点",
    eyebrowEn: "Risks and concerns",
    titleZh: "什么需要关注？",
    titleEn: "What needs attention?",
    descriptionZh: "查看关注点集中在哪里，并回到有证据支撑的记录继续核实。",
    descriptionEn: "See where concerns cluster, then trace them to supporting evidence.",
    tone: "amber",
  },
  gaps: {
    eyebrowZh: "证据缺口",
    eyebrowEn: "Evidence gaps",
    titleZh: "我们还不知道什么？",
    titleEn: "What do we still not know?",
    descriptionZh: "从完成率和未提交数量识别当前证据的空白与边界。",
    descriptionEn: "Use completion and submission gaps to understand the limits of current evidence.",
    tone: "violet",
  },
  coverage: {
    eyebrowZh: "采集建议",
    eyebrowEn: "Collection guidance",
    titleZh: "下一步在哪里采集？",
    titleEn: "Where should we collect next?",
    descriptionZh: "优先补齐覆盖不足的来源，把洞察转化为下一步采集行动。",
    descriptionEn: "Prioritize under-covered sources and turn insight into the next collection action.",
    tone: "green",
  },
};

function percent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function recordStatusLabel(value: string, locale: "zh" | "en") {
  if (value === "approved") return locale === "zh" ? "已批准" : "Approved";
  if (value === "needs_completion") return locale === "zh" ? "需补充" : "Needs update";
  if (value === "pending") return locale === "zh" ? "待审核" : "Pending";
  if (value === "not_submitted") return locale === "zh" ? "未提交" : "Not submitted";
  return value;
}

function researchUseLabel(value: string, locale: "zh" | "en") {
  if (value === "approved_for_research") return locale === "zh" ? "可用于研究" : "Approved for research";
  if (value === "restricted") return locale === "zh" ? "受限" : "Restricted";
  if (value === "not_assessed") return locale === "zh" ? "尚未评估" : "Not assessed";
  return value;
}

export default function InsightCategoryPage() {
  const { locale } = useI18n();
  const { category: rawCategory } = useParams<{ category: string }>();
  const category = (Object.prototype.hasOwnProperty.call(categoryCopy, rawCategory)
    ? rawCategory
    : "changes") as Category;
  const copy = categoryCopy[category];
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<InsightSourceKey>("field_visit");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [draftScope, setDraftScope] = useState<InsightScope>(DEFAULT_SCOPE);
  const [appliedScope, setAppliedScope] = useState<InsightScope>(DEFAULT_SCOPE);
  const [conversationId, setConversationId] = useState("");
  const [conversation, setConversation] = useState<AskBundle | null>(null);
  const [records, setRecords] = useState<InsightRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, result] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<Analytics>("/api/v1/analytics"),
      ]);
      setPermissions(me.permissions ?? []);
      setAnalytics(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDemoRecords = useMemo(
    () =>
      INSIGHT_DEMO_RECORDS.filter((record) => {
        const day = record.occurredAt.slice(0, 10);
        return (
          day >= appliedScope.dateFrom &&
          day <= appliedScope.dateTo &&
          appliedScope.sources.includes(record.sourceKind) &&
          appliedScope.locations.includes(record.locationId)
        );
      }),
    [appliedScope],
  );

  const demoBySource = useMemo(
    () =>
      appliedScope.sources.map((sourceKind) => {
        const rows = filteredDemoRecords.filter((record) => record.sourceKind === sourceKind);
        const submitted = rows.filter((record) => record.stage !== "started").length;
        const approved = rows.filter((record) => record.stage === "approved").length;
        return {
          sourceKind,
          started: rows.length,
          submitted,
          approved,
          concerns: rows.filter((record) => record.concern).length,
        };
      }),
    [appliedScope.sources, filteredDemoRecords],
  );

  useEffect(() => {
    if (!appliedScope.sources.includes(selectedSource)) {
      setSelectedSource(appliedScope.sources[0] ?? "field_visit");
    }
  }, [appliedScope.sources, selectedSource]);

  useEffect(() => {
    let active = true;
    setRecordsLoading(true);
    setRecordsError("");
    apiFetch<{ records: InsightRecord[] }>(
      `/api/v1/records?dateFrom=${encodeURIComponent(appliedScope.dateFrom)}&dateTo=${encodeURIComponent(appliedScope.dateTo)}`,
    )
      .then((result) => {
        if (active) setRecords(result.records ?? []);
      })
      .catch((caught) => {
        if (active) {
          setRecords([]);
          setRecordsError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) setRecordsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [appliedScope.dateFrom, appliedScope.dateTo]);

  const selected = demoBySource.find((row) => row.sourceKind === selectedSource) ?? demoBySource[0];
  const selectedCompletion = selected
    ? selected.submitted / Math.max(selected.started, 1)
    : 0;
  const totalConcerns = filteredDemoRecords.filter((record) => record.concern).length;
  const highPriorityConcerns = filteredDemoRecords.filter((record) => record.severity === "high").length;
  const totalSubmitted = filteredDemoRecords.filter((record) => record.stage !== "started").length;
  const totalApproved = filteredDemoRecords.filter((record) => record.stage === "approved").length;
  const lowCompleteness = filteredDemoRecords.filter((record) => record.completeness < 70).length;
  const scopeDays = Math.max(
    1,
    Math.round(
      (new Date(`${appliedScope.dateTo}T12:00:00Z`).getTime() -
        new Date(`${appliedScope.dateFrom}T12:00:00Z`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const sourceTargetScale = Math.max(0.25, Math.min(1, scopeDays / 96));
  const belowTargetCohorts = appliedScope.sources.reduce((count, sourceKind) => {
    const target = Math.max(
      2,
      Math.ceil((INSIGHT_SOURCE_TARGETS[sourceKind] / 5) * sourceTargetScale),
    );
    return count + appliedScope.locations.filter((locationId) =>
      filteredDemoRecords.filter(
        (record) => record.sourceKind === sourceKind && record.locationId === locationId,
      ).length < target,
    ).length;
  }, 0);
  const affectedLocations = new Set(
    filteredDemoRecords.filter((record) => record.concern).map((record) => record.locationId),
  ).size;
  const kpis = (() => {
    if (category === "attention") {
      return [
        [locale === "zh" ? "关注点" : "Concerns", totalConcerns],
        [locale === "zh" ? "高优先级" : "High priority", highPriorityConcerns],
        [locale === "zh" ? "涉及地点" : "Locations affected", affectedLocations],
        [locale === "zh" ? "关注点率" : "Concern rate", percent(totalConcerns / Math.max(filteredDemoRecords.length, 1))],
      ];
    }
    if (category === "gaps") {
      return [
        [locale === "zh" ? "未提交" : "Not submitted", filteredDemoRecords.length - totalSubmitted],
        [locale === "zh" ? "完整度低于 70%" : "Below 70% complete", lowCompleteness],
        [locale === "zh" ? "提交完成率" : "Submission completion", percent(totalSubmitted / Math.max(filteredDemoRecords.length, 1))],
        [locale === "zh" ? "来源" : "Sources", appliedScope.sources.length],
      ];
    }
    if (category === "coverage") {
      return [
        [locale === "zh" ? "来源 × 地点" : "Source × location", appliedScope.sources.length * appliedScope.locations.length],
        [locale === "zh" ? "低于目标组合" : "Below-target cohorts", belowTargetCohorts],
        [locale === "zh" ? "覆盖地点" : "Locations", appliedScope.locations.length],
        [locale === "zh" ? "已批准" : "Approved", totalApproved],
      ];
    }
    return [
      [locale === "zh" ? "模拟记录" : "Simulated records", filteredDemoRecords.length],
      [locale === "zh" ? "已提交" : "Submitted", totalSubmitted],
      [locale === "zh" ? "已批准" : "Approved", totalApproved],
      [locale === "zh" ? "来源" : "Sources", appliedScope.sources.length],
    ];
  })();
  const summaryLead = (() => {
    if (locale === "zh") {
      if (category === "attention") return `当前范围发现 ${totalConcerns} 个模拟关注点，分布在 ${affectedLocations} 个地点，其中 ${highPriorityConcerns} 个为高优先级。先核实集中主题，再回到真实授权记录查看证据。`;
      if (category === "gaps") return `当前有 ${filteredDemoRecords.length - totalSubmitted} 条模拟记录尚未提交，另有 ${lowCompleteness} 条完整度低于 70%。这两类缺口会直接限制后续分析。`;
      if (category === "coverage") return `${appliedScope.sources.length * appliedScope.locations.length} 个来源与地点组合中，${belowTargetCohorts} 个低于模拟采集目标。优先级同时考虑数量缺口、关注点率与提交完成率。`;
      return `当前范围包含 ${filteredDemoRecords.length} 条模拟记录，其中 ${totalSubmitted} 条已提交、${totalApproved} 条已批准。周趋势用于识别节奏变化，来源对比用于定位变化来自哪里。`;
    }
    if (category === "attention") return `${totalConcerns} simulated concerns appear across ${affectedLocations} locations, including ${highPriorityConcerns} high-priority items. Validate concentrated themes, then inspect authorized records for evidence.`;
    if (category === "gaps") return `${filteredDemoRecords.length - totalSubmitted} simulated records are not submitted and ${lowCompleteness} are below 70% complete. Both gaps limit downstream analysis.`;
    if (category === "coverage") return `${belowTargetCohorts} of ${appliedScope.sources.length * appliedScope.locations.length} source-location cohorts are below the simulated collection target. Priority combines volume gap, concern rate, and completion.`;
    return `${filteredDemoRecords.length} simulated records are in scope: ${totalSubmitted} submitted and ${totalApproved} approved. Weekly movement shows timing; source comparison shows where change originated.`;
  })();
  const authorizedBySource = useMemo(
    () =>
      INSIGHT_SOURCES.map((source) => {
        const rows = records.filter((record) => record.sourceKind === source.key);
        const submitted = rows.filter((record) =>
          ["pending", "approved", "needs_completion"].includes(record.reviewStatus),
        ).length;
        return {
          sourceKind: source.key,
          started: rows.length,
          submitted,
          approved: rows.filter((record) => record.reviewStatus === "approved").length,
        };
      }),
    [records],
  );
  const selectedAuthorizedRecords = useMemo(
    () => records.filter((record) => record.sourceKind === selectedSource),
    [records, selectedSource],
  );
  const visibleRecords = showAllRecords
    ? selectedAuthorizedRecords
    : selectedAuthorizedRecords.slice(0, 5);
  const canAsk = permissions.some((permission) =>
    ["chat.ask_collect", "ask_collect.use"].includes(permission),
  );
  const sourcesByMessage = useMemo(() => {
    const map = new Map<string, AskSource[]>();
    for (const source of conversation?.sources ?? []) {
      map.set(source.messageId, [...(map.get(source.messageId) ?? []), source]);
    }
    return map;
  }, [conversation]);

  const prompts =
    locale === "zh"
      ? [
          `总结${selected ? insightSourceLabel(selected.sourceKind, locale) : "当前范围"}的主要证据`,
          "哪些结论仍需要更多证据？",
          "建议下一步优先核实什么？",
        ]
      : [
          `Summarize the evidence for ${selected ? insightSourceLabel(selected.sourceKind, locale) : "this scope"}`,
          "Which conclusions still need more evidence?",
          "What should we verify next?",
        ];

  function chooseSource(sourceKind: InsightSourceKey) {
    setSelectedSource(sourceKind);
    setShowAllRecords(false);
    setConversationId("");
    setConversation(null);
  }

  async function sendQuestion(nextQuestion = question) {
    const content = nextQuestion.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      let id = conversationId;
      if (!id) {
        const created = await apiFetch<{ conversation: { id: string } }>(
          "/api/v1/ask-collect/conversations",
          {
            method: "POST",
            body: JSON.stringify({
              title: `${copy[locale === "zh" ? "titleZh" : "titleEn"]} · ${selected?.sourceKind ?? "all"}`,
              scope: selected?.sourceKind
                ? { serviceTypeKeys: [selected.sourceKind] }
                : {},
            }),
          },
        );
        id = created.conversation.id;
        setConversationId(id);
      }
      await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setConversation(
        await apiFetch<AskBundle>(`/api/v1/ask-collect/conversations/${id}`),
      );
      setQuestion("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader title={locale === "zh" ? copy.titleZh : copy.titleEn} />
        <LoadingState rows={6} />
      </>
    );
  }

  return (
    <div className={`stack insight-detail-page insight-detail-${copy.tone}`}>
      <PageHeader
        eyebrow={locale === "zh" ? copy.eyebrowZh : copy.eyebrowEn}
        title={locale === "zh" ? copy.titleZh : copy.titleEn}
        description={locale === "zh" ? copy.descriptionZh : copy.descriptionEn}
        actions={
          <StatusPill tone={copy.tone}>
            {locale === "zh" ? "演示分析 · 授权记录可追溯" : "Simulated analysis · Authorized records traceable"}
          </StatusPill>
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      <InsightScopePanel
        applied={appliedScope}
        draft={draftScope}
        locale={locale}
        onApply={() => {
          setAppliedScope(draftScope);
          setScopeOpen(false);
          setConversationId("");
          setConversation(null);
        }}
        onDraftChange={setDraftScope}
        onOpenChange={setScopeOpen}
        onReset={() => setDraftScope(DEFAULT_SCOPE)}
        open={scopeOpen}
        sampleSize={filteredDemoRecords.length}
      />

      <section className="insight-kpi-strip" aria-label={locale === "zh" ? "洞察摘要" : "Insight summary"}>
        {kpis.map(([label, value]) => (
          <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </section>

      <InsightCharts
        category={category}
        dateFrom={appliedScope.dateFrom}
        dateTo={appliedScope.dateTo}
        locale={locale}
        records={filteredDemoRecords}
      />

      <div className="insight-summary-layout">
        <section className="card insight-summary-card">
          <div className="row-between mobile-stack">
            <div>
              <span className="eyebrow">{locale === "zh" ? "范围总结" : "Scope summary"}</span>
              <h2>{locale === "zh" ? "这组图表说明什么" : "What these charts show"}</h2>
            </div>
            <StatusPill tone="neutral">{locale === "zh" ? "模拟数据" : "Simulated"}</StatusPill>
          </div>
          <p className="insight-summary-lead">{summaryLead}</p>
          <div className="insight-summary-points">
            <div><AppIcon name="check" /><span><strong>{locale === "zh" ? "可比较范围" : "Comparable scope"}</strong>{locale === "zh" ? `${scopeDays} 天、${appliedScope.sources.length} 个来源、${appliedScope.locations.length} 个地点。` : `${scopeDays} days, ${appliedScope.sources.length} sources, and ${appliedScope.locations.length} locations.`}</span></div>
            <div><AppIcon name="info" /><span><strong>{locale === "zh" ? "所选来源" : "Selected source"}</strong>{insightSourceLabel(selectedSource, locale)} · {locale === "zh" ? `完成率 ${percent(selectedCompletion)}` : `${percent(selectedCompletion)} completion`}.</span></div>
            <div><AppIcon name="arrow" /><span><strong>{locale === "zh" ? "证据边界" : "Evidence boundary"}</strong>{locale === "zh" ? "模拟数据只用于交互演示；逐条记录与 AI 均使用真实授权数据。" : "Simulation is for interaction only; record details and AI use authorized data."}</span></div>
          </div>
        </section>

        <section className="card insight-concern-card">
          <div>
            <span className="eyebrow">{locale === "zh" ? "真实记录入口" : "Authorized record entry"}</span>
            <h2>{insightSourceLabel(selectedSource, locale)}</h2>
            <p className="muted">{locale === "zh" ? "选择来源，下面查看可追溯的真实记录。" : "Choose a source, then inspect traceable records below."}</p>
          </div>
          <div className="insight-source-focus-list">
            {authorizedBySource.map((item) => (
              <button
                aria-pressed={selectedSource === item.sourceKind}
                className={selectedSource === item.sourceKind ? "active" : ""}
                key={item.sourceKind}
                onClick={() => chooseSource(item.sourceKind)}
                type="button"
              >
                <span><strong>{insightSourceLabel(item.sourceKind, locale)}</strong><small>{locale === "zh" ? `${item.started} 条真实授权记录` : `${item.started} authorized records`}</small></span>
                <b>{item.started ? percent(item.submitted / item.started) : "—"}</b>
              </button>
            ))}
          </div>
        </section>
      </div>

          <section className="card insight-records-panel">
            <div className="insight-records-heading">
              <div>
                <span className="eyebrow">Records</span>
                <h2>{locale === "zh" ? "可追溯的真实授权记录" : "Traceable authorized records"}</h2>
                <p>
                  {locale === "zh"
                    ? `系统共有 ${analytics?.authorizedRecordCount ?? 0} 条当前用户可访问的记录；所选日期范围内有 ${records.length} 条，其中 ${selectedAuthorizedRecords.length} 条来自${insightSourceLabel(selectedSource, locale)}。点击任意记录查看完整详情。`
                    : `${analytics?.authorizedRecordCount ?? 0} records are authorized for this user; ${records.length} fall in the selected dates, including ${selectedAuthorizedRecords.length} ${insightSourceLabel(selectedSource, locale)} records. Select any record for full detail.`}
                </p>
              </div>
              <Link
                className="button button-secondary button-small"
                href={`/records?source=${encodeURIComponent(selected?.sourceKind ?? "")}`}
              >
                {locale === "zh" ? "查看全部记录" : "View all records"}
                <AppIcon name="arrow" />
              </Link>
            </div>
            {recordsLoading ? (
              <LoadingState rows={3} />
            ) : recordsError ? (
              <div className="feedback feedback-error" role="alert">
                <div>
                  <strong>{locale === "zh" ? "记录暂时无法加载" : "Records could not be loaded"}</strong>
                  <p>{recordsError}</p>
                </div>
              </div>
            ) : visibleRecords.length ? (
              <div className="insight-record-list">
                {visibleRecords.map((record) => (
                  <Link
                    aria-label={`${locale === "zh" ? "查看记录" : "View record"} ${record.id.slice(0, 8).toUpperCase()}`}
                    href={`/records/${record.id}`}
                    key={record.id}
                  >
                    <span className="insight-record-id">
                      <AppIcon name="records" />
                      <span>
                        <strong>{record.id.slice(0, 8).toUpperCase()}</strong>
                        <small>{insightSourceLabel(record.sourceKind, locale)}</small>
                      </span>
                    </span>
                    <span className="insight-record-status">
                      <StatusPill tone={record.reviewStatus === "approved" ? "green" : record.reviewStatus === "needs_completion" ? "amber" : "neutral"}>
                        {recordStatusLabel(record.reviewStatus, locale)}
                      </StatusPill>
                      {record.concernCount ? (
                        <small>{record.concernCount} {locale === "zh" ? "个关注点" : "concerns"}</small>
                      ) : null}
                    </span>
                    <span className="insight-record-use">
                      <strong>{locale === "zh" ? "研究使用" : "Research use"}</strong>
                      <small>{researchUseLabel(record.researchUseStatus, locale)}</small>
                    </span>
                    <time dateTime={record.occurredAt ?? record.updatedAt}>
                      {new Date(record.occurredAt ?? record.updatedAt).toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </time>
                    <AppIcon className="insight-record-arrow" name="arrow" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="insight-records-empty">
                <AppIcon name="records" />
                <span>{locale === "zh" ? "当前范围没有可查看的记录。" : "No viewable records in the current scope."}</span>
              </div>
            )}
            {!recordsLoading && selectedAuthorizedRecords.length > 5 ? (
              <button
                className="button button-ghost button-small insight-records-more"
                onClick={() => setShowAllRecords((current) => !current)}
                type="button"
              >
                {showAllRecords
                  ? locale === "zh" ? "收起记录" : "Show fewer records"
                  : locale === "zh" ? `显示更多（${selectedAuthorizedRecords.length - 5}）` : `Show more (${selectedAuthorizedRecords.length - 5})`}
              </button>
            ) : null}
          </section>

          {canAsk ? (
            <section className="card insight-ai-panel">
              <div className="insight-ai-heading">
                <span className="dataset-ai-avatar"><AppIcon name="sparkles" /></span>
                <div>
                  <h2>{locale === "zh" ? "与 AI 分析员继续探索" : "Explore with the AI analyst"}</h2>
                  <p>{locale === "zh" ? `回答只使用 ${insightSourceLabel(selectedSource, locale)} 的真实已批准证据；模拟图表不会作为证据。` : `Answers use only real approved ${insightSourceLabel(selectedSource, locale)} evidence; simulated charts are never treated as evidence.`}</p>
                </div>
              </div>
              <div className="insight-ai-body">
                {conversation?.messages.length ? (
                  <div className="insight-ai-messages" aria-live="polite">
                    {conversation.messages.map((message) => (
                      <article className={`dataset-chat-message ${message.role}`} key={message.id}>
                        {message.content}
                        {sourcesByMessage.get(message.id)?.length ? (
                          <details className="dataset-chat-sources">
                            <summary>{locale === "zh" ? "查看证据来源" : "View evidence sources"}</summary>
                            {sourcesByMessage.get(message.id)?.map((source) => (
                              <div className="evidence" key={source.id}>
                                <strong>{source.citationLabel ?? (locale === "zh" ? "来源" : "Source")}</strong>
                                <p>{source.excerpt}</p>
                              </div>
                            ))}
                          </details>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="insight-ai-prompts">
                    {prompts.map((prompt) => (
                      <button disabled={sending} key={prompt} onClick={() => void sendQuestion(prompt)} type="button">
                        <span>{prompt}</span><AppIcon name="arrow" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="insight-ai-compose">
                <textarea
                  aria-label={locale === "zh" ? "询问 AI 分析员" : "Ask the AI analyst"}
                  disabled={sending}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendQuestion();
                    }
                  }}
                  placeholder={locale === "zh" ? "围绕当前图表继续提问…" : "Ask a follow-up about the current graphs…"}
                  rows={2}
                  value={question}
                />
                <button className="button" disabled={sending || !question.trim()} onClick={() => void sendQuestion()} type="button">
                  <AppIcon name="sparkles" />
                  {sending ? (locale === "zh" ? "分析中…" : "Analyzing…") : (locale === "zh" ? "分析" : "Analyze")}
                </button>
              </div>
            </section>
          ) : null}
    </div>
  );
}
