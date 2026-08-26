"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { sourceKindLabel, workflowLabel } from "@/lib/display-labels";

type Analytics = {
  authorizedRecordCount: number;
  recordsBySourceKind: Array<{
    sourceKind: string;
    started: number;
    submitted: number;
    approved: number;
  }>;
  concernsByOrigin: Array<{
    origin: string;
    count: number;
    uniqueReferences: number;
  }>;
  themesByOrigin: Array<{ origin: string; themeId: string | null; n: number }>;
  completionBySourceKind: Array<{ sourceKind: string; rate: number }>;
  dataHealth: {
    approvedRecordCount: number;
    activeSiteCount: number;
    activeSourceCount: number;
  };
  fieldInsight: {
    recentSignal: { statement: string; titleZh: string; titleEn: string; evidenceCount: number; signalCount: number } | null;
    leadingConcern: {
      statement: string;
      titleZh: string;
      titleEn: string;
      evidenceCount: number;
      recordCount: number;
      siteCount: number;
    } | null;
    concernCount: number;
  };
};
type Report = { id: string; title: string; status: string; updatedAt: string };

export default function InsightsPage() {
  const { locale } = useI18n();
  const router = useRouter();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{ permissions: string[] }>("/api/v1/auth/me");
      setPermissions(me.permissions ?? []);
      const [analyticsResult, reportResult] = await Promise.all([
        me.permissions.some((permission) =>
          ["analytics.view", "insights.view"].includes(permission),
        )
          ? apiFetch<Analytics>("/api/v1/analytics")
          : Promise.resolve(null),
        me.permissions.includes("reports.view")
          ? apiFetch<{ reports: Report[] }>("/api/v1/reports")
          : Promise.resolve({ reports: [] }),
      ]);
      setAnalytics(analyticsResult);
      setReports(reportResult.reports ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const canAsk = permissions.some((permission) =>
    ["chat.ask_collect", "ask_collect.use"].includes(permission),
  );
  const lowestCompletion = useMemo(
    () =>
      [...(analytics?.completionBySourceKind ?? [])].sort(
        (a, b) => a.rate - b.rate,
      )[0],
    [analytics],
  );

  async function ask() {
    if (!question.trim()) return;
    setAsking(true);
    setError("");
    try {
      const conversation = await apiFetch<{ conversation: { id: string } }>(
        "/api/v1/ask-collect/conversations",
        {
          method: "POST",
          body: JSON.stringify({ title: question.trim(), scope: {} }),
        },
      );
      await apiFetch(
        `/api/v1/ask-collect/conversations/${conversation.conversation.id}/messages`,
        { method: "POST", body: JSON.stringify({ content: question.trim() }) },
      );
      router.push(`/insights/ask/${conversation.conversation.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setAsking(false);
    }
  }

  if (loading)
    return (
      <>
        <PageHeader title={locale === "zh" ? "洞察" : "Insights"} />
        <LoadingState rows={5} />
      </>
    );
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "洞察" : "Insights"}
        description={
          locale === "zh"
            ? "从一线记录中发现变化，识别值得关注的心理信号，并决定下一步需要了解什么。"
            : "Find change in field records, surface psychological concerns, and decide what to learn next."
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {canAsk ? (
        <div className="card insight-conversation-entry row-between mobile-stack">
          <label style={{ flex: 1 }}>
            {locale === "zh" ? "与洞察对话" : "Talk with your insights"}
            <input
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void ask();
              }}
              placeholder={
                locale === "zh"
                  ? "问问这些一线记录正在告诉我们什么…"
                  : "Ask what these field records may be telling us…"
              }
              value={question}
            />
          </label>
          <button
            className="button"
            disabled={asking || !question.trim()}
            onClick={ask}
            type="button"
          >
            <AppIcon name="sparkles" />
            {asking
              ? locale === "zh"
                ? "正在询问…"
                : "Asking…"
              : locale === "zh"
                ? "询问"
                : "Ask"}
          </button>
        </div>
      ) : null}
      {analytics ? (
        <>
        <div className="insight-register insight-reasoning-chain" aria-label={locale === "zh" ? "洞察推理链" : "Insight reasoning chain"}>
          {[
            {
              href: "/insights/changes",
              priority: false,
              step: locale === "zh" ? "信号" : "Signal",
              title: locale === "zh" ? "最近出现了什么变化？" : "What changed recently?",
              detail:
                analytics.fieldInsight.recentSignal
                  ? locale === "zh"
                    ? `近期已批准记录中重复出现“${analytics.fieldInsight.recentSignal.titleZh}”相关的一线变化。打开后可查看原始记录与证据来源。`
                    : `Recent approved records repeatedly surface field changes related to “${analytics.fieldInsight.recentSignal.titleEn}.” Open the detail to inspect source records and evidence.`
                  : locale === "zh"
                    ? "还没有足够的已批准一线信号可供归纳。"
                    : "There are not enough approved field signals to synthesize yet.",
              value: analytics.fieldInsight.recentSignal ? Math.min(3, analytics.fieldInsight.recentSignal.signalCount) : 0,
              unit: locale === "zh" ? "个近期信号" : "recent signals",
            },
            {
              href: "/insights/attention",
              priority: Boolean(analytics.fieldInsight.leadingConcern),
              step: locale === "zh" ? "关注" : "Concern",
              title: locale === "zh" ? "哪些心理关注正在浮现？" : "Which psychological concerns are emerging?",
              detail:
                analytics.fieldInsight.leadingConcern
                  ? locale === "zh"
                    ? `${analytics.fieldInsight.leadingConcern.titleZh}：来自 ${analytics.fieldInsight.leadingConcern.recordCount} 条记录、${analytics.fieldInsight.leadingConcern.siteCount} 个地点的重复证据；这是一项待核实关注，不是诊断。`
                    : `${analytics.fieldInsight.leadingConcern.titleEn}: repeated evidence across ${analytics.fieldInsight.leadingConcern.recordCount} records and ${analytics.fieldInsight.leadingConcern.siteCount} locations; this is a concern to verify, not a diagnosis.`
                  : locale === "zh"
                    ? "暂未发现经过人工批准的心理 concern；这里不会把单条记录当作诊断。"
                    : "No human-approved psychological concern has emerged; a single record is never treated as a diagnosis.",
              value: analytics.fieldInsight.concernCount,
              unit: locale === "zh" ? "个潜在心理关注" : "potential concerns",
            },
            {
              href: "/insights/gaps",
              priority: false,
              step: locale === "zh" ? "待验证" : "Uncertainty",
              title: locale === "zh" ? "我们还不能确定什么？" : "What can we not determine yet?",
              detail: analytics.fieldInsight.leadingConcern
                ? locale === "zh"
                  ? `现有 ${analytics.fieldInsight.leadingConcern.recordCount} 条相关记录仍不足以区分短期情境、活动设计与持续的心理或行为变化。`
                  : `${analytics.fieldInsight.leadingConcern.recordCount} related records cannot yet separate short-term context, service design, and sustained psychological or behavioral change.`
                : locale === "zh"
                  ? "证据尚不足；先补充重复性、发生情境与基线信息，避免过度推断。"
                  : "Evidence is still thin. Capture recurrence, context, and baseline before interpreting further.",
              value: analytics.fieldInsight.leadingConcern
                ? locale === "zh"
                  ? "待验证"
                  : "Unverified"
                : "—",
              unit: locale === "zh" ? "不作诊断" : "not a diagnosis",
            },
            {
              href: "/insights/coverage",
              priority: false,
              step: locale === "zh" ? "下一步" : "Action",
              title: locale === "zh" ? "下一步应该验证什么？" : "What should we verify next?",
              detail:
                analytics.fieldInsight.leadingConcern
                  ? locale === "zh"
                    ? `下一轮围绕“${analytics.fieldInsight.leadingConcern.titleZh}”记录发生情境、持续时间、重复性，以及调整后是否改善。`
                    : `For “${analytics.fieldInsight.leadingConcern.titleEn},” capture context, duration, recurrence, and whether a change improves it.`
                  : locale === "zh"
                    ? "下一轮优先记录行为发生的情境、持续时间、是否重复，以及改变活动或支持方式后是否改善。"
                    : "Next, capture context, duration, recurrence, and whether changing the activity or support improves the signal.",
              value: "→",
              unit: locale === "zh" ? "建议采集项" : "collection prompts",
            },
          ].map((item) => (
            <Link
              className={`insight-register-row${item.priority ? " is-priority" : ""}`}
              href={item.href}
              key={item.href}
            >
              <span className="insight-chain-step">{item.step}</span>
              <span className="insight-register-copy">
                <strong>{item.title}</strong>
                <span>{item.detail}</span>
              </span>
              <span className="insight-register-value">
                <strong>{item.value}</strong>
                <span>{item.unit}</span>
              </span>
              <AppIcon name="arrow" />
            </Link>
          ))}
        </div>
        <section className="card data-health-panel" aria-labelledby="data-health-title">
          <div>
            <span className="eyebrow">{locale === "zh" ? "数据健康" : "Data health"}</span>
            <h2 id="data-health-title">{locale === "zh" ? "数据覆盖与采集质量" : "Data coverage and collection health"}</h2>
            <p>{locale === "zh" ? "这些指标帮助判断洞察是否可靠，但不代替一线内容本身。" : "These indicators help judge whether an insight is reliable; they do not replace field content."}</p>
          </div>
          <dl>
            <div><dt>{locale === "zh" ? "授权记录" : "Authorized records"}</dt><dd>{analytics.authorizedRecordCount}</dd></div>
            <div><dt>{locale === "zh" ? "已批准" : "Approved"}</dt><dd>{analytics.dataHealth.approvedRecordCount}</dd></div>
            <div><dt>{locale === "zh" ? "活跃地点" : "Active locations"}</dt><dd>{analytics.dataHealth.activeSiteCount}</dd></div>
            <div><dt>{locale === "zh" ? "最低完成率" : "Lowest completion"}</dt><dd>{lowestCompletion ? `${Math.round(lowestCompletion.rate * 100)}%` : "—"}</dd><small>{lowestCompletion ? sourceKindLabel(lowestCompletion.sourceKind, locale) : ""}</small></div>
          </dl>
        </section>
        </>
      ) : null}
      <section>
        <div className="section-title">
          <h2>{locale === "zh" ? "报告" : "Reports"}</h2>
          {permissions.includes("reports.edit") ? (
            <Link
              className="button button-secondary button-small"
              href="/reports/new"
            >
              <AppIcon name="plus" />
              {locale === "zh" ? "新建报告" : "New report"}
            </Link>
          ) : null}
        </div>
        {reports.length ? (
          <div className="stack-sm">
            {reports.slice(0, 5).map((report) => (
              <Link
                className="card card-compact card-interactive row-between"
                href={`/reports/${report.id}/edit`}
                key={report.id}
              >
                <div>
                  <h3>{report.title}</h3>
                  <StatusPill
                    tone={report.status === "published" ? "green" : "amber"}
                  >
                    {workflowLabel(report.status, locale)}
                  </StatusPill>
                </div>
                <AppIcon
                  name="arrow"
                  style={{ width: 18, height: 18, color: "var(--muted)" }}
                />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon="reports"
            title={locale === "zh" ? "还没有报告" : "No reports yet"}
            description={
              locale === "zh"
                ? "从已批准证据创建可编辑报告。"
                : "Create an editable report from approved evidence."
            }
          />
        )}
      </section>
    </div>
  );
}
