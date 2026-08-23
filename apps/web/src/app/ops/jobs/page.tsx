"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

type Job = { id: string; kind: string; status: string; lastError: string | null; attempts: number };

export default function JobsPage() {
  const { t } = useI18n();
  const [jobs, setJobs] = useState<Job[]>([]);
  async function load() {
    const d = await fetch("/api/v1/jobs").then((r) => r.json());
    setJobs(d.jobs ?? []);
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="stack">
      <h1>{t.jobs}</h1>
      <div className="row">
        <button className="btn secondary" type="button" onClick={() => fetch("/api/v1/jobs", { method: "POST" }).then(load)}>
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
              onClick={() =>
                fetch("/api/v1/jobs", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: j.id }),
                }).then(load)
              }
            >
              Retry
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
