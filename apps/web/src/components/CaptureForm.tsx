"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  sourceKindPolicySchema,
  type ActivityDefinitionSeed,
  type SourceKindPolicy,
} from "@cnpaf/shared";
import { useI18n } from "./LocaleProvider";
import {
  flushOutbox,
  getLocalDraft,
  newId,
  queueOutbox,
  saveLocalDraft,
} from "@/lib/offline";
import { apiFetch, ClientApiError, errorMessage } from "@/lib/api-client";

type Site = {
  id: string;
  name: string;
  siteType: string;
  region?: string | null;
  canonicalStatus: string;
};
type Activity = {
  id: string;
  key: string;
  version: number;
  nameZh: string;
  nameEn: string;
  fields: ActivityDefinitionSeed["fields"];
};
type Lookup = {
  category: string;
  key: string;
  nameZh: string;
  nameEn: string;
  sortOrder: number;
};
type SourceKind = {
  key: string;
  labelEn: string;
  labelZh: string;
  policy: SourceKindPolicy;
};

const CAPTURE_LOCK = "cnpaf.capturing";

export function CaptureForm({ clientRecordId }: { clientRecordId?: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [id] = useState(() => clientRecordId ?? newId());
  const [sourceKind, setSourceKind] = useState("");
  const [sourceKinds, setSourceKinds] = useState<SourceKind[]>([]);
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteQ, setSiteQ] = useState("");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState("");
  const [siteType, setSiteType] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState<string>("");
  const [quantitative, setQuantitative] = useState<
    Record<string, { reason: string; value: number | null }>
  >({});
  const [qualitative, setQualitative] = useState("");
  const [attestation, setAttestation] = useState(false);
  const [attribution, setAttribution] = useState<Record<string, string>>({});
  const [localVersion, setLocalVersion] = useState(1);
  const [status, setStatus] = useState<string>(t.saveDraft);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);

  const activity = activities.find((a) => a.id === activityId);
  const source = sourceKinds.find((item) => item.key === sourceKind);
  const sourcePolicy = source?.policy;
  const siteTypes = useMemo(
    () =>
      lookups
        .filter((item) => item.category === "site_type")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [lookups],
  );
  const missingReasons = useMemo(
    () =>
      lookups
        .filter((item) => item.category === "missing_reason")
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [lookups],
  );

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
    Promise.all([
      fetch("/api/v1/lookups").then((response) => response.json()),
      fetch("/api/v1/config/registries/source_kind?status=active").then(
        (response) => response.json(),
      ),
    ])
      .then(([lookupData, sourceData]) => {
        const nextLookups = (lookupData.lookups ?? []) as Lookup[];
        setLookups(nextLookups);
        setActivities(lookupData.activities ?? []);
        if (lookupData.activities?.[0])
          setActivityId((current) => current || lookupData.activities[0].id);
        const nextSiteType = nextLookups
          .filter((item) => item.category === "site_type")
          .sort((a, b) => a.sortOrder - b.sortOrder)[0];
        if (nextSiteType) setSiteType((current) => current || nextSiteType.key);
        const nextSourceKinds = (sourceData.items ?? []).flatMap(
          (item: {
            key: string;
            labelEn: string;
            labelZh: string;
            metadata?: { policy?: unknown };
          }) => {
            const parsed = sourceKindPolicySchema.safeParse(
              item.metadata?.policy,
            );
            return parsed.success
              ? [
                  {
                    key: item.key,
                    labelEn: item.labelEn,
                    labelZh: item.labelZh,
                    policy: parsed.data,
                  },
                ]
              : [];
          },
        );
        setSourceKinds(nextSourceKinds);
        if (nextSourceKinds[0])
          setSourceKind((current) => current || nextSourceKinds[0].key);
      })
      .catch(() => setError("Configuration could not be loaded"));
    getLocalDraft(id).then((draft) => {
      if (!draft) return;
      const p = draft.payload as Record<string, string>;
      setSourceKind(draft.sourceKind);
      setQualitative(String(p.qualitative ?? ""));
      setSiteId((p.siteId as string) || null);
      setActivityId(String(p.activityDefinitionId ?? ""));
      if (p.quantitative) setQuantitative(JSON.parse(String(p.quantitative)));
      if (p.attribution) {
        try {
          setAttribution(JSON.parse(String(p.attribution)));
        } catch {
          setAttribution({});
        }
      }
      setLocalVersion(draft.localVersion);
    });
    return () => {
      sessionStorage.removeItem(CAPTURE_LOCK);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [id]);

  useEffect(() => {
    if (!sourceKind || !sourcePolicy) return;
    const handle = setTimeout(async () => {
      const payload = {
        qualitative,
        siteId,
        activityDefinitionId: activityId,
        quantitative: JSON.stringify(quantitative),
        attribution: JSON.stringify(attribution),
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
          await apiFetch("/api/v1/records", {
            method: "POST",
            body: JSON.stringify(body),
          });
        } catch (caught) {
          if (!(caught instanceof ClientApiError) || caught.status >= 500) {
            await queueOutbox({
              id: `${id}-draft-${next}`,
              method: "POST",
              url: "/api/v1/records",
              body,
            });
            setStatus(t.pendingSync);
          } else {
            await saveLocalDraft({
              clientRecordId: id,
              localVersion: next,
              sourceKind,
              payload,
              updatedAt: new Date().toISOString(),
              syncStatus: "conflict",
            });
            setError(errorMessage(caught));
          }
        }
      } else {
        await queueOutbox({
          id: `${id}-draft-${next}`,
          method: "POST",
          url: "/api/v1/records",
          body,
        });
        setStatus(t.pendingSync);
      }
    }, 900);
    return () => clearTimeout(handle);
  }, [
    qualitative,
    quantitative,
    sourceKind,
    sourcePolicy,
    siteId,
    activityId,
    attribution,
  ]);

  useEffect(() => {
    if (!siteQ) return;
    const h = setTimeout(() => {
      fetch(`/api/v1/sites?q=${encodeURIComponent(siteQ)}`)
        .then((r) => r.json())
        .then((d) => setSites(d.sites ?? []));
    }, 250);
    return () => clearTimeout(h);
  }, [siteQ]);

  function buildBody(submit: boolean, version = localVersion) {
    const permittedAttribution = Object.fromEntries(
      (sourcePolicy?.allowedIdentifierFields ?? []).flatMap((field) =>
        attribution[field]?.trim() ? [[field, attribution[field].trim()]] : [],
      ),
    );
    return {
      clientRecordId: id,
      idempotencyKey: submit
        ? `${id}-submit-${version}`
        : `${id}-draft-${version}`,
      localVersion: version,
      sourceKind,
      siteId,
      activityDefinitionId: activityId || null,
      qualitative,
      quantitative,
      attribution: permittedAttribution,
      contentLanguage: locale,
      ...(submit && sourcePolicy?.requiresPiiAttestation
        ? { piiAttestation: attestation }
        : {}),
    };
  }

  async function ensureSite(): Promise<string | null> {
    if (!sourcePolicy?.requiresSite) return siteId;
    if (siteId) return siteId;
    if (!siteName.trim()) throw new Error("Site required");
    if (!siteType) throw new Error("Site type configuration is unavailable");
    const data = await apiFetch<{ site?: Site; suggestions?: Site[] }>(
      "/api/v1/sites",
      {
        method: "POST",
        body: JSON.stringify({ name: siteName, siteType }),
      },
    );
    if (data.suggestions?.length && !data.site) {
      setSites(data.suggestions);
      throw new Error(
        locale === "zh"
          ? "请选择一个建议地点，或修改地点名称。"
          : "Choose a suggested location or revise the location name.",
      );
    }
    if (!data.site)
      throw new Error(
        locale === "zh"
          ? "无法创建地点。"
          : "The location could not be created.",
      );
    setSiteId(data.site.id);
    return data.site.id;
  }

  async function onSubmit() {
    setError("");
    try {
      if (!sourcePolicy) throw new Error("Source configuration is unavailable");
      const sid = await ensureSite();
      const body = { ...buildBody(true, localVersion + 1), siteId: sid };
      if (!navigator.onLine) {
        await queueOutbox({
          id: body.idempotencyKey,
          method: "PUT",
          url: "/api/v1/records",
          body,
        });
        setStatus(t.offlineHint);
        router.push("/records");
        return;
      }
      await apiFetch("/api/v1/records", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      router.push("/records");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const attributionLabels: Record<string, string> = {
    professorName: t.professorName,
    affiliation: t.affiliation,
    attributionPermission: t.attributionPermission,
    quotePermission: t.quotePermission,
    title: t.title,
    url: t.url,
    authors: t.authors,
    year: locale === "zh" ? "年份" : "Year",
  };
  const attributionLookupCategory: Record<string, string> = {
    attributionPermission: "attribution_permission",
    quotePermission: "quote_permission",
  };

  return (
    <div className="stack">
      {!online ? <div className="banner">{t.offlineHint}</div> : null}
      <label>
        {t.sourceKind}
        <select
          value={sourceKind}
          onChange={(e) => setSourceKind(e.target.value)}
          disabled={!sourceKinds.length}
        >
          {sourceKinds.map((item) => (
            <option key={item.key} value={item.key}>
              {locale === "zh" ? item.labelZh : item.labelEn}
            </option>
          ))}
        </select>
      </label>

      {sourcePolicy?.requiresSite ? (
        <div className="card stack">
          <label>
            {t.searchSite}
            <input
              value={siteQ || siteName}
              onChange={(e) => {
                setSiteQ(e.target.value);
                setSiteName(e.target.value);
              }}
              placeholder={
                locale === "zh"
                  ? "搜索或输入地点"
                  : "Search or enter a location"
              }
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
            <select
              value={siteType}
              onChange={(e) => setSiteType(e.target.value)}
            >
              {siteTypes.map((item) => (
                <option key={item.key} value={item.key}>
                  {locale === "zh" ? item.nameZh : item.nameEn}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {sourcePolicy?.requiresActivity ? (
        <div className="card stack">
          <label>
            {t.activity}
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
            >
              {activities.map((a) => (
                <option key={a.id} value={a.id}>
                  {locale === "zh" ? a.nameZh : a.nameEn} v{a.version}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {sourcePolicy?.allowedIdentifierFields.length ? (
        <div className="card stack">
          {sourcePolicy.allowedIdentifierFields.map((field) => {
            const category = attributionLookupCategory[field];
            const options = category
              ? lookups
                  .filter((item) => item.category === category)
                  .sort((a, b) => a.sortOrder - b.sortOrder)
              : [];
            const required =
              sourcePolicy.requiredAttributionFields.includes(field);
            return (
              <label key={field}>
                {attributionLabels[field] ?? field}
                {options.length ? (
                  <select
                    value={attribution[field] ?? ""}
                    required={required}
                    onChange={(event) =>
                      setAttribution((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  >
                    <option value="">
                      {locale === "zh" ? "请选择" : "Select"}
                    </option>
                    {options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {locale === "zh" ? option.nameZh : option.nameEn}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      field === "url"
                        ? "url"
                        : field === "year"
                          ? "number"
                          : "text"
                    }
                    value={attribution[field] ?? ""}
                    required={required}
                    onChange={(event) =>
                      setAttribution((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            );
          })}
        </div>
      ) : null}

      {activity && sourcePolicy?.requiresActivity ? (
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
                    value={
                      quantitative[field.key]?.reason === "recorded"
                        ? (quantitative[field.key]?.value ?? "")
                        : ""
                    }
                    onChange={(e) =>
                      setQuantitative((q) => ({
                        ...q,
                        [field.key]: {
                          reason: "recorded",
                          value:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        },
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
                          value:
                            e.target.value === "recorded"
                              ? (q[field.key]?.value ?? null)
                              : null,
                        },
                      }))
                    }
                  >
                    {missingReasons.map((reason) => (
                      <option key={reason.key} value={reason.key}>
                        {locale === "zh" ? reason.nameZh : reason.nameEn}
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
        <textarea
          value={qualitative}
          onChange={(e) => setQualitative(e.target.value)}
        />
      </label>

      {sourcePolicy?.requiresPiiAttestation ? (
        <label className="row">
          <input
            type="checkbox"
            checked={attestation}
            onChange={(e) => setAttestation(e.target.checked)}
          />
          <span>{t.deidentifyAttest}</span>
        </label>
      ) : null}

      <div className="muted">{status}</div>
      {error ? <div className="chip bad">{error}</div> : null}
      <button
        className="btn"
        type="button"
        onClick={onSubmit}
        disabled={!sourcePolicy}
      >
        {t.submit}
      </button>
    </div>
  );
}
