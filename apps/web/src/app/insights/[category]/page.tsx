"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiCopilotPanel } from "@/components/AiCopilotPanel";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { localizedLocationName } from "@/features/locations/model";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { sourceKindLabel } from "@/lib/display-labels";
import { recordDisplayName, recordReference } from "@/features/records/display";

const InsightCharts = dynamic(() => import("@/features/insights/InsightCharts"), {
  ssr: false,
  loading: () => <div className="card insight-viz-loading" aria-hidden="true" />,
});

type Category = "changes" | "attention" | "gaps" | "coverage";
type InsightRecord = {
  id: string;
  siteId?: string | null;
  sourceKind: string;
  reviewStatus: string;
  researchUseStatus: string;
  collectionPurpose: string;
  concernCount: number;
  occurredAt?: string | null;
  updatedAt: string;
};
type InsightLocation = {
  id: string;
  name: string;
  nameEn?: string | null;
  nameZh?: string | null;
};

function operationalRecords(records: InsightRecord[]) {
  return records.filter(
    (record) => record.collectionPurpose !== "system_validation",
  );
}

const categoryCopy: Record<
  Category,
  {
    titleZh: string;
    titleEn: string;
    descriptionZh: string;
    descriptionEn: string;
    tone: "blue" | "amber" | "violet" | "green";
  }
> = {
  changes: {
    titleZh: "最近出现了什么变化？",
    titleEn: "What changed recently?",
    descriptionZh: "从访谈、观察与一线记录中寻找重复出现或明显变化的表达和行为，暂不解释原因。",
    descriptionEn: "Find repeated or changing expressions and behaviors in interviews, observations, and field records without explaining the cause yet.",
    tone: "blue",
  },
  attention: {
    titleZh: "哪些心理关注正在浮现？",
    titleEn: "Which psychological concerns are emerging?",
    descriptionZh: "把多个一线信号谨慎聚合为心理与行为 concern；Concern 不是诊断。",
    descriptionEn: "Carefully group field signals into psychological and behavioral concerns. A concern is not a diagnosis.",
    tone: "amber",
  },
  gaps: {
    titleZh: "我们还不能确定什么？",
    titleEn: "What can we not determine yet?",
    descriptionZh: "列出替代解释、证据不足与需要避免的过度推断，把 observation 与 hypothesis 分开。",
    descriptionEn: "Separate observations from hypotheses by naming alternative explanations, missing evidence, and inferences to avoid.",
    tone: "violet",
  },
  coverage: {
    titleZh: "下一步应该验证什么？",
    titleEn: "What should we verify next?",
    descriptionZh: "把 concern 与 uncertainty 转成下一轮访谈、观察和采集问题，形成学习闭环。",
    descriptionEn: "Turn concerns and uncertainty into the next interview, observation, and collection questions.",
    tone: "green",
  },
};

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function statusLabel(value: string, locale: "zh" | "en") {
  const labels: Record<string, { zh: string; en: string }> = {
    approved: { zh: "已批准", en: "Approved" },
    needs_completion: { zh: "需补充", en: "Needs update" },
    pending: { zh: "待审核", en: "Pending" },
    not_submitted: { zh: "草稿", en: "Draft" },
  };
  return labels[value]?.[locale] ?? value.replaceAll("_", " ");
}

function statusTone(value: string) {
  if (value === "approved") return "green" as const;
  if (value === "needs_completion") return "amber" as const;
  if (value === "pending") return "blue" as const;
  return "neutral" as const;
}

export default function InsightCategoryPage() {
  const { locale } = useI18n();
  const { category: rawCategory } = useParams<{ category: string }>();
  const category = (rawCategory in categoryCopy ? rawCategory : "changes") as Category;
  const copy = categoryCopy[category];
  const today = useMemo(() => new Date(), []);
  const [dateTo, setDateTo] = useState(() => isoDay(today));
  const [dateFrom, setDateFrom] = useState(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    return isoDay(start);
  });
  const [records, setRecords] = useState<InsightRecord[]>([]);
  const [locations, setLocations] = useState<InsightLocation[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, result, locationResult] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ records: InsightRecord[] }>(
          `/api/v1/records?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        ),
        apiFetch<{ locations: InsightLocation[] }>("/api/v1/locations"),
      ]);
      setPermissions(me.permissions ?? []);
      setRecords(operationalRecords(result.records ?? []));
      setLocations(locationResult.locations ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshRecords = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const result = await apiFetch<{ records: InsightRecord[] }>(
        `/api/v1/records?dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}`,
        { cache: "no-store" },
      );
      setRecords(operationalRecords(result.records ?? []));
      setError("");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const refresh = () => void refreshRecords();
    const refreshMs = Number(document.documentElement.dataset.insightRefreshMs);
    if (!Number.isFinite(refreshMs) || refreshMs <= 0) return;
    const timer = window.setInterval(refresh, refreshMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshRecords]);

  const availableSources = useMemo(
    () => [...new Set(records.map((record) => record.sourceKind))].sort(),
    [records],
  );
  const filteredRecords = useMemo(
    () =>
      selectedSources.length
        ? records.filter((record) => selectedSources.includes(record.sourceKind))
        : records,
    [records, selectedSources],
  );
  const bySource = useMemo(
    () =>
      availableSources
        .map((sourceKind) => {
          const rows = filteredRecords.filter((record) => record.sourceKind === sourceKind);
          return {
            sourceKind,
            total: rows.length,
            submitted: rows.filter((record) => record.reviewStatus !== "not_submitted").length,
            approved: rows.filter((record) => record.reviewStatus === "approved").length,
            concerns: rows.reduce((sum, record) => sum + record.concernCount, 0),
          };
        })
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total),
    [availableSources, filteredRecords],
  );
  const totalSubmitted = filteredRecords.filter(
    (record) => record.reviewStatus !== "not_submitted",
  ).length;
  const totalApproved = filteredRecords.filter(
    (record) => record.reviewStatus === "approved",
  ).length;
  const needsUpdate = filteredRecords.filter(
    (record) => record.reviewStatus === "needs_completion",
  ).length;
  const pending = filteredRecords.filter(
    (record) => record.reviewStatus === "pending",
  ).length;
  const totalConcerns = filteredRecords.reduce(
    (sum, record) => sum + record.concernCount,
    0,
  );
  const locationCount = new Set(
    filteredRecords.flatMap((record) => (record.siteId ? [record.siteId] : [])),
  ).size;
  const activeSource = selectedSource || bySource[0]?.sourceKind || "";
  const activeRecords = filteredRecords.filter(
    (record) => !activeSource || record.sourceKind === activeSource,
  );
  const visibleRecords = showAll ? activeRecords : activeRecords.slice(0, 6);
  const canAsk = permissions.some((permission) =>
    ["chat.ask_collect", "ask_collect.use"].includes(permission),
  );
  const locationNameById = useMemo(
    () => new Map(
      locations.map((location) => [
        location.id,
        localizedLocationName(location, locale),
      ]),
    ),
    [locale, locations],
  );

  const metrics = (() => {
    if (category === "attention")
      return [
        [locale === "zh" ? "关注点" : "Concerns", totalConcerns],
        [locale === "zh" ? "需补充" : "Needs update", needsUpdate],
        [locale === "zh" ? "待审核" : "Pending review", pending],
        [locale === "zh" ? "涉及记录" : "Records in scope", filteredRecords.length],
      ];
    if (category === "gaps")
      return [
        [locale === "zh" ? "草稿" : "Drafts", filteredRecords.length - totalSubmitted],
        [locale === "zh" ? "需补充" : "Needs update", needsUpdate],
        [locale === "zh" ? "来源" : "Sources", bySource.length],
        [locale === "zh" ? "地点" : "Locations", locationCount],
      ];
    if (category === "coverage")
      return [
        [locale === "zh" ? "已覆盖来源" : "Sources covered", bySource.length],
        [locale === "zh" ? "已覆盖地点" : "Locations covered", locationCount],
        [locale === "zh" ? "记录" : "Records", filteredRecords.length],
        [locale === "zh" ? "已批准" : "Approved", totalApproved],
      ];
    return [
      [locale === "zh" ? "记录" : "Records", filteredRecords.length],
      [locale === "zh" ? "已提交" : "Submitted", totalSubmitted],
      [locale === "zh" ? "已批准" : "Approved", totalApproved],
      [locale === "zh" ? "来源" : "Sources", bySource.length],
    ];
  })();

  const summary = (() => {
    if (!filteredRecords.length)
      return locale === "zh"
        ? "当前日期与来源范围内没有授权记录。"
        : "There are no authorized records in the selected date and source scope.";
    if (category === "attention")
      return locale === "zh"
        ? `当前范围有 ${totalConcerns} 个已记录关注点，${needsUpdate} 条需补充，${pending} 条待审核。`
        : `${totalConcerns} recorded concerns are in scope; ${needsUpdate} records need updates and ${pending} await review.`;
    if (category === "gaps")
      return locale === "zh"
        ? `${filteredRecords.length - totalSubmitted} 条仍为草稿，${needsUpdate} 条需补充；这些内容不会进入已批准证据分析。`
        : `${filteredRecords.length - totalSubmitted} records remain drafts and ${needsUpdate} need updates; neither enters approved-evidence analysis.`;
    if (category === "coverage") {
      const thinnest = [...bySource].sort((a, b) => a.total - b.total)[0];
      return thinnest
        ? locale === "zh"
          ? `${sourceKindLabel(thinnest.sourceKind, locale)} 是当前记录最少的已覆盖来源（${thinnest.total} 条），可作为下一步采集核实起点。`
          : `${sourceKindLabel(thinnest.sourceKind, locale)} is the thinnest covered source (${thinnest.total} records) and a useful starting point for collection planning.`
        : "";
    }
    return locale === "zh"
      ? `当前范围包含 ${filteredRecords.length} 条真实记录，其中 ${totalSubmitted} 条已提交、${totalApproved} 条已批准。`
      : `${filteredRecords.length} real records are in scope; ${totalSubmitted} are submitted and ${totalApproved} are approved.`;
  })();

  const aiScope = useMemo(() => ({
    dateFrom,
    dateTo,
    recordIds: filteredRecords.map((record) => record.id).sort(),
    ...(selectedSource
      ? { serviceTypeKeys: [selectedSource] }
      : selectedSources.length
        ? { serviceTypeKeys: selectedSources }
        : {}),
  }), [dateFrom, dateTo, filteredRecords, selectedSource, selectedSources]);
  const aiDataRevision = useMemo(
    () => filteredRecords
      .map((record) => `${record.id}:${record.updatedAt}:${record.reviewStatus}:${record.concernCount}`)
      .sort()
      .join("|"),
    [filteredRecords],
  );
  const aiInitialPrompt = useMemo(() => {
    const sourceDigest = bySource.map((row) => `${sourceKindLabel(row.sourceKind, locale)}: total=${row.total}, submitted=${row.submitted}, approved=${row.approved}, concerns=${row.concerns}`).join("; ");
    const categoryInstruction: Record<Category, string> = {
      changes: locale === "zh" ? "只提炼重复或变化的一线 observation，不解释原因。" : "Extract only repeated or changing field observations; do not explain causes yet.",
      attention: locale === "zh" ? "优先识别孤独、社会连接、失落、参与感、注意力或认知变化等心理与行为 concern；禁止诊断。" : "Prioritize psychological and behavioral concerns such as loneliness, social connection, grief, engagement, attention, or cognitive change; never diagnose.",
      gaps: locale === "zh" ? "为每个 concern 列出至少两个替代解释，以及区分这些解释所缺少的证据。" : "For each concern, give at least two alternative explanations and the missing evidence needed to distinguish them.",
      coverage: locale === "zh" ? "把 concern 与不确定性转成可由一线人员记录的具体问题，而不是只建议增加采集频次。" : "Turn concerns and uncertainty into concrete field questions, not merely a recommendation to collect more often.",
    };
    return locale === "zh"
      ? `请作为一线 field intelligence 分析助手，先阅读我有权限访问的已批准记录正文，再把图表指标仅作为证据覆盖背景。${categoryInstruction[category]}按 Signal、Concern、Uncertainty、Action 的推理链回答；明确区分事实与解释，不把相关性说成因果，不作心理或医学诊断，并引用支持结论的记录。范围 ${dateFrom} 至 ${dateTo}；记录 ${filteredRecords.length}，提交 ${totalSubmitted}，批准 ${totalApproved}，已批准 concern ${totalConcerns}。按来源：${sourceDigest || "无"}`
      : `Act as a field-intelligence analyst. Read the authorized approved record content first and use chart metrics only as evidence-coverage context. ${categoryInstruction[category]} Answer as Signal, Concern, Uncertainty, and Action. Separate fact from interpretation, do not imply causation or diagnose, and cite supporting records. Scope ${dateFrom} to ${dateTo}; records ${filteredRecords.length}, submitted ${totalSubmitted}, approved ${totalApproved}, approved concerns ${totalConcerns}. By source: ${sourceDigest || "none"}`;
  }, [bySource, category, dateFrom, dateTo, filteredRecords.length, locale, totalApproved, totalConcerns, totalSubmitted]);

  if (loading)
    return (
      <>
        <PageHeader title={locale === "zh" ? copy.titleZh : copy.titleEn} />
        <LoadingState rows={6} />
      </>
    );

  return (
    <div className={`stack insight-detail-page insight-detail-${copy.tone}`}>
      <PageHeader
        title={locale === "zh" ? copy.titleZh : copy.titleEn}
        description={locale === "zh" ? copy.descriptionZh : copy.descriptionEn}
        actions={
          <StatusPill tone="green">
            {locale === "zh" ? "实时授权数据" : "Live authorized data"}
          </StatusPill>
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}

      <section className="card insight-real-scope" aria-label={locale === "zh" ? "分析范围" : "Analysis scope"}>
        <div className="insight-real-dates">
          <label>
            {locale === "zh" ? "开始日期" : "Start date"}
            <input max={dateTo} onChange={(event) => setDateFrom(event.target.value)} type="date" value={dateFrom} />
          </label>
          <label>
            {locale === "zh" ? "结束日期" : "End date"}
            <input min={dateFrom} max={isoDay(today)} onChange={(event) => setDateTo(event.target.value)} type="date" value={dateTo} />
          </label>
        </div>
        {availableSources.length ? (
          <fieldset className="insight-real-source-filter">
            <legend>{locale === "zh" ? "来源" : "Sources"}</legend>
            {availableSources.map((source) => (
              <label key={source}>
                <input
                  checked={!selectedSources.length || selectedSources.includes(source)}
                  onChange={(event) => {
                    setSelectedSources((current) => {
                      const effective = current.length ? current : availableSources;
                      const next = event.target.checked
                        ? [...new Set([...effective, source])]
                        : effective.filter((item) => item !== source);
                      return next.length === availableSources.length ? [] : next;
                    });
                    setSelectedSource("");
                  }}
                  type="checkbox"
                />
                {sourceKindLabel(source, locale)}
              </label>
            ))}
          </fieldset>
        ) : null}
      </section>

      <section className="insight-kpi-strip" aria-label={locale === "zh" ? "范围摘要" : "Scope summary"}>
        {metrics.map(([label, value]) => (
          <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </section>

      {filteredRecords.length ? (
        <>
          <section className="card insight-real-summary">
            <h2>{locale === "zh" ? "快速读数" : "Quick read"}</h2>
            <p>{summary}</p>
          </section>
          <InsightCharts
            category={category}
            locale={locale}
            locations={locations}
            onSelectSource={(source) => {
              setSelectedSource((current) => current === source ? "" : source);
              setShowAll(false);
            }}
            records={filteredRecords}
            selectedSource={selectedSource}
          />

          {canAsk ? (
            <AiCopilotPanel
              conversationTitle={locale === "zh" ? copy.titleZh : copy.titleEn}
              contextSources={[{ label: "CHART-METRICS", statement: aiInitialPrompt }]}
              description={locale === "zh" ? "ChatGPT 会先根据当前授权图表生成解读，并用你有权限访问的已批准证据交叉核实；需要时可检索外部公开来源补充视角，并提供链接供你核验。" : "ChatGPT starts from the current authorized charts and cross-checks them against approved evidence you can access. When useful, it can add outside perspective from public web sources with links for verification."}
              initialPrompt={aiInitialPrompt}
              key={JSON.stringify({ scope: aiScope, dataRevision: aiDataRevision })}
              locale={locale}
              scope={aiScope}
              starterPrompts={[
                locale === "zh" ? "最近有哪些重复出现或明显变化的一线信号？" : "Which field signals are recurring or changing?",
                locale === "zh" ? "这些信号可能对应哪些心理 concern，还有哪些替代解释？" : "Which psychological concerns may fit these signals, and what are the alternatives?",
                locale === "zh" ? "下一轮应该具体观察或询问什么来验证？" : "What should we observe or ask next to verify them?",
              ]}
              title={locale === "zh" ? "ChatGPT 初步解读与共创" : "ChatGPT initial read and co-creation"}
            />
          ) : null}

          <section className="card insight-records-panel">
            <div className="insight-records-heading">
              <div>
                <h2>{sourceKindLabel(activeSource, locale)}</h2>
                <p>{locale === "zh" ? "打开记录查看原始表单、审核和证据状态。" : "Open a record to inspect its original form, review, and evidence state."}</p>
              </div>
              <StatusPill tone="neutral">{activeRecords.length} {locale === "zh" ? "条" : "records"}</StatusPill>
            </div>
            <div className="insight-record-list">
              {visibleRecords.map((record) => (
                <Link href={`/records/${record.id}`} key={record.id}>
                  <span className="insight-record-id">
                    <AppIcon name="records" />
                    <span>
                      <strong>{recordDisplayName(record, locale, { locationName: record.siteId ? locationNameById.get(record.siteId) : null })}</strong>
                      <small>{recordReference(record)}</small>
                    </span>
                  </span>
                  <span className="insight-record-status">
                    <StatusPill tone={statusTone(record.reviewStatus)}>{statusLabel(record.reviewStatus, locale)}</StatusPill>
                    {record.concernCount ? <small>{record.concernCount} {locale === "zh" ? "个关注点" : "concerns"}</small> : null}
                  </span>
                  <time dateTime={record.occurredAt ?? record.updatedAt}>
                    {new Date(record.occurredAt ?? record.updatedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}
                  </time>
                  <AppIcon className="insight-record-arrow" name="arrow" />
                </Link>
              ))}
            </div>
            {activeRecords.length > 6 ? (
              <button className="button button-ghost button-small" onClick={() => setShowAll((value) => !value)} type="button">
                {showAll ? (locale === "zh" ? "收起" : "Show fewer") : (locale === "zh" ? `显示全部 ${activeRecords.length} 条` : `Show all ${activeRecords.length}`)}
              </button>
            ) : null}
          </section>

        </>
      ) : (
        <EmptyState
          title={locale === "zh" ? "当前范围没有记录" : "No records in this scope"}
          description={locale === "zh" ? "调整日期范围，或返回记录页查看现有证据。" : "Adjust the date range or return to Records to inspect existing evidence."}
          action={<Link className="button button-secondary" href="/records?scope=operational">{locale === "zh" ? "查看记录" : "View records"}</Link>}
        />
      )}
    </div>
  );
}
