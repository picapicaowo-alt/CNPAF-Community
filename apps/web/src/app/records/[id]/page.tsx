"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";

export default function RecordDetail() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetch(`/api/v1/records/${params.id}`)
      .then((r) => r.json())
      .then(setData);
  }, [params.id]);

  if (!data?.record) return <p className="muted">Loading…</p>;
  const record = data.record as { sourceKind: string; reviewStatus: string; aiStatus: string; privacyStatus: string };
  const versions = (data.versions as { qualitative: string; versionNumber: number; isSnapshot: boolean }[]) ?? [];
  const notes = (data.notes as { body: string }[]) ?? [];
  const findings = (data.findings as { kind: string; statement: string }[]) ?? [];
  const head = versions[0];

  return (
    <div className="stack">
      <h1>{t.terms.record}</h1>
      <div className="row">
        <span className="chip">{record.sourceKind}</span>
        <span className="chip">{record.reviewStatus}</span>
        <span className="chip">{record.aiStatus}</span>
        <span className="chip">{record.privacyStatus}</span>
      </div>
      <div className="card">
        <h3>{t.qualitative}</h3>
        <p>{head?.qualitative}</p>
      </div>
      {notes.length ? (
        <div className="card">
          <h3>{t.annotation}</h3>
          {notes.map((n, i) => (
            <p key={i}>{n.body}</p>
          ))}
        </div>
      ) : null}
      {findings.length ? (
        <div className="card stack">
          <h3>AI</h3>
          {findings.map((f, i) => (
            <div key={i}>
              <span className="chip">{f.kind}</span> {f.statement}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
