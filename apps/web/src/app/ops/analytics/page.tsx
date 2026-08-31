"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { sourceKindLabel } from "@/lib/display-labels";

type Analytics = {
  authorizedRecordCount: number;
  excludedValidationRecordCount: number;
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
  completionBySourceKind: Array<{
    sourceKind: string;
    started: number;
    submitted: number;
    approved: number;
    rate: number;
  }>;
};

export default function AnalyticsPage() {
  const { locale } = useI18n();
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<Analytics>("/api/v1/analytics").then(setData).catch((caught) => {
      setError(errorMessage(caught));
    });
  }, []);
  if (error) return <ErrorState message={error} />;
  if (!data) return <LoadingState rows={4} />;
  const totals = data.recordsBySourceKind.reduce(
    (summary, item) => ({
      started: summary.started + item.started,
      submitted: summary.submitted + item.submitted,
      approved: summary.approved + item.approved,
    }),
    { started: 0, submitted: 0, approved: 0 },
  );
  const overallRate = totals.started ? totals.submitted / totals.started : 0;
  const totalConcerns = data.concernsByOrigin.reduce(
    (total, item) => total + item.count,
    0,
  );
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "数据健康与分析详情" : "Data health and analytics detail"}
        description={
          locale === "zh"
            ? "仅统计当前账号授权范围内的正式业务数据，并区分开始、提交与批准。"
            : "Counts are restricted to authorized operational data and separate started, submitted, and approved records."
        }
      />
      {data.excludedValidationRecordCount ? (
        <div className="feedback feedback-info analytics-validation-note" role="status">
          {locale === "zh"
            ? `已识别并排除 ${data.excludedValidationRecordCount} 条系统验收 record；它们保留审计，但不进入洞察与运营统计。`
            : `${data.excludedValidationRecordCount} system-validation records remain auditable but are excluded from insights and operational metrics.`}
        </div>
      ) : null}
      <div className="grid-2 analytics-metric-grid">
        <Link className="card stat-card card-interactive" href="/records?scope=operational">
          <div className="stat-value">{data.authorizedRecordCount}</div>
          <div className="stat-label">
            {locale === "zh" ? "授权范围内记录" : "Authorized records"}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看记录" : "View records"} <AppIcon name="arrow" /></span>
        </Link>
        <Link className="card stat-card card-interactive" href="/records?scope=operational&status=approved">
          <div className="stat-value">{totals.approved}</div>
          <div className="stat-label">
            {locale === "zh" ? "已批准记录" : "Approved records"}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看已批准记录" : "View approved"} <AppIcon name="arrow" /></span>
        </Link>
        <Link className="card stat-card card-interactive" href="/records?scope=operational&status=approved&hasConcerns=1">
          <div className="stat-value">{totalConcerns}</div>
          <div className="stat-label">
            {locale === "zh" ? "已批准关注点" : "Approved concerns"}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看关注点来源" : "Trace concerns"} <AppIcon name="arrow" /></span>
        </Link>
        <Link className="card stat-card card-interactive" href="/records?scope=operational&stage=submitted">
          <div className="stat-value">{Math.round(overallRate * 100)}%</div>
          <div className="stat-label">
            {locale === "zh"
              ? `${totals.submitted} / ${totals.started} 提交完成率`
              : `${totals.submitted} / ${totals.started} submission completion`}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看已提交记录" : "View submissions"} <AppIcon name="arrow" /></span>
        </Link>
      </div>
      <section className="card stack-sm analytics-source-section">
        <h2>{locale === "zh" ? "按采集来源" : "By collection source"}</h2>
        {data.completionBySourceKind.length ? (
          <div className="analytics-source-list">
            {data.completionBySourceKind.map((item) => {
              const source = encodeURIComponent(item.sourceKind);
              return (
                <article className="analytics-source-card" key={item.sourceKind}>
                  <Link className="analytics-source-heading" href={`/records?scope=operational&source=${source}`}>
                    <span>{sourceKindLabel(item.sourceKind, locale)}</span>
                    <AppIcon name="arrow" />
                  </Link>
                  <dl>
                    <div><dt>{locale === "zh" ? "开始" : "Started"}</dt><dd><Link href={`/records?scope=operational&source=${source}`}>{item.started}</Link></dd></div>
                    <div><dt>{locale === "zh" ? "提交" : "Submitted"}</dt><dd><Link href={`/records?scope=operational&source=${source}&stage=submitted`}>{item.submitted}</Link></dd></div>
                    <div><dt>{locale === "zh" ? "批准" : "Approved"}</dt><dd><Link href={`/records?scope=operational&source=${source}&status=approved`}>{item.approved}</Link></dd></div>
                    <div><dt>{locale === "zh" ? "完成率" : "Completion"}</dt><dd><Link href={`/records?scope=operational&source=${source}`}>{Math.round(item.rate * 100)}%</Link></dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            {locale === "zh" ? "还没有采集数据。" : "No collection data yet."}
          </p>
        )}
      </section>
    </div>
  );
}
