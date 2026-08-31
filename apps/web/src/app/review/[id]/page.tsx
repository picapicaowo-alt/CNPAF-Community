"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { FieldAnswersPanel } from "@/features/records/FieldAnswersPanel";
import {
  hasStructuredEvidence,
  StructuredEvidencePanel,
} from "@/features/records/StructuredEvidencePanel";
import type { RecordFieldAnswer } from "@/features/records/types";
import { recordCitationLabel } from "@/features/records/display";
import {
  AiSuggestionsPanel,
  type ReviewAiSuggestion,
} from "@/features/review/AiSuggestionsPanel";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  reviewItemLabel,
  reviewItemSummary,
  sourceKindLabel,
  workflowLabel,
} from "@/lib/display-labels";

type ReviewItem = {
  id: string;
  itemType: string;
  recordId: string;
  sourceKind?: string;
  status: string;
  priority: number;
  summary: string;
  createdAt: string;
  detail: {
    [key: string]: unknown;
    record?: Record<string, unknown>;
    recordVersion?: Record<string, unknown>;
    finding?: Record<string, unknown>;
    fieldAnswers?: RecordFieldAnswer[];
    aiFindings?: ReviewAiSuggestion[];
  };
};

export default function ReviewDetailPage() {
  const { locale } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<ReviewItem | null>(null);
  const [notes, setNotes] = useState("");
  const [editedText, setEditedText] = useState("");
  const [correctionFieldIds, setCorrectionFieldIds] = useState<string[]>([]);
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const result = await apiFetch<{ item: ReviewItem }>(
        `/api/v1/review/items/${params.id}`,
      );
      if (result.item.itemType === "ai_finding") {
        router.replace(`/review/${result.item.recordId}`);
        return;
      }
      setItem(result.item);
      setSelectedFindingIds([]);
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
  }, [params.id, router]);
  useEffect(() => {
    void load();
  }, [load]);

  const record = item?.detail.record ?? {};
  const version = item?.detail.recordVersion ?? {};
  const finding = item?.detail.finding ?? {};
  const recordLabel = item ? recordCitationLabel({
    id: item.recordId,
    sourceKind: String(record.sourceKind ?? item.sourceKind ?? "other"),
    occurredAt: typeof version.occurredAt === "string" ? version.occurredAt : null,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : null,
  }, locale) : "";
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
        decision: {
          action,
          annotation: notes || undefined,
          correctionFieldIds:
            action === "needs_completion" ? correctionFieldIds : [],
          findings:
            action === "approve"
              ? (item.detail.aiFindings ?? []).map((finding) => ({
                  findingId: finding.id,
                  decision: selectedFindingIds.includes(finding.id)
                    ? "approve"
                    : "reject",
                }))
              : [],
        },
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
  const canDecide = item.itemType !== "record" || item.status === "pending";

  return (
    <div className="stack">
      <PageHeader
        eyebrow={recordLabel}
        title={reviewItemSummary(item, locale)}
        description={
          canDecide
            ? locale === "zh"
              ? "先查看证据，再作出人工决定。"
              : "Review the evidence before making a human decision."
            : locale === "zh"
              ? "这是已完成的审核记录，保留在审核历史中供追溯。"
              : "This completed review remains available as an auditable history record."
        }
        actions={
          <>
            <StatusPill tone={item.priority >= 90 ? "red" : "blue"}>
              {reviewItemLabel(item.itemType, locale)}
            </StatusPill>
            <StatusPill
              tone={
                item.status === "approved"
                  ? "green"
                  : item.status === "needs_completion"
                    ? "red"
                    : "amber"
              }
            >
              {workflowLabel(item.status, locale)}
            </StatusPill>
            <Link className="button button-secondary" href={`/records/${item.recordId}`}>
              {locale === "zh" ? "打开原记录" : "Open record"}
            </Link>
          </>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      <div className={canDecide ? "content-aside" : "stack"}>
        <div className="stack">
          <div className="card stack-sm">
            <div className="row">
              <StatusPill>
                {sourceKindLabel(String(record.sourceKind ?? "record"), locale)}
              </StatusPill>
              <StatusPill>
                {record.privacyStatus === "clear"
                  ? locale === "zh"
                    ? "隐私检查通过"
                    : "Privacy cleared"
                  : workflowLabel(String(record.privacyStatus ?? item.status), locale)}
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
          <FieldAnswersPanel
            answers={item.detail.fieldAnswers ?? []}
            locale={locale}
            onFieldSelectionChange={
              item.itemType === "record"
                ? (fieldId, selected) =>
                    setCorrectionFieldIds((current) =>
                      selected
                        ? [...new Set([...current, fieldId])]
                        : current.filter((id) => id !== fieldId),
                    )
                : undefined
            }
            selectedFieldIds={correctionFieldIds}
            selectionDescription={
              locale === "zh"
                ? "复选框只在退回补充时使用：勾选需要采集人员修改或补证的具体题目。它不会更改原始回答。"
                : "Use the checkboxes only when returning a submission: select the exact answers that need correction or more evidence. This does not edit the original response."
            }
            title={locale === "zh" ? "提交的表单回答" : "Submitted form answers"}
          />
          {item.itemType === "record" && canDecide ? (
            <AiSuggestionsPanel
              findings={item.detail.aiFindings ?? []}
              locale={locale}
              onSelectionChange={(findingId, selected) =>
                setSelectedFindingIds((current) =>
                  selected
                    ? [...new Set([...current, findingId])]
                    : current.filter((id) => id !== findingId),
                )
              }
              selectedFindingIds={selectedFindingIds}
            />
          ) : null}
          <StructuredEvidencePanel
            locale={locale}
            value={
              hasStructuredEvidence(version.quantitative)
                ? version.quantitative
                : finding.evidence
            }
          />
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
        {canDecide ? <aside className="card stack-sm">
          <h2>{locale === "zh" ? "作出决定" : "Make a decision"}</h2>
          <label>
            {locale === "zh" ? "审核备注" : "Reviewer notes"}
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={
                locale === "zh"
                  ? "批准时可选；退回补充时必须说明需要补什么"
                  : "Optional for approval; required when returning for completion"
              }
            />
          </label>
          {item.itemType === "record" ? (
            <p className="caption review-decision-help">
              {locale === "zh"
                ? "“退回补充”会在填写备注并勾选至少一个需修改题目后启用。"
                : "Return for completion becomes available after you add a note and select at least one answer to correct."}
            </p>
          ) : null}
          {actions.map((action, index) => (
            <button
              className={`button button-wide${index ? " button-secondary" : ""}`}
              disabled={
                busy ||
                ((action === "redacted" || action === "edit") &&
                  !editedText.trim()) ||
                (action === "needs_completion" && !notes.trim()) ||
                (action === "needs_completion" &&
                  Boolean(item.detail.fieldAnswers?.length) &&
                  !correctionFieldIds.length) ||
                (action === "re_run_requested" && !notes.trim())
              }
              key={action}
              onClick={() => decide(action)}
              type="button"
            >
              {item.itemType === "record" &&
              action === "approve" &&
              selectedFindingIds.length
                ? locale === "zh"
                  ? `批准并提交 ${selectedFindingIds.length} 条 AI 建议`
                  : `Approve with ${selectedFindingIds.length} AI suggestions`
                : workflowLabel(action, locale)}
            </button>
          ))}
        </aside> : null}
      </div>
    </div>
  );
}
