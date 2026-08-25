"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { listJobs, processJobs, retryJob } from "@/features/operations/api";
import type { JobSummary } from "@/features/operations/types";

export default function JobsPage() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  async function load() {
    setJobs(await listJobs());
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="stack">
      <h1>{t.jobs}</h1>
      <div className="row">
        <button className="btn secondary" type="button" onClick={() => void processJobs().then(load)}>
          Process queue
        </button>
      </div>
      {jobs.map((j) => (
        <div className="card row" key={j.id} style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{j.kind}</strong>
            <div className="muted">
              {j.status} · attempts {j.attempts} {j.lastError ?? ""}
            </div>
          </div>
          {j.status === "dead" || j.status === "failed" ? (
            <button
              className="btn secondary"
              type="button"
              onClick={() => void retryJob(j.id).then(load)}
            >
              Retry
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
