"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

type Site = { id: string; name: string; siteType: string; canonicalStatus: string; region: string | null };

export default function SitesPage() {
  const { t } = useI18n();
  const [sites, setSites] = useState<Site[]>([]);
  const [into, setInto] = useState("");
  async function load() {
    const d = await fetch("/api/v1/sites?q=").then((r) => r.json());
    setSites(d.sites ?? []);
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
                onClick={() =>
                  fetch("/api/v1/sites", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fromId: s.id, intoId: into }),
                  }).then(load)
                }
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
