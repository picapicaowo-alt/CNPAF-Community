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
import { taskDate } from "@/lib/task-ui";

type RecordRow = {
  id: string;
  clientRecordId: string;
  sourceKind: string;
  siteId?: string | null;
  programId?: string | null;
  recordStatus: string;
  reviewStatus: string;
  aiStatus: string;
  privacyStatus: string;
  researchUseStatus: string;
  updatedAt: string;
};
type Location = { id: string; name: string; region?: string | null };

function status(row: RecordRow) {
  if (row.privacyStatus === "flagged")
    return { label: "Privacy flagged", tone: "red" as const };
  if (row.reviewStatus === "needs_completion")
    return { label: "Needs update", tone: "amber" as const };
  if (row.reviewStatus === "approved")
    return { label: "Approved", tone: "green" as const };
  if (["queued", "running"].includes(row.aiStatus))
    return { label: "Analyzing", tone: "blue" as const };
  return {
    label: row.reviewStatus || row.recordStatus,
    tone: "neutral" as const,
  };
}

export default function RecordsPage() {
  const { locale } = useI18n();
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{ permissions: string[] }>("/api/v1/auth/me");
      const [recordResult, locationResult] = await Promise.all([
        apiFetch<{ records: RecordRow[] }>("/api/v1/records"),
        me.permissions.includes("locations.view")
          ? apiFetch<{ locations: Location[] }>("/api/v1/locations")
          : Promise.resolve({ locations: [] }),
      ]);
      setRows(recordResult.records ?? []);
      setLocations(locationResult.locations ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesFilter =
          filter === "all" ||
          row.reviewStatus === filter ||
          row.recordStatus === filter ||
          row.privacyStatus === filter;
        const value = query.trim().toLocaleLowerCase();
        const location = row.siteId ? locationById.get(row.siteId) : null;
        return (
          matchesFilter &&
          (!value ||
            [
              row.id,
              row.clientRecordId,
              row.sourceKind,
              row.reviewStatus,
              location?.name,
              location?.region,
            ].some((part) => part?.toLocaleLowerCase().includes(value)))
        );
      }),
    [filter, locationById, query, rows],
  );

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "记录" : "Records"}
        description={
          locale === "zh"
            ? "搜索组织已经采集的全部内容。"
            : "Search everything the organization has collected."
        }
        actions={
          <Link className="button button-secondary" href="/data">
            <AppIcon name="download" />
            {locale === "zh" ? "数据与下载" : "Data & downloads"}
          </Link>
        }
      />
      <div className="row" style={{ alignItems: "stretch" }}>
        <div className="search-control" style={{ flex: 1, minWidth: 240 }}>
          <AppIcon name="search" />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              locale === "zh"
                ? "搜索记录、地点、来源…"
                : "Search records, locations, sources…"
            }
            value={query}
          />
        </div>
        <select
          aria-label="Status filter"
          onChange={(event) => setFilter(event.target.value)}
          style={{ width: 170 }}
          value={filter}
        >
          <option value="all">
            {locale === "zh" ? "全部状态" : "All statuses"}
          </option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="needs_completion">Needs update</option>
          <option value="flagged">Privacy flagged</option>
          <option value="draft">Draft</option>
        </select>
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="table-shell">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "记录" : "Record"}</th>
                  <th>
                    {locale === "zh" ? "地点 / 来源" : "Location / source"}
                  </th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
                  <th>{locale === "zh" ? "研究使用" : "Research use"}</th>
                  <th>{locale === "zh" ? "更新" : "Updated"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const itemStatus = status(row);
                  const location = row.siteId
                    ? locationById.get(row.siteId)
                    : null;
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link
                          className="table-link"
                          href={`/records/${row.id}`}
                        >
                          {row.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td>
                        <strong>{location?.name ?? row.sourceKind}</strong>
                        <div className="caption">
                          {location
                            ? row.sourceKind
                            : locale === "zh"
                              ? "未关联地点"
                              : "No linked location"}
                        </div>
                      </td>
                      <td>
                        <StatusPill tone={itemStatus.tone}>
                          {itemStatus.label}
                        </StatusPill>
                      </td>
                      <td>{row.researchUseStatus}</td>
                      <td>{taskDate(row.updatedAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="records"
          title={locale === "zh" ? "没有匹配记录" : "No matching records"}
          description={
            locale === "zh"
              ? "尝试调整搜索词或状态筛选。"
              : "Try a different search or status filter."
          }
        />
      )}
    </div>
  );
}
