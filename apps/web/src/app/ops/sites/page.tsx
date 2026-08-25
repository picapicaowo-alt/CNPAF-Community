"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { listOpsSites, mergeOpsSite } from "@/features/operations/api";
import type { OpsSite } from "@/features/operations/types";

export default function SitesPage() {
  const { t } = useI18n();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [into, setInto] = useState("");
  async function load() {
    setSites(await listOpsSites());
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="stack">
      <h1>{t.sites}</h1>
      {sites.map((s) => (
        <div className="card row" key={s.id} style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{s.name}</strong>
            <div className="muted">
              {s.siteType} · {s.canonicalStatus} · {s.region}
            </div>
          </div>
          {s.canonicalStatus === "unverified" ? (
            <div className="row">
              <input placeholder="merge into site id" value={into} onChange={(e) => setInto(e.target.value)} />
              <button
                className="btn secondary"
                type="button"
                onClick={() => void mergeOpsSite(s.id, into).then(load)}
              >
                Merge
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
