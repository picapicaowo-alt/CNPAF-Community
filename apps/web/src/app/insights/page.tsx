"use client";

import Link from "next/link";
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
};
type Report = { id: string; title: string; status: string; updatedAt: string };

export default function InsightsPage() {
  const { locale } = useI18n();
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
  const totalConcerns = useMemo(
    () =>
      analytics?.concernsByOrigin.reduce((sum, item) => sum + item.count, 0) ??
      0,
    [analytics],
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
      window.location.assign(`/insights/ask/${conversation.conversation.id}`);
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
            ? "先看变化和需要关注的事项，再看图表。"
            : "Start with what changed and what needs attention — charts come second."
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {canAsk ? (
        <div className="card row-between mobile-stack">
          <label style={{ flex: 1 }}>
            {locale === "zh" ? "搜索或询问 Collect" : "Search or ask Collect"}
            <input
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void ask();
              }}
              placeholder={
                locale === "zh"
                  ? "关于已批准数据提出问题…"
                  : "Ask a question about approved data…"
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
        <div className="insight-register" aria-label={locale === "zh" ? "洞察索引" : "Insight index"}>
          {[
            {
              href: "/insights/changes",
              title: locale === "zh" ? "发生了什么变化？" : "What changed?",
              detail:
                locale === "zh"
                  ? `当前授权范围内共有 ${analytics.authorizedRecordCount} 条记录。`
                  : `${analytics.authorizedRecordCount} records are currently in your authorized scope.`,
              value: analytics.authorizedRecordCount,
              unit: locale === "zh" ? "条记录" : "records",
            },
            {
              href: "/insights/attention",
              title: locale === "zh" ? "什么需要关注？" : "What needs attention?",
              detail:
                locale === "zh"
                  ? "定位已批准证据中的风险与关注点。"
                  : "Locate risks and concerns in approved evidence.",
              value: totalConcerns,
              unit: locale === "zh" ? "个关注点" : "concerns",
            },
            {
              href: "/insights/gaps",
              title: locale === "zh" ? "我们还不知道什么？" : "What do we still not know?",
              detail: lowestCompletion
                ? `${lowestCompletion.sourceKind} · ${locale === "zh" ? "最低完成率" : "lowest completion"}`
                : locale === "zh"
                  ? "目前没有足够的完成率数据。"
                  : "There is not enough completion data yet.",
              value: lowestCompletion ? Math.round(lowestCompletion.rate * 100) : "—",
              unit: lowestCompletion ? "%" : "",
            },
            {
              href: "/insights/coverage",
              title: locale === "zh" ? "下一步在哪里采集？" : "Where should we collect more?",
              detail:
                locale === "zh"
                  ? "使用任务与地点覆盖情况补齐证据缺口。"
                  : "Use task and location coverage to close evidence gaps.",
              value: "→",
              unit: locale === "zh" ? "采集建议" : "guidance",
            },
          ].map((item, index) => (
            <Link className="insight-register-row" href={item.href} key={item.href}>
              <span className="insight-register-rank">0{index + 1}</span>
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
                    {report.status}
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
