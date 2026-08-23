"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

type Flag = { id: string; statement: string; status: string; createdAt: string };

export default function SafetyPage() {
  const { t } = useI18n();
  const [flags, setFlags] = useState<Flag[]>([]);
  async function load() {
    const d = await fetch("/api/v1/safety").then((r) => r.json());
    setFlags(d.flags ?? []);
  }
  useEffect(() => {
    load();
  }, []);
  async function close(id: string) {
    await fetch("/api/v1/safety", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "reviewed" }),
    });
    load();
  }
  return (
    <div className="stack">
      <h1>{t.safety}</h1>
      <p className="muted">Urgent human review only. AI does not confirm abuse and nothing is auto-reported.</p>
      {flags.map((f) => (
        <div className="card stack" key={f.id}>
          <span className="chip bad">{f.status}</span>
          <p>{f.statement}</p>
          {f.status === "open" ? (
            <button className="btn secondary" type="button" onClick={() => close(f.id)}>
              Mark reviewed
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
