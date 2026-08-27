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
import { reviewItemLabel, reviewItemSummary } from "@/lib/display-labels";
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
};

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
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setItems(
        (await apiFetch<{ items: ReviewItem[] }>("/api/v1/review/inbox"))
          .items ?? [],
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () =>
      items.reduce<Record<string, number>>(
        (result, item) => ({
          ...result,
          [item.itemType]: (result[item.itemType] ?? 0) + 1,
        }),
        {},
      ),
    [items],
  );
  const types = ["all", ...Object.keys(counts)];
  const visible =
    filter === "all" ? items : items.filter((item) => item.itemType === filter);

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "审核" : "Review"}
        description={
          locale === "zh"
            ? "一个收件箱，处理所有需要人工决定的内容。"
            : "One inbox for anything that needs a human decision."
        }
      />
      <div className="tabs">
        {types.map((type) => (
          <button
            className={`tab${filter === type ? " active" : ""}`}
            key={type}
            onClick={() => setFilter(type)}
            type="button"
          >
            {type === "all"
              ? locale === "zh"
                ? "全部"
                : "All"
              : reviewItemLabel(type, locale)}{" "}
            {type === "all" ? items.length : counts[type]}
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
            {locale === "zh" ? "需要关注" : "Needs attention"}
          </div>
          {visible.map((item) => (
            <Link
              className="list-row"
              href={`/review/${item.id}`}
              key={`${item.itemType}:${item.id}`}
            >
              <div className="row">
                <StatusPill tone={itemTone[item.itemType] ?? "neutral"}>
                  {reviewItemLabel(item.itemType, locale)}
                </StatusPill>
              </div>
              <div>
                <div className="list-row-title">
                  {reviewItemSummary(item, locale)}
                </div>
                <div className="list-row-subtitle">
                  {recordCitationLabel({
                    id: item.recordId,
                    sourceKind: item.sourceKind ?? "other",
                    occurredAt: item.recordOccurredAt,
                    updatedAt: item.recordUpdatedAt,
                  }, locale)}
                </div>
              </div>
              <div className="muted">{taskDate(item.createdAt, locale)}</div>
              <span className="list-row-arrow">
                <AppIcon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="review"
          title={locale === "zh" ? "审核已清空" : "You’re all caught up"}
          description={
            locale === "zh"
              ? "当前筛选中没有需要人工处理的内容。"
              : "There is nothing awaiting a decision in this view."
          }
        />
      )}
    </div>
  );
}
