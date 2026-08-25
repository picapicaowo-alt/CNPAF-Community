"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
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
        title={locale === "zh" ? "数据统计" : "Analytics"}
        description={
          locale === "zh"
            ? "仅统计当前账号授权范围内的数据，并区分开始、提交与批准。"
            : "Counts are restricted to the current account's scope and separate started, submitted, and approved records."
        }
      />
      <div className="grid-2">
        <Link className="card stat-card card-interactive" href="/records">
          <div className="stat-value">{data.authorizedRecordCount}</div>
          <div className="stat-label">
            {locale === "zh" ? "授权范围内记录" : "Authorized records"}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看记录" : "View records"} <AppIcon name="arrow" /></span>
        </Link>
        <Link className="card stat-card card-interactive" href="/records?status=approved">
          <div className="stat-value">{totals.approved}</div>
          <div className="stat-label">
            {locale === "zh" ? "已批准记录" : "Approved records"}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看已批准记录" : "View approved"} <AppIcon name="arrow" /></span>
        </Link>
        <Link className="card stat-card card-interactive" href="/records?status=approved&hasConcerns=1">
          <div className="stat-value">{totalConcerns}</div>
          <div className="stat-label">
            {locale === "zh" ? "已批准关注点" : "Approved concerns"}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看关注点来源" : "Trace concerns"} <AppIcon name="arrow" /></span>
        </Link>
        <Link className="card stat-card card-interactive" href="/records?stage=submitted">
          <div className="stat-value">{Math.round(overallRate * 100)}%</div>
          <div className="stat-label">
            {locale === "zh"
              ? `${totals.submitted} / ${totals.started} 提交完成率`
              : `${totals.submitted} / ${totals.started} submission completion`}
          </div>
          <span className="stat-link">{locale === "zh" ? "查看已提交记录" : "View submissions"} <AppIcon name="arrow" /></span>
        </Link>
      </div>
      <section className="card stack-sm">
        <h2>{locale === "zh" ? "按采集来源" : "By collection source"}</h2>
        {data.completionBySourceKind.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{locale === "zh" ? "来源" : "Source"}</th>
                  <th>{locale === "zh" ? "开始" : "Started"}</th>
                  <th>{locale === "zh" ? "提交" : "Submitted"}</th>
                  <th>{locale === "zh" ? "批准" : "Approved"}</th>
                  <th>{locale === "zh" ? "完成率" : "Completion"}</th>
                </tr>
              </thead>
              <tbody>
                {data.completionBySourceKind.map((item) => (
                  <tr className="analytics-source-row" key={item.sourceKind}>
                    <td>
                      <Link className="table-link" href={`/records?source=${encodeURIComponent(item.sourceKind)}`}>
                        {item.sourceKind} <AppIcon name="arrow" />
                      </Link>
                    </td>
                    <td><Link href={`/records?source=${encodeURIComponent(item.sourceKind)}`}>{item.started}</Link></td>
                    <td><Link href={`/records?source=${encodeURIComponent(item.sourceKind)}&stage=submitted`}>{item.submitted}</Link></td>
                    <td><Link href={`/records?source=${encodeURIComponent(item.sourceKind)}&status=approved`}>{item.approved}</Link></td>
                    <td><Link href={`/records?source=${encodeURIComponent(item.sourceKind)}`}>{Math.round(item.rate * 100)}%</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
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
