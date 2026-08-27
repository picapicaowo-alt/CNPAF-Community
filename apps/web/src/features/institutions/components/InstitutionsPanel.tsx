"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

export type Institution = {
  id: string;
  name: string;
  institutionTypeKey: "school" | "organization";
  status: "active" | "archived";
};

export function InstitutionsPanel({
  canManage,
  locale,
}: {
  canManage: boolean;
  locale: "zh" | "en";
}) {
  const [items, setItems] = useState<Institution[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<Institution["institutionTypeKey"]>("school");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<{ institutions: Institution[] }>("/api/v1/institutions");
      setItems(result.institutions ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!name.trim()) return;
    setSaving("create");
    setError("");
    try {
      await apiFetch("/api/v1/institutions", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), institutionTypeKey: type }),
      });
      setName("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function changeStatus(item: Institution) {
    const nextStatus = item.status === "active" ? "archived" : "active";
    if (
      nextStatus === "archived" &&
      !window.confirm(
        locale === "zh"
          ? "归档后不能再为人员选择，但已有归属历史会保留。继续吗？"
          : "Archived institutions cannot be selected for new affiliations. Existing history is retained. Continue?",
      )
    ) return;
    setSaving(item.id);
    setError("");
    try {
      await apiFetch(`/api/v1/institutions/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="stack institutions-panel">
      <div>
        <h2>{locale === "zh" ? "学校与机构" : "Schools & institutions"}</h2>
        <p className="muted">
          {locale === "zh"
            ? "维护统一目录；人员归属只从当前启用的学校与机构中选择。"
            : "Maintain one directory. People can only select active schools and institutions."}
        </p>
      </div>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      {canManage ? (
        <div className="institution-create-row">
          <label>
            {locale === "zh" ? "类型" : "Type"}
            <select value={type} onChange={(event) => setType(event.target.value as Institution["institutionTypeKey"])}>
              <option value="school">{locale === "zh" ? "学校" : "School"}</option>
              <option value="organization">{locale === "zh" ? "机构" : "Organization"}</option>
            </select>
          </label>
          <label>
            {locale === "zh" ? "名称" : "Name"}
            <input
              maxLength={500}
              onChange={(event) => setName(event.target.value)}
              placeholder={locale === "zh" ? "输入学校或机构正式名称" : "Official school or institution name"}
              value={name}
            />
          </label>
          <button className="button" disabled={saving === "create" || !name.trim()} onClick={() => void create()} type="button">
            {saving === "create" ? (locale === "zh" ? "正在添加…" : "Adding…") : (locale === "zh" ? "添加" : "Add")}
          </button>
        </div>
      ) : null}
      {loading && !items.length ? (
        <p className="muted">{locale === "zh" ? "正在加载目录…" : "Loading directory…"}</p>
      ) : items.length ? (
        <div className="institution-directory-list">
          {items.map((item) => (
            <div className="institution-directory-item" key={item.id}>
              <span>
                <strong>{item.name}</strong>
                <small>{item.institutionTypeKey === "school" ? (locale === "zh" ? "学校" : "School") : (locale === "zh" ? "机构" : "Organization")}</small>
              </span>
              <StatusPill tone={item.status === "active" ? "green" : "neutral"}>
                {item.status === "active" ? (locale === "zh" ? "启用" : "Active") : (locale === "zh" ? "已归档" : "Archived")}
              </StatusPill>
              {canManage ? (
                <button className="button button-ghost button-small" disabled={saving === item.id} onClick={() => void changeStatus(item)} type="button">
                  {item.status === "active" ? (locale === "zh" ? "归档" : "Archive") : (locale === "zh" ? "恢复" : "Restore")}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{locale === "zh" ? "还没有学校或机构，请先添加。" : "No schools or institutions yet."}</p>
      )}
    </section>
  );
}
