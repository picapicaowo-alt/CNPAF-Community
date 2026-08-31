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
import {
  reviewItemLabel,
  sourceKindLabel,
  workflowLabel,
} from "@/lib/display-labels";
import { recordCitationLabel } from "@/features/records/display";
import { taskDate } from "@/lib/task-ui";

type ReviewItem = {
  id: string;
  itemType: string;
  recordId: string;
  sourceKind?: string;
  status: string;
  priority: number;
  summary: string;
  createdAt: string;
  recordOccurredAt?: string | null;
  recordUpdatedAt?: string | null;
  collectionPurpose?: string;
  aiSuggestionCount?: number;
};

const REVIEW_STATUS_ORDER = [
  "pending",
  "approved",
  "needs_completion",
  "not_submitted",
  "rejected",
] as const;

const itemTone: Record<
  string,
  "neutral" | "blue" | "green" | "amber" | "red" | "violet"
> = {
  privacy_flag: "red",
  safety_flag: "amber",
  ai_finding: "blue",
  custom_entry: "violet",
  record: "neutral",
};

export default function ReviewInboxPage() {
  const { locale } = useI18n();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [records, setRecords] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{
        items: ReviewItem[];
        records: ReviewItem[];
      }>("/api/v1/review/inbox");
      setItems(result.items ?? []);
      setRecords(result.records ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const countsByStatus = useMemo(
    () =>
      records.reduce<Record<string, number>>(
        (result, item) => ({
          ...result,
          [item.status]: (result[item.status] ?? 0) + 1,
        }),
        {},
      ),
    [records],
  );
  const statusTabs = [
    "all",
    ...REVIEW_STATUS_ORDER.filter((status) => countsByStatus[status]),
    ...Object.keys(countsByStatus).filter(
      (status) =>
        !REVIEW_STATUS_ORDER.includes(
          status as (typeof REVIEW_STATUS_ORDER)[number],
        ),
    ),
  ];
  const visible =
    filter === "all"
      ? records
      : records.filter((record) => record.status === filter);
  const activeItemByRecordId = useMemo(() => {
    const byRecordId = new Map<string, ReviewItem>();
    for (const item of items) {
      if (item.itemType === "ai_finding") continue;
      const current = byRecordId.get(item.recordId);
      if (!current || (current.itemType === "record" && item.itemType !== "record")) {
        byRecordId.set(item.recordId, item);
      }
    }
    return byRecordId;
  }, [items]);

  function statusLabel(status: string) {
    if (status === "all") return locale === "zh" ? "全部" : "All";
    if (status === "pending") return locale === "zh" ? "待批准" : "Pending";
    if (status === "approved") return locale === "zh" ? "已批准" : "Approved";
    if (status === "needs_completion")
      return locale === "zh" ? "已返回重审" : "Returned for revision";
    return workflowLabel(status, locale);
  }

  function statusTone(status: string) {
    if (status === "approved") return "green" as const;
    if (status === "pending") return "amber" as const;
    if (status === "needs_completion" || status === "rejected")
      return "red" as const;
    return "neutral" as const;
  }

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "审核" : "Review"}
        description={
          locale === "zh"
            ? "完整记录每条 record 从提交、待批准、返回修订到已批准的状态。"
            : "Track every record from submission through review, revision, and approval."
        }
      />
      <div aria-label={locale === "zh" ? "审核状态" : "Review status"} className="tabs" role="tablist">
        {statusTabs.map((status) => (
          <button
            aria-selected={filter === status}
            className={`tab${filter === status ? " active" : ""}`}
            key={status}
            onClick={() => setFilter(status)}
            role="tab"
            type="button"
          >
            {statusLabel(status)} {status === "all" ? records.length : countsByStatus[status]}
          </button>
        ))}
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="list-panel">
          <div className="list-panel-title">
            {filter === "all"
              ? locale === "zh"
                ? "全部审核记录"
                : "All review records"
              : statusLabel(filter)}
          </div>
          {visible.map((record) => {
            const activeItem = activeItemByRecordId.get(record.recordId);
            return (
              <Link
                className="list-row review-record-row"
                href={`/review/${activeItem?.id ?? record.id}`}
                key={record.id}
              >
                <div className="review-record-statuses">
                  <StatusPill tone={statusTone(record.status)}>
                    {statusLabel(record.status)}
                  </StatusPill>
                  {activeItem && activeItem.itemType !== "record" ? (
                    <StatusPill tone={itemTone[activeItem.itemType] ?? "neutral"}>
                      {reviewItemLabel(activeItem.itemType, locale)}
                    </StatusPill>
                  ) : null}
                  {record.aiSuggestionCount ? (
                    <StatusPill tone="blue">
                      {locale === "zh"
                        ? `AI 建议 ${record.aiSuggestionCount}`
                        : `${record.aiSuggestionCount} AI suggestions`}
                    </StatusPill>
                  ) : null}
                  {record.collectionPurpose === "system_validation" ? (
                    <StatusPill tone="violet">
                      {locale === "zh" ? "系统验收" : "System validation"}
                    </StatusPill>
                  ) : null}
                </div>
                <div>
                  <div className="list-row-title">
                    {recordCitationLabel(
                      {
                        id: record.recordId,
                        sourceKind: record.sourceKind ?? "other",
                        occurredAt: record.recordOccurredAt,
                        updatedAt: record.recordUpdatedAt,
                      },
                      locale,
                    )}
                  </div>
                  <div className="list-row-subtitle">
                    {sourceKindLabel(record.sourceKind ?? "other", locale)}
                  </div>
                </div>
                <div className="muted">{taskDate(record.createdAt, locale)}</div>
                <span className="list-row-arrow">
                  <AppIcon name="arrow" />
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="review"
          title={locale === "zh" ? "审核已清空" : "You’re all caught up"}
          description={
            locale === "zh"
              ? `当前“${statusLabel(filter)}”筛选中没有 record。`
              : `There are no records in the ${statusLabel(filter)} view.`
          }
        />
      )}
    </div>
  );
}
