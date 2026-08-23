"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/v1/analytics")
      .then((r) => r.json())
      .then(setData);
  }, []);
  if (!data) return <p>Loading…</p>;
  const sc = data.submissionCompletion ?? { submitted: 0, started: 0, rate: 0 };
  return (
    <div className="stack">
      <h1>{t.analytics}</h1>
      <div className="grid-2">
        <div className="card">
          <h2>{t.fieldSignal}</h2>
          <p>
            {data.fieldSignal?.observations ?? 0} approved observations across {data.fieldSignal?.visits ?? 0} visits /{" "}
            {data.fieldSignal?.sites ?? 0} sites
          </p>
        </div>
        <div className="card">
          <h2>{t.expertSignal}</h2>
          <p>Raised by {data.expertSignal?.experts ?? 0} interviewed experts</p>
        </div>
        <div className="card">
          <h2>{t.literatureSupport}</h2>
          <p>Supported by {data.literatureSupport?.publications ?? 0} reviewed publications</p>
        </div>
        <div className="card">
          <h2>{t.submissionCompletion}</h2>
          <p>
            {sc.submitted} / {sc.started} ({Math.round((sc.rate ?? 0) * 100)}%)
          </p>
          <p className="muted">Started-then-submitted workflow rate. Not scheduled attendance.</p>
        </div>
      </div>
    </div>
  );
}
