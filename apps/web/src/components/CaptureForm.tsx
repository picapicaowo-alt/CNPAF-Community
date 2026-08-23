"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityDefinitionSeed } from "@cnpaf/shared";
import { useI18n } from "./LocaleProvider";
import { flushOutbox, getLocalDraft, newId, queueOutbox, saveLocalDraft } from "@/lib/offline";

type Site = { id: string; name: string; siteType: string; region?: string | null; canonicalStatus: string };
type Activity = { id: string; key: string; version: number; nameZh: string; nameEn: string; fields: ActivityDefinitionSeed["fields"] };

const CAPTURE_LOCK = "cnpaf.capturing";

export function CaptureForm({ clientRecordId }: { clientRecordId?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const id = clientRecordId ?? newId();
  const [sourceKind, setSourceKind] = useState("field_visit");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteQ, setSiteQ] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [siteType, setSiteType] = useState("adhc");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<string>("");
  const [quantitative, setQuantitative] = useState<Record<string, { reason: string; value: number | null }>>({});
  const [qualitative, setQualitative] = useState("");
  const [attestation, setAttestation] = useState(false);
  const [professorName, setProfessorName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [attributionPermission, setAttributionPermission] = useState("internal_named");
  const [quotePermission, setQuotePermission] = useState("internal");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [authors, setAuthors] = useState("");
  const [localVersion, setLocalVersion] = useState(1);
  const [status, setStatus] = useState(t.saveDraft);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);

  const activity = activities.find((a) => a.id === activityId);

  useEffect(() => {
    sessionStorage.setItem(CAPTURE_LOCK, "1");
    setOnline(navigator.onLine);
    const on = () => {
      setOnline(true);
      flushOutbox();
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    fetch("/api/v1/lookups")
      .then((r) => r.json())
      .then((d) => {
        setActivities(d.activities ?? []);
        if (d.activities?.[0]) setActivityId((cur) => cur || d.activities[0].id);
      });
    getLocalDraft(id).then((draft) => {
      if (!draft) return;
      const p = draft.payload as Record<string, string>;
      setSourceKind(draft.sourceKind);
      setQualitative(String(p.qualitative ?? ""));
      setSiteId((p.siteId as string) || null);
      setActivityId(String(p.activityDefinitionId ?? ""));
      if (p.quantitative) setQuantitative(JSON.parse(String(p.quantitative)));
      setProfessorName(String(p.professorName ?? ""));
      setTitle(String(p.title ?? ""));
      setUrl(String(p.url ?? ""));
      setLocalVersion(draft.localVersion);
    });
    return () => {
      sessionStorage.removeItem(CAPTURE_LOCK);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [id]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const payload = {
        qualitative,
        siteId,
        activityDefinitionId: activityId,
        quantitative: JSON.stringify(quantitative),
        professorName,
        title,
        url,
      };
      const next = localVersion + 1;
      setLocalVersion(next);
      await saveLocalDraft({
        clientRecordId: id,
        localVersion: next,
        sourceKind,
        payload,
        updatedAt: new Date().toISOString(),
        syncStatus: navigator.onLine ? "pending" : "local_only",
      });
      setStatus(t.saveDraft);
      const body = buildBody(false, next);
      if (navigator.onLine) {
        try {
          await fetch("/api/v1/records", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch {
          await queueOutbox({ id: `${id}-draft-${next}`, method: "POST", url: "/api/v1/records", body });
        }
      } else {
        await queueOutbox({ id: `${id}-draft-${next}`, method: "POST", url: "/api/v1/records", body });
        setStatus(t.pendingSync);
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [qualitative, quantitative, sourceKind, siteId, activityId, professorName, title, url]);

  useEffect(() => {
    if (!siteQ) return;
    const h = setTimeout(() => {
      fetch(`/api/v1/sites?q=${encodeURIComponent(siteQ)}`)
        .then((r) => r.json())
        .then((d) => setSites(d.sites ?? []));
    }, 250);
    return () => clearTimeout(h);
  }, [siteQ]);

  const missingOptions = useMemo(
    () => [
      ["not_recorded", locale === "zh" ? "未记录" : "Not recorded"],
      ["not_applicable", locale === "zh" ? "不适用" : "Not applicable"],
      ["unknown", locale === "zh" ? "不知道" : "Unknown"],
      ["refused", locale === "zh" ? "拒绝回答" : "Refused"],
    ],
    [locale],
  );

  function buildBody(submit: boolean, version = localVersion) {
    const attribution =
      sourceKind === "professor_interview"
        ? { professorName, affiliation, attributionPermission, quotePermission }
        : sourceKind === "literature"
          ? { title, url, authors }
          : {};
    return {
      clientRecordId: id,
      idempotencyKey: submit ? `${id}-submit-${version}` : `${id}-draft-${version}`,
      localVersion: version,
      sourceKind,
      siteId,
      activityDefinitionId: activityId || null,
      qualitative,
      quantitative,
      attribution,
      contentLanguage: locale,
      ...(submit ? { piiAttestation: attestation } : {}),
    };
  }

  async function ensureSite(): Promise<string | null> {
    if (sourceKind !== "field_visit") return siteId;
    if (siteId) return siteId;
    if (!siteName.trim()) throw new Error("Site required");
    const res = await fetch("/api/v1/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: siteName, siteType }),
    });
    const data = await res.json();
    if (data.suggestions?.length && !data.site) {
      setSites(data.suggestions);
    }
    setSiteId(data.site.id);
    return data.site.id;
  }

  async function onSubmit() {
    setError("");
    try {
      const sid = await ensureSite();
      const body = { ...buildBody(true, localVersion + 1), siteId: sid };
      const send = async () =>
        fetch("/api/v1/records", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      if (!navigator.onLine) {
        await queueOutbox({ id: body.idempotencyKey, method: "PUT", url: "/api/v1/records", body });
        setStatus(t.offlineHint);
        router.push("/records");
        return;
      }
      const res = await send();
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submit failed");
      router.push("/records");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <div className="stack">
      {!online ? <div className="banner">{t.offlineHint}</div> : null}
      <label>
        {t.sourceKind}
        <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value)}>
          <option value="field_visit">{t.fieldVisit}</option>
          <option value="professor_interview">{t.professorInterview}</option>
          <option value="literature">{t.literature}</option>
          <option value="other">{t.other}</option>
        </select>
      </label>

      {sourceKind === "field_visit" ? (
        <div className="card stack">
          <label>
            {t.searchSite}
            <input
              value={siteQ || siteName}
              onChange={(e) => {
                setSiteQ(e.target.value);
                setSiteName(e.target.value);
              }}
              placeholder="Sunny Day ADHC"
            />
          </label>
          {sites.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn secondary"
              onClick={() => {
                setSiteId(s.id);
                setSiteName(s.name);
                setSiteQ(s.name);
              }}
            >
              {s.name} · {s.siteType} {s.id === siteId ? "✓" : ""}
            </button>
          ))}
          <label>
            Site type
            <select value={siteType} onChange={(e) => setSiteType(e.target.value)}>
              <option value="adhc">ADHC</option>
              <option value="nursing_home">Nursing home 养老院</option>
              <option value="school">School 学校</option>
              <option value="university">University 大学</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            {t.activity}
            <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {locale === "zh" ? a.nameZh : a.nameEn} v{a.version}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {sourceKind === "professor_interview" ? (
        <div className="card stack">
          <label>
            {t.professorName}
            <input value={professorName} onChange={(e) => setProfessorName(e.target.value)} />
          </label>
          <label>
            {t.affiliation}
            <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} />
          </label>
          <label>
            {t.attributionPermission}
            <select value={attributionPermission} onChange={(e) => setAttributionPermission(e.target.value)}>
              <option value="internal_named">Internal named 内部可署名</option>
              <option value="public_named">Public named 公开可署名</option>
              <option value="anonymous">Anonymous 匿名</option>
            </select>
          </label>
          <label>
            {t.quotePermission}
            <select value={quotePermission} onChange={(e) => setQuotePermission(e.target.value)}>
              <option value="internal">Internal 仅内部</option>
              <option value="public">Public 可公开</option>
              <option value="no_quote">No quote 不可引用</option>
            </select>
          </label>
        </div>
      ) : null}

      {sourceKind === "literature" ? (
        <div className="card stack">
          <label>
            {t.title}
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            {t.url}
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </label>
          <label>
            {t.authors}
            <input value={authors} onChange={(e) => setAuthors(e.target.value)} />
          </label>
        </div>
      ) : null}

      {activity && sourceKind === "field_visit" ? (
        <div className="card stack">
          <h3>{t.quantitative}</h3>
          {activity.fields.map((field) => (
            <div key={field.key} className="stack">
              <div className="field-row">
                <label>
                  {locale === "zh" ? field.nameZh : field.nameEn}
                  <input
                    type="number"
                    min={field.min}
                    max={field.max}
                    value={quantitative[field.key]?.reason === "recorded" ? (quantitative[field.key]?.value ?? "") : ""}
                    onChange={(e) =>
                      setQuantitative((q) => ({
                        ...q,
                        [field.key]: { reason: "recorded", value: e.target.value === "" ? null : Number(e.target.value) },
                      }))
                    }
                  />
                </label>
                <label>
                  {t.missingReason}
                  <select
                    value={quantitative[field.key]?.reason ?? "not_recorded"}
                    onChange={(e) =>
                      setQuantitative((q) => ({
                        ...q,
                        [field.key]: {
                          reason: e.target.value,
                          value: e.target.value === "recorded" ? q[field.key]?.value ?? null : null,
                        },
                      }))
                    }
                  >
                    <option value="recorded">{locale === "zh" ? "已记录" : "Recorded"}</option>
                    {missingOptions.map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {field.anchors ? (
                <div className="muted">
                  {field.anchors.map((a) => (
                    <div key={a.value}>
                      {a.value}: {locale === "zh" ? a.zh : a.en}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <label>
        {t.qualitative}
        <textarea value={qualitative} onChange={(e) => setQualitative(e.target.value)} />
      </label>

      {sourceKind === "field_visit" ? (
        <label className="row">
          <input type="checkbox" checked={attestation} onChange={(e) => setAttestation(e.target.checked)} />
          <span>{t.deidentifyAttest}</span>
        </label>
      ) : null}

      <div className="muted">{status}</div>
      {error ? <div className="chip bad">{error}</div> : null}
      <button className="btn" type="button" onClick={onSubmit}>
        {t.submit}
      </button>
    </div>
  );
}
