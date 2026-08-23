"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

type Rec = {
  id: string;
  sourceKind: string;
  privacyStatus: string;
  aiStatus: string;
  reviewStatus: string;
  updatedAt: string;
};

export default function OpsQueue() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Rec[]>([]);
  useEffect(() => {
    fetch("/api/v1/records")
      .then((r) => r.json())
      .then((d) => setRows((d.records ?? []).filter((r: Rec) => r.reviewStatus === "pending")));
  }, []);

  const flagged = rows.filter((r) => r.privacyStatus === "flagged");
  const rest = rows.filter((r) => r.privacyStatus !== "flagged");

  return (
    <div className="stack">
      <h1>{t.review}</h1>
      <div className="row">
        <Link className="btn secondary" href="/ops/safety">
          {t.safety}
        </Link>
        <Link className="btn secondary" href="/ops/analytics">
          {t.analytics}
        </Link>
        <Link className="btn secondary" href="/ops/sites">
          {t.sites}
        </Link>
        <Link className="btn secondary" href="/ops/jobs">
          {t.jobs}
        </Link>
        <Link className="btn secondary" href="/ops/invites">
          {t.invites}
        </Link>
      </div>
      <h2>{t.privacyFlagged}</h2>
      {flagged.map((r) => (
        <QueueCard key={r.id} r={r} />
      ))}
      <h2>{t.review}</h2>
      {rest.map((r) => (
        <QueueCard key={r.id} r={r} />
      ))}
    </div>
  );
}

function QueueCard({ r }: { r: Rec }) {
  return (
    <Link href={`/ops/review/${r.id}`} className="card">
      <div className="row">
        <strong>{r.sourceKind}</strong>
        <span className="chip">{r.privacyStatus}</span>
        <span className="chip">{r.aiStatus}</span>
      </div>
    </Link>
  );
}
