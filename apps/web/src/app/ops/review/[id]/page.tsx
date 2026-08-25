"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";
import { getReviewRecord, submitRecordReview } from "@/features/operations/api";
import type { ReviewFinding, ReviewRecord } from "@/features/operations/types";

export default function ReviewPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<ReviewRecord | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [decisions, setDecisions] = useState<Record<string, { decision: string; editedStatement?: string }>>({});

  useEffect(() => {
    void getReviewRecord(params.id).then((d) => {
        setData(d);
        const init: Record<string, { decision: string }> = {};
        for (const f of d.findings ?? []) {
          if (f.kind === "concern" || f.kind === "theme") init[f.id] = { decision: "approve" };
        }
        setDecisions(init);
      });
  }, [params.id]);

  if (!data?.record) return <p>Loading…</p>;
  const head = data.versions?.[0];
  const findings: ReviewFinding[] = data.findings ?? [];

  async function act(action: "approve" | "needs_completion") {
    const findingsPayload = Object.entries(decisions).map(([findingId, v]) => ({
      findingId,
      decision: v.decision,
      editedStatement: v.editedStatement,
    }));
    await submitRecordReview(params.id, {
      action,
      annotation,
      findings: findingsPayload,
    });
    router.push("/ops");
  }

  return (
    <div className="stack">
      <h1>{t.review}</h1>
      <div className="row">
        <span className="chip">{data.record.sourceKind}</span>
        <span className="chip">{data.record.privacyStatus}</span>
        <span className="chip">{data.record.aiStatus}</span>
      </div>
      <div className="card">
        <h3>{t.qualitative}</h3>
        <p>{head?.qualitative}</p>
      </div>
      {findings
        .filter((f) => f.kind !== "summary")
        .map((f) => (
          <div className="card stack" key={f.id}>
            <div className="row">
              <span className="chip">{f.kind}</span>
              {f.origin ? <span className="chip">{f.origin}</span> : null}
            </div>
            <strong>{f.statement}</strong>
            {(f.evidence ?? []).map((e, i) => (
              <div className="evidence" key={i}>
                {t.evidence}: {e.text}
              </div>
            ))}
            {f.kind === "concern" || f.kind === "theme" ? (
              <div className="row">
                <select
                  value={decisions[f.id]?.decision ?? "approve"}
                  onChange={(e) =>
                    setDecisions((d) => ({ ...d, [f.id]: { ...d[f.id], decision: e.target.value } }))
                  }
                >
                  <option value="approve">Approve</option>
                  <option value="edit">Edit</option>
                  <option value="reject">Reject</option>
                </select>
                {decisions[f.id]?.decision === "edit" ? (
                  <input
                    value={decisions[f.id]?.editedStatement ?? f.statement}
                    onChange={(e) =>
                      setDecisions((d) => ({
                        ...d,
                        [f.id]: { ...d[f.id], editedStatement: e.target.value },
                      }))
                    }
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      <label>
        {t.annotation}
        <textarea value={annotation} onChange={(e) => setAnnotation(e.target.value)} />
      </label>
      <div className="row">
        <button className="btn" type="button" onClick={() => act("approve")}>
          {t.approve}
        </button>
        <button className="btn secondary" type="button" onClick={() => act("needs_completion")}>
          {t.reject}
        </button>
      </div>
    </div>
  );
}
