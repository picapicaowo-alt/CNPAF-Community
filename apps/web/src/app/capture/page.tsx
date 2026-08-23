"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CaptureForm } from "@/components/CaptureForm";
import { useI18n } from "@/components/LocaleProvider";
import { listLocalDrafts, newId, type LocalDraft } from "@/lib/offline";

export default function CapturePage() {
  const { t } = useI18n();
  const [drafts, setDrafts] = useState<LocalDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    listLocalDrafts().then((rows) => setDrafts(rows ?? []));
  }, []);

  if (activeId) {
    return <CaptureForm clientRecordId={activeId} />;
  }

  const latest = [...drafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

  return (
    <div className="stack">
      <h1>{t.capture}</h1>
      {latest ? (
        <button className="btn" type="button" onClick={() => setActiveId(latest.clientRecordId)}>
          {t.continueDraft}
        </button>
      ) : null}
      <button
        className="btn secondary"
        type="button"
        onClick={() => setActiveId(newId())}
      >
        {t.newRecord}
      </button>
      <Link className="btn ghost" href="/records">
        {t.myRecords}
      </Link>
    </div>
  );
}
