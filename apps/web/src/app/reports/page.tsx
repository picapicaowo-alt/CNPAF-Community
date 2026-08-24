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

type Report = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  publishedAt?: string | null;
};

export default function ReportsPage() {
  const { locale } = useI18n();
  const [reports, setReports] = useState<Report[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, result] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ reports: Report[] }>("/api/v1/reports"),
      ]);
      setPermissions(me.permissions ?? []);
      setReports(result.reports ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      reports.filter(
        (report) =>
          (status === "all" || report.status === status) &&
          (!query.trim() ||
            report.title
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase())),
      ),
    [query, reports, status],
  );

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "报告" : "Reports"}
        description={
          locale === "zh"
            ? "从已批准证据编写、审核并发布报告。"
            : "Write, review, and publish reports from approved evidence."
        }
        actions={
          permissions.includes("reports.edit") ? (
            <Link className="button" href="/reports/new">
              <AppIcon name="plus" />
              {locale === "zh" ? "新建报告" : "New report"}
            </Link>
          ) : undefined
        }
      />
      <div className="card card-compact form-grid">
        <label>
          {locale === "zh" ? "搜索" : "Search"}
          <span className="search-control">
            <AppIcon name="search" />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder={locale === "zh" ? "报告标题…" : "Report title…"}
              value={query}
            />
          </span>
        </label>
        <label>
          {locale === "zh" ? "状态" : "Status"}
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">
              {locale === "zh" ? "全部状态" : "All statuses"}
            </option>
            {[...new Set(reports.map((report) => report.status))].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="list-panel">
          {visible.map((report) => (
            <Link
              className="list-row"
              href={`/reports/${report.id}/edit`}
              key={report.id}
            >
              <div>
                <div className="list-row-title">{report.title}</div>
                <div className="list-row-subtitle">
                  {new Date(report.updatedAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                  )}
                </div>
              </div>
              <StatusPill
                tone={
                  report.status === "published"
                    ? "green"
                    : report.status === "archived"
                      ? "neutral"
                      : "amber"
                }
              >
                {report.status}
              </StatusPill>
              <span className="muted">
                {report.publishedAt
                  ? new Date(report.publishedAt).toLocaleDateString(
                      locale === "zh" ? "zh-CN" : "en-US",
                    )
                  : locale === "zh"
                    ? "未发布"
                    : "Not published"}
              </span>
              <span className="list-row-arrow">
                <AppIcon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            permissions.includes("reports.edit") ? (
              <Link className="button" href="/reports/new">
                {locale === "zh" ? "创建第一份报告" : "Create the first report"}
              </Link>
            ) : undefined
          }
          icon="reports"
          title={locale === "zh" ? "没有符合条件的报告" : "No matching reports"}
          description={
            locale === "zh"
              ? "调整筛选条件，或创建一份新报告。"
              : "Adjust the filters or create a new report."
          }
        />
      )}
    </div>
  );
}
