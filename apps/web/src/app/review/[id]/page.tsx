"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type ReviewItem = {
  id: string;
  itemType: string;
  recordId: string;
  status: string;
  priority: number;
  summary: string;
  createdAt: string;
  detail: Record<string, Record<string, unknown>>;
};

export default function ReviewDetailPage() {
  const { locale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [notes, setNotes] = useState("");
  const [editedText, setEditedText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await apiFetch<{ item: ReviewItem }>(
        `/api/v1/review/items/${params.id}`,
      );
      setItem(result.item);
      const versionText = result.item.detail.recordVersion?.qualitative;
      const findingText = result.item.detail.finding?.statement;
      setEditedText(
        typeof findingText === "string"
          ? findingText
          : typeof versionText === "string"
            ? versionText
            : "",
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [params.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const record = item?.detail.record ?? {};
  const version = item?.detail.recordVersion ?? {};
  const finding = item?.detail.finding ?? {};
  const primaryText = useMemo(
    () =>
      [version.qualitative, finding.statement, item?.summary].find(
        (value) => typeof value === "string" && value.trim(),
      ) as string | undefined,
    [finding.statement, item?.summary, version.qualitative],
  );

  async function decide(action: string) {
    if (!item) return;
    setBusy(true);
    setError("");
    let payload: Record<string, unknown>;
    if (item.itemType === "record")
      payload = {
        itemType: "record",
        decision: { action, annotation: notes || undefined, findings: [] },
      };
    else if (item.itemType === "privacy_flag")
      payload = {
        itemType: "privacy_flag",
        decision: {
          resolution: action,
          notes: notes || undefined,
          ...(action === "redacted" ? { redactedText: editedText } : {}),
        },
      };
    else if (item.itemType === "safety_flag")
      payload = {
        itemType: "safety_flag",
        decision: { resolution: action, notes: notes || undefined },
      };
    else if (item.itemType === "ai_finding")
      payload = {
        itemType: "ai_finding",
        decision: {
          decision: action,
          reviewerNotes: notes || undefined,
          ...(action === "edit" ? { editedStatement: editedText } : {}),
        },
      };
    else
      payload = {
        itemType: "custom_entry",
        action,
        decision: { notes: notes || undefined },
      };
    try {
      await apiFetch(`/api/v1/review/items/${item.id}/decision`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.replace("/review");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  if (!item && !error)
    return (
      <>
        <PageHeader title={locale === "zh" ? "审核详情" : "Review detail"} />
        <LoadingState rows={4} />
      </>
    );
  if (!item)
    return (
      <>
        <PageHeader title={locale === "zh" ? "审核详情" : "Review detail"} />
        <ErrorState message={error} retry={load} />
      </>
    );
  const actions =
    item.itemType === "record"
      ? ["approve", "needs_completion"]
      : item.itemType === "privacy_flag"
        ? ["clear", "redacted", "dismissed"]
        : item.itemType === "safety_flag"
          ? ["resolved", "escalated", "dismissed"]
          : item.itemType === "ai_finding"
            ? ["approve", "edit", "dismiss", "re_run_requested"]
            : ["keep_free_text", "dismissed"];

  return (
    <div className="stack">
      <Link className="inline-link" href="/review">
        <AppIcon name="back" />
        {locale === "zh" ? "返回审核" : "Back to review"}
      </Link>
      <PageHeader
        title={item.summary}
        description={
          locale === "zh"
            ? "先查看证据，再作出人工决定。"
            : "Review the evidence before making a human decision."
        }
        actions={
          <StatusPill tone={item.priority >= 90 ? "red" : "blue"}>
            {item.itemType.replaceAll("_", " ")}
          </StatusPill>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className="content-aside">
        <div className="stack">
          <div className="card stack-sm">
            <div className="row">
              <StatusPill>{String(record.sourceKind ?? "record")}</StatusPill>
              <StatusPill>
                {String(record.privacyStatus ?? item.status)}
              </StatusPill>
            </div>
            <h2>{locale === "zh" ? "提交内容" : "Submitted content"}</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>
              {primaryText ||
                (locale === "zh"
                  ? "没有可显示的文字内容。"
                  : "No text content is available.")}
            </p>
          </div>
          {[version.quantitative, finding.evidence].some(Boolean) ? (
            <div className="card">
              <h2>{locale === "zh" ? "结构化证据" : "Structured evidence"}</h2>
              <pre
                style={{
                  margin: 0,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                }}
              >
                {JSON.stringify(
                  version.quantitative ?? finding.evidence,
                  null,
                  2,
                )}
              </pre>
            </div>
          ) : null}
          {item.itemType === "privacy_flag" ||
          item.itemType === "ai_finding" ? (
            <label>
              {item.itemType === "privacy_flag"
                ? locale === "zh"
                  ? "脱敏后的文字"
                  : "Redacted text"
                : locale === "zh"
                  ? "编辑建议"
                  : "Edited suggestion"}
              <textarea
                value={editedText}
                onChange={(event) => setEditedText(event.target.value)}
              />
            </label>
          ) : null}
        </div>
        <aside className="card stack-sm">
          <h2>{locale === "zh" ? "作出决定" : "Make a decision"}</h2>
          <label>
            {locale === "zh" ? "审核备注" : "Reviewer notes"}
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                locale === "zh"
                  ? "说明判断依据（可选）"
                  : "Explain your decision (optional)"
              }
            />
          </label>
          {actions.map((action, index) => (
            <button
              className={`button button-wide${index ? " button-secondary" : ""}`}
              disabled={
                busy ||
                ((action === "redacted" || action === "edit") &&
                  !editedText.trim()) ||
                (action === "re_run_requested" && !notes.trim())
              }
              key={action}
              onClick={() => decide(action)}
              type="button"
            >
              {action.replaceAll("_", " ")}
            </button>
          ))}
        </aside>
      </div>
    </div>
  );
}
