"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Location = {
  id: string;
  name: string;
  siteType: string;
  region?: string | null;
  address?: string | null;
  canonicalStatus: string;
  aliases: Array<{ id: string; displayAlias: string }>;
};
type RegistryItem = { key: string; labelEn: string; labelZh: string };

export default function LocationsPage() {
  const { locale } = useI18n();
  const [locations, setLocations] = useState<Location[]>([]);
  const [types, setTypes] = useState<RegistryItem[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [siteType, setSiteType] = useState("");
  const [region, setRegion] = useState("");
  const [address, setAddress] = useState("");
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{
        user: { organizationId?: string | null };
        permissions: string[];
      }>("/api/v1/auth/me");
      const [locationResult, typeResult] = await Promise.all([
        apiFetch<{ locations: Location[] }>(
          `/api/v1/locations${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
        ),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/site_type?status=active",
        ),
      ]);
      setPermissions(me.permissions ?? []);
      setOrganizationId(me.user.organizationId ?? null);
      setLocations(locationResult.locations ?? []);
      setTypes(typeResult.items ?? []);
      setSiteType((current) => current || typeResult.items?.[0]?.key || "");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(timer);
  }, [load]);
  const typeLabel = useMemo(
    () =>
      new Map(
        types.map((item) => [
          item.key,
          locale === "zh" ? item.labelZh : item.labelEn,
        ]),
      ),
    [locale, types],
  );
  async function create() {
    if (!name.trim() || !siteType) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/v1/locations", {
        method: "POST",
        body: JSON.stringify({
          organizationId,
          name: name.trim(),
          siteType,
          region: region.trim() || null,
          address: address.trim() || null,
          aliases: alias.trim()
            ? [{ displayAlias: alias.trim(), language: locale }]
            : [],
        }),
      });
      setName("");
      setRegion("");
      setAddress("");
      setAlias("");
      setShowCreate(false);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "地点" : "Locations"}
        description={
          locale === "zh"
            ? "维护标准地点及别名，减少重复记录和拼写差异。"
            : "Maintain canonical locations and aliases to reduce duplicate and inconsistent records."
        }
        actions={
          permissions.includes("locations.manage") ? (
            <button
              className="button"
              onClick={() => setShowCreate((value) => !value)}
              type="button"
            >
              <AppIcon name={showCreate ? "close" : "plus"} />
              {showCreate
                ? locale === "zh"
                  ? "关闭"
                  : "Close"
                : locale === "zh"
                  ? "新建地点"
                  : "New location"}
            </button>
          ) : undefined
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {showCreate ? (
        <section className="card stack">
          <h2>
            {locale === "zh" ? "新建标准地点" : "Create canonical location"}
          </h2>
          <div className="form-grid">
            <label>
              {locale === "zh" ? "名称" : "Name"}
              <input
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label>
              {locale === "zh" ? "地点类型" : "Location type"}
              <select
                onChange={(event) => setSiteType(event.target.value)}
                value={siteType}
              >
                {types.map((item) => (
                  <option key={item.key} value={item.key}>
                    {locale === "zh" ? item.labelZh : item.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {locale === "zh" ? "区域" : "Region"}
              <input
                onChange={(event) => setRegion(event.target.value)}
                value={region}
              />
            </label>
            <label>
              {locale === "zh" ? "别名（可选）" : "Alias (optional)"}
              <input
                onChange={(event) => setAlias(event.target.value)}
                value={alias}
              />
            </label>
            <label className="field-full">
              {locale === "zh" ? "地址（可选）" : "Address (optional)"}
              <input
                onChange={(event) => setAddress(event.target.value)}
                value={address}
              />
            </label>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              className="button"
              disabled={saving || !name.trim() || !siteType}
              onClick={create}
              type="button"
            >
              {saving
                ? locale === "zh"
                  ? "正在创建…"
                  : "Creating…"
                : locale === "zh"
                  ? "创建地点"
                  : "Create location"}
            </button>
          </div>
        </section>
      ) : null}
      <div className="search-control">
        <AppIcon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            locale === "zh"
              ? "搜索名称、别名或区域…"
              : "Search name, alias, or region…"
          }
          value={query}
        />
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : locations.length ? (
        <div className="grid-3">
          {locations.map((location) => (
            <article className="card stack-sm" key={location.id}>
              <div className="row-between">
                <span className="empty-icon">
                  <AppIcon name="locations" />
                </span>
                <StatusPill
                  tone={
                    location.canonicalStatus === "canonical" ? "green" : "amber"
                  }
                >
                  {location.canonicalStatus}
                </StatusPill>
              </div>
              <div>
                <h2>{location.name}</h2>
                <p className="muted">
                  {[location.region, location.address]
                    .filter(Boolean)
                    .join(" · ") ||
                    (locale === "zh" ? "未提供地址" : "No address supplied")}
                </p>
              </div>
              <div className="row">
                <StatusPill tone="blue">
                  {typeLabel.get(location.siteType) ?? location.siteType}
                </StatusPill>
                {location.aliases.map((item) => (
                  <StatusPill key={item.id}>{item.displayAlias}</StatusPill>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="locations"
          title={locale === "zh" ? "没有匹配地点" : "No matching locations"}
          description={
            locale === "zh"
              ? "更改搜索词，或创建一个标准地点。"
              : "Change the search or create a canonical location."
          }
        />
      )}
    </div>
  );
}
