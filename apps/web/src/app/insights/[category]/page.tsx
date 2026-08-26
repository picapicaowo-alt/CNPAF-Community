"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AiCopilotPanel } from "@/components/AiCopilotPanel";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { sourceKindLabel } from "@/lib/display-labels";

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
  concernCount: number;
  occurredAt?: string | null;
  updatedAt: string;
};
type InsightLocation = { id: string; name: string };

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
    titleZh: "发生了什么变化？",
    titleEn: "What changed?",
    descriptionZh: "比较当前授权范围内的采集、提交和批准数量。",
    descriptionEn: "Compare collection, submission, and approval volume in your authorized scope.",
    tone: "blue",
  },
  attention: {
    titleZh: "什么需要关注？",
    titleEn: "What needs attention?",
    descriptionZh: "从真实记录中定位关注点、退回补充与待审内容。",
    descriptionEn: "Locate concerns, requested updates, and pending review in real records.",
    tone: "amber",
  },
  gaps: {
    titleZh: "我们还不知道什么？",
    titleEn: "What do we still not know?",
    descriptionZh: "根据未提交、需补充和来源覆盖识别证据边界。",
    descriptionEn: "Use unsubmitted work, requested updates, and source coverage to identify evidence limits.",
    tone: "violet",
  },
  coverage: {
    titleZh: "下一步在哪里采集？",
    titleEn: "Where should we collect next?",
    descriptionZh: "对比真实来源与地点覆盖，优先补充证据较少的范围。",
    descriptionEn: "Compare real source and location coverage to prioritize thinner evidence areas.",
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
      setRecords(result.records ?? []);
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
    ...(selectedSource
      ? { serviceTypeKeys: [selectedSource] }
      : selectedSources.length
        ? { serviceTypeKeys: selectedSources }
        : {}),
  }), [dateFrom, dateTo, selectedSource, selectedSources]);
  const aiInitialPrompt = useMemo(() => {
    const sourceDigest = bySource.map((row) => `${sourceKindLabel(row.sourceKind, locale)}: total=${row.total}, submitted=${row.submitted}, approved=${row.approved}, concerns=${row.concerns}`).join("; ");
    const categoryInstruction: Record<Category, string> = {
      changes: locale === "zh" ? "重点解读时间趋势和来源增减。" : "Focus on time trends and source-level changes.",
      attention: locale === "zh" ? "重点定位关注点集中来源和待处理状态。" : "Focus on concern concentration and action-needed states.",
      gaps: locale === "zh" ? "重点指出未批准、需补充和草稿造成的证据缺口。" : "Focus on evidence gaps caused by unapproved, needs-update, and draft work.",
      coverage: locale === "zh" ? "重点提出下一步地点和来源采集优先级。" : "Focus on the next location and source collection priorities.",
    };
    return locale === "zh"
      ? `请作为图表分析助手，根据以下当前图表指标生成一份简短的初步解读，并与我有权限访问的已批准证据交叉核实。${categoryInstruction[category]}分三部分回答：关键发现、证据边界、建议下一步。不要把相关性说成因果；引用支持结论的证据。图表范围 ${dateFrom} 至 ${dateTo}；记录 ${filteredRecords.length}，提交 ${totalSubmitted}，批准 ${totalApproved}，关注点 ${totalConcerns}。按来源：${sourceDigest || "无"}`
      : `Act as a chart analyst. Write a concise initial interpretation of these current chart metrics and cross-check it against approved evidence I am authorized to access. ${categoryInstruction[category]} Use three parts: key finding, evidence limit, and next step. Do not imply causation from correlation; cite supporting evidence. Chart scope ${dateFrom} to ${dateTo}; records ${filteredRecords.length}, submitted ${totalSubmitted}, approved ${totalApproved}, concerns ${totalConcerns}. By source: ${sourceDigest || "none"}`;
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
              description={locale === "zh" ? "ChatGPT 会先根据当前授权图表生成解读，并用你有权限访问的已批准证据交叉核实；你可以继续追问、比较或共同完善结论。" : "ChatGPT starts from the current authorized charts and cross-checks them against approved evidence you can access. Continue by asking, comparing, or refining the finding together."}
              initialPrompt={aiInitialPrompt}
              key={JSON.stringify(aiScope)}
              locale={locale}
              scope={aiScope}
              starterPrompts={[
                locale === "zh" ? "图表里最值得关注的异常是什么？" : "What is the most important anomaly in the chart?",
                locale === "zh" ? "哪些结论仍缺少足够证据？" : "Which conclusions still lack enough evidence?",
                locale === "zh" ? "把下一步行动整理成三个优先级。" : "Turn the next actions into three priorities.",
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
                    <span><strong>{record.id.slice(0, 8).toUpperCase()}</strong><small>{sourceKindLabel(record.sourceKind, locale)}</small></span>
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
          action={<Link className="button button-secondary" href="/records">{locale === "zh" ? "查看记录" : "View records"}</Link>}
        />
      )}
    </div>
  );
}
