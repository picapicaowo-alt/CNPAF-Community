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
import {
  archiveConfigurationItem,
  createConfigurationItem,
  getConfigurationRegistry,
  updateConfigurationItem,
} from "../api";
import {
  draftFromRegistryItem,
  EMPTY_REGISTRY_ITEM,
  latestRegistryItems,
  registryKeyFrom,
} from "../model";
import {
  CONFIGURATION_REGISTRIES,
  type ConfigurationRegistryKey,
  type RegistryBundle,
  type RegistryItem,
  type RegistryItemDraft,
} from "../types";
import { ConfigurationItemForm } from "./ConfigurationItemForm";

export function ConfigurationScreen({
  initialRegistryKey = "site_type",
}: {
  initialRegistryKey?: ConfigurationRegistryKey;
}) {
  const { locale } = useI18n();
  const [selectedKey, setSelectedKey] =
    useState<ConfigurationRegistryKey>(initialRegistryKey);
  const [bundle, setBundle] = useState<RegistryBundle | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [editing, setEditing] = useState<RegistryItem | null>(null);
  const [draft, setDraft] = useState<RegistryItemDraft>(EMPTY_REGISTRY_ITEM);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, registry] = await Promise.all([
        apiFetch<{
          user: { organizationId?: string | null };
          permissions: string[];
        }>("/api/v1/auth/me"),
        getConfigurationRegistry(selectedKey),
      ]);
      setOrganizationId(me.user.organizationId ?? null);
      setCanManage(me.permissions.includes("services.manage"));
      setBundle(registry);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () => latestRegistryItems(bundle?.items ?? []),
    [bundle],
  );
  const descriptor = CONFIGURATION_REGISTRIES.find(
    (item) => item.key === selectedKey,
  )!;

  function beginCreate() {
    setEditing(null);
    setDraft({ ...EMPTY_REGISTRY_ITEM, sortOrder: items.length });
    setShowForm(true);
  }

  function beginEdit(item: RegistryItem) {
    setEditing(item);
    setDraft(draftFromRegistryItem(item));
    setShowForm(true);
  }

  function closeForm() {
    setEditing(null);
    setDraft(EMPTY_REGISTRY_ITEM);
    setShowForm(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const normalized = {
        ...draft,
        key: registryKeyFrom(draft.key || draft.labelEn),
        labelEn: draft.labelEn.trim(),
        labelZh: draft.labelZh.trim(),
      };
      if (editing)
        await updateConfigurationItem(selectedKey, editing.id, normalized);
      else
        await createConfigurationItem(
          selectedKey,
          normalized,
          organizationId,
        );
      closeForm();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archive(item: RegistryItem) {
    if (
      !confirm(
        locale === "zh"
          ? `从可选项中移除“${item.labelZh}”？历史数据仍会保留。`
          : `Remove “${item.labelEn}” from future choices? Historical data remains available.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await archiveConfigurationItem(selectedKey, item.id);
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
        title={locale === "zh" ? "自定义配置" : "Configuration"}
        description={
          locale === "zh"
            ? "集中维护业务类型、双语标签和可选值；历史引用不会被覆盖。"
            : "Manage business types, bilingual labels, and options without overwriting history."
        }
        actions={
          canManage ? (
            <button className="button" onClick={beginCreate} type="button">
              <AppIcon name="plus" />
              {locale === "zh" ? "新建配置项" : "New item"}
            </button>
          ) : undefined
        }
      />
      <div className="tabs" role="tablist">
        {CONFIGURATION_REGISTRIES.map((item) => (
          <button
            aria-selected={selectedKey === item.key}
            className={`tab${selectedKey === item.key ? " active" : ""}`}
            key={item.key}
            onClick={() => {
              setSelectedKey(item.key);
              closeForm();
            }}
            role="tab"
            type="button"
          >
            {locale === "zh" ? item.labelZh : item.labelEn}
          </button>
        ))}
      </div>
      <div className="card card-soft">
        <strong>{locale === "zh" ? descriptor.labelZh : descriptor.labelEn}</strong>
        <p className="muted">
          {locale === "zh"
            ? descriptor.descriptionZh
            : descriptor.descriptionEn}
        </p>
      </div>
      {error ? <ErrorState message={error} retry={load} /> : null}
      {showForm ? (
        <ConfigurationItemForm
          draft={draft}
          editing={Boolean(editing)}
          locale={locale}
          onCancel={closeForm}
          onChange={setDraft}
          onSubmit={save}
          saving={saving}
        />
      ) : null}
      {loading ? (
        <LoadingState rows={5} />
      ) : items.length ? (
        <div className="table-shell">
          <div className="table-scroll">
            <table className="data-table configuration-data-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "名称" : "Name"}</th>
                  <th>Key</th>
                  <th>{locale === "zh" ? "版本" : "Version"}</th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
                  <th>{locale === "zh" ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td data-label={locale === "zh" ? "名称" : "Name"}>
                      <strong>
                        {locale === "zh" ? item.labelZh : item.labelEn}
                      </strong>
                      <div className="caption">
                        {locale === "zh" ? item.helpTextZh : item.helpTextEn}
                      </div>
                    </td>
                    <td data-label="Key">{item.key}</td>
                    <td data-label={locale === "zh" ? "版本" : "Version"}>
                      v{item.version}
                    </td>
                    <td data-label={locale === "zh" ? "状态" : "Status"}>
                      <StatusPill
                        tone={item.status === "active" ? "green" : "neutral"}
                      >
                        {item.status}
                      </StatusPill>
                    </td>
                    <td data-label={locale === "zh" ? "操作" : "Actions"}>
                      {canManage && item.status === "active" ? (
                        <div className="row">
                          <button
                            className="button button-secondary button-small"
                            onClick={() => beginEdit(item)}
                            type="button"
                          >
                            {locale === "zh" ? "编辑" : "Edit"}
                          </button>
                          <button
                            className="button button-ghost button-small"
                            disabled={saving}
                            onClick={() => void archive(item)}
                            type="button"
                          >
                            {locale === "zh" ? "移除" : "Remove"}
                          </button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          action={
            canManage ? (
              <button className="button" onClick={beginCreate} type="button">
                {locale === "zh" ? "新建配置项" : "New item"}
              </button>
            ) : undefined
          }
          icon="settings"
          title={locale === "zh" ? "暂无配置项" : "No configuration items"}
          description={
            locale === "zh"
              ? "添加第一个可供业务页面选择的值。"
              : "Add the first value available to operational screens."
          }
        />
      )}
    </div>
  );
}
