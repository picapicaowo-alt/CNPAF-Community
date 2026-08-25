"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { listSafetyFlags, reviewSafetyFlag } from "@/features/operations/api";
import type { SafetyFlagSummary } from "@/features/operations/types";

export default function SafetyPage() {
  const { t } = useI18n();
  const [flags, setFlags] = useState<SafetyFlagSummary[]>([]);
  async function load() {
    setFlags(await listSafetyFlags());
  }
  useEffect(() => {
    load();
  }, []);
  async function close(id: string) {
    await reviewSafetyFlag(id);
    await load();
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
