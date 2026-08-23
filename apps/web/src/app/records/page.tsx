"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

type Rec = {
  id: string;
  clientRecordId: string;
  sourceKind: string;
  recordStatus: string;
  reviewStatus: string;
  aiStatus: string;
  privacyStatus: string;
  updatedAt: string;
};

export default function RecordsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Rec[]>([]);
  useEffect(() => {
    fetch("/api/v1/records")
      .then((r) => r.json())
      .then((d) => setRows(d.records ?? []));
  }, []);

  function chip(r: Rec) {
    if (r.privacyStatus === "flagged") return <span className="chip bad">{t.privacyFlagged}</span>;
    if (r.reviewStatus === "needs_completion") return <span className="chip warn">{t.needsCompletion}</span>;
    if (r.reviewStatus === "approved") return <span className="chip ok">{t.approved}</span>;
    if (r.aiStatus === "queued" || r.aiStatus === "running") return <span className="chip">{t.analyzing}</span>;
    if (r.recordStatus === "submitted") return <span className="chip">{t.submitted}</span>;
    return <span className="chip">{t.saveDraft}</span>;
  }

  return (
    <div className="stack">
      <h1>{t.myRecords}</h1>
      {rows.map((r) => (
        <Link key={r.id} href={`/records/${r.id}`} className="card">
          <div className="row">
            <strong>{r.sourceKind}</strong>
            {chip(r)}
          </div>
          <div className="muted">{new Date(r.updatedAt).toLocaleString()}</div>
        </Link>
      ))}
    </div>
  );
}
