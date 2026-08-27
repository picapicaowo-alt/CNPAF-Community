"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { listOpsSites, mergeOpsSite } from "@/features/operations/api";
import type { OpsSite } from "@/features/operations/types";
import { localizedLocationName } from "@/features/locations/model";

export default function SitesPage() {
  const { t, locale } = useI18n();
  const [sites, setSites] = useState<OpsSite[]>([]);
  const [into, setInto] = useState("");
  const statusLabel = (status: string) => {
    const labels: Record<string, { zh: string; en: string }> = {
      canonical: { zh: "标准地点", en: "Canonical" },
      unverified: { zh: "待审核", en: "Unverified" },
      archived: { zh: "已归档", en: "Archived" },
      merged: { zh: "已合并", en: "Merged" },
    };
    return labels[status]?.[locale] ??
      (locale === "zh" ? "未知状态" : "Unknown status");
  };
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
            <strong>{localizedLocationName(s, locale)}</strong>
            <div className="muted">
              {statusLabel(s.canonicalStatus)}{s.region ? ` · ${s.region}` : ""}
            </div>
          </div>
          {s.canonicalStatus === "unverified" ? (
            <div className="row">
              <input
                aria-label={locale === "zh" ? "合并目标地点 ID" : "Destination location ID"}
                placeholder={locale === "zh" ? "合并目标地点 ID" : "Destination location ID"}
                value={into}
                onChange={(e) => setInto(e.target.value)}
              />
              <button
                className="btn secondary"
                type="button"
                onClick={() => void mergeOpsSite(s.id, into).then(load)}
              >
                {locale === "zh" ? "合并" : "Merge"}
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
