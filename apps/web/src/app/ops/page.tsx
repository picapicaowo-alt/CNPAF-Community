"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { listPendingReviewRecords } from "@/features/operations/api";
import type { OpsQueueRecord } from "@/features/operations/types";

export default function OpsQueue() {
  const { t } = useI18n();
  const [rows, setRows] = useState<OpsQueueRecord[]>([]);
  useEffect(() => {
    void listPendingReviewRecords().then(setRows);
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

function QueueCard({ r }: { r: OpsQueueRecord }) {
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
