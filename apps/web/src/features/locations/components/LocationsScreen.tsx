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
  addLocationAlias,
  approveLocation,
  archiveLocation,
  archiveLocationType,
  createLocation,
  createLocationType,
  listLocations,
  listLocationTypes,
  mergeLocation,
  updateLocation,
  updateLocationType,
} from "../api";
import {
  draftFromLocation,
  draftFromLocationType,
  EMPTY_LOCATION_DRAFT,
  EMPTY_LOCATION_TYPE_DRAFT,
  latestLocationTypes,
  formattedLocationAddress,
  locationTypeKeyFrom,
} from "../model";
import type {
  Location,
  LocationDraft,
  LocationType,
  LocationTypeDraft,
} from "../types";
import { LocationForm } from "./LocationForm";

type FormMode = "create" | "edit" | null;

export function LocationsScreen() {
  const { locale } = useI18n();
  const [locations, setLocations] = useState<Location[]>([]);
  const [types, setTypes] = useState<LocationType[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [draft, setDraft] = useState<LocationDraft>(EMPTY_LOCATION_DRAFT);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeDraft, setTypeDraft] = useState<LocationTypeDraft>(
    EMPTY_LOCATION_TYPE_DRAFT,
  );
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  const [showMerge, setShowMerge] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadAccess = useCallback(async () => {
    const [me, typeResult] = await Promise.all([
      apiFetch<{
        user: { organizationId?: string | null };
        permissions: string[];
      }>("/api/v1/auth/me"),
      listLocationTypes(),
    ]);
    const visibleTypes = latestLocationTypes(
      (typeResult.items ?? []).filter(
        (type) =>
          !type.organizationId ||
          type.organizationId === (me.user.organizationId ?? null),
      ),
    );
    setPermissions(me.permissions ?? []);
    setOrganizationId(me.user.organizationId ?? null);
    setTypes(visibleTypes);
    setDraft((current) => ({
      ...current,
      siteType:
        visibleTypes.some(
          (type) => type.status === "active" && type.key === current.siteType,
        )
          ? current.siteType
          : visibleTypes.find((type) => type.status === "active")?.key || "",
    }));
  }, []);

  const search = useCallback(async (value: string) => {
    const result = await listLocations(value);
    setLocations(result.locations ?? []);
    setSelectedId((current) =>
      result.locations.some((location) => location.id === current)
        ? current
        : "",
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadAccess(), search(query)]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadAccess, query, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!formMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) closeForm();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [formMode, saving]);

  const selected = locations.find((location) => location.id === selectedId);
  const canManage = permissions.includes("locations.manage");
  const canManageTypes =
    canManage || permissions.includes("services.manage");
  const activeTypes = useMemo(
    () => types.filter((type) => type.status === "active"),
    [types],
  );
  const archivedTypes = useMemo(
    () => types.filter((type) => type.status === "archived"),
    [types],
  );
  const formTypes = useMemo(() => {
    const current = types.find((type) => type.key === draft.siteType);
    return current && !activeTypes.some((type) => type.key === current.key)
      ? [...activeTypes, current]
      : activeTypes;
  }, [activeTypes, draft.siteType, types]);
  const typeLabels = useMemo(
    () =>
      new Map(
        types.map((type) => [
          type.key,
          locale === "zh" ? type.labelZh : type.labelEn,
        ]),
      ),
    [locale, types],
  );

  function beginCreate() {
    setSelectedId("");
    setDraft({
      ...EMPTY_LOCATION_DRAFT,
      siteType: activeTypes[0]?.key ?? "",
    });
    setFormMode("create");
  }

  function beginEdit(location: Location) {
    setSelectedId(location.id);
    setDraft(draftFromLocation(location));
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setSelectedId("");
    setMergeTargetId("");
    setMergeReason("");
    setShowMerge(false);
    setDraft({
      ...EMPTY_LOCATION_DRAFT,
      siteType: activeTypes[0]?.key ?? "",
    });
  }

  function beginCreateType() {
    const nextSortOrder = activeTypes.length
      ? Math.max(...activeTypes.map((type) => type.sortOrder)) + 1
      : 0;
    setEditingTypeId(null);
    setTypeDraft({
      ...EMPTY_LOCATION_TYPE_DRAFT,
      sortOrder: nextSortOrder,
    });
    setShowTypeForm(true);
  }

  function beginEditType(type: LocationType) {
    setEditingTypeId(type.id);
    setTypeDraft(draftFromLocationType(type));
    setShowTypeForm(true);
  }

  function closeTypeForm() {
    setEditingTypeId(null);
    setTypeDraft(EMPTY_LOCATION_TYPE_DRAFT);
    setShowTypeForm(false);
  }

  async function refreshLocationTypes() {
    const result = await listLocationTypes();
    const nextTypes = latestLocationTypes(
      (result.items ?? []).filter(
        (type) =>
          !type.organizationId || type.organizationId === organizationId,
      ),
    );
    const firstActiveKey = nextTypes.find(
      (type) => type.status === "active",
    )?.key;
    setTypes(nextTypes);
    setDraft((current) => ({
      ...current,
      siteType: nextTypes.some(
        (type) => type.status === "active" && type.key === current.siteType,
      )
        ? current.siteType
        : (firstActiveKey ?? ""),
    }));
  }

  async function saveLocationType() {
    const normalizedDraft = {
      ...typeDraft,
      key: locationTypeKeyFrom(typeDraft.key || typeDraft.labelEn),
    };
    setSaving(true);
    setError("");
    try {
      if (editingTypeId)
        await updateLocationType(editingTypeId, normalizedDraft);
      else await createLocationType(organizationId, normalizedDraft);
      closeTypeForm();
      await refreshLocationTypes();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeLocationType(type: LocationType) {
    if (
      !confirm(
        locale === "zh"
          ? `删除地点类型“${type.labelZh}”？它将不再出现在下拉菜单中，历史地点仍会保留。`
          : `Remove location type “${type.labelEn}”? It will leave the dropdown, while historical locations remain available.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await archiveLocationType(type.id);
      if (editingTypeId === type.id) closeTypeForm();
      await refreshLocationTypes();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function restoreLocationType(type: LocationType) {
    setSaving(true);
    setError("");
    try {
      await updateLocationType(type.id, draftFromLocationType(type));
      await refreshLocationTypes();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation() {
    setSaving(true);
    setError("");
    try {
      if (formMode === "edit" && selected) {
        await updateLocation(selected.id, draft);
        const normalizedAlias = draft.alias.trim().toLocaleLowerCase();
        if (
          normalizedAlias &&
          !selected.aliases.some(
            (item) => item.displayAlias.trim().toLocaleLowerCase() === normalizedAlias,
          )
        ) {
          await addLocationAlias(selected.id, draft.alias.trim(), locale);
        }
      } else await createLocation(organizationId, draft, locale);
      closeForm();
      await search(query);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await approveLocation(selected.id);
      await search(query);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archive(location: Location | undefined = selected) {
    if (
      !location ||
      !confirm(
        locale === "zh"
          ? `删除地点“${location.name}”？它将从地点列表移除，但历史记录仍会保留。`
          : `Remove “${location.name}”? It will leave the location list, while historical records remain available.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await archiveLocation(location.id);
      if (selectedId === location.id) setSelectedId("");
      await search(query);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function merge() {
    if (!selected || !mergeTargetId || !mergeReason.trim()) return;
    setSaving(true);
    setError("");
    try {
      await mergeLocation(selected.id, mergeTargetId, mergeReason.trim());
      closeForm();
      await search(query);
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
            ? "维护标准地点、现场建议、别名和重复地点合并。"
            : "Manage canonical locations, field proposals, aliases, and duplicate merges."
        }
        actions={
          canManage || canManageTypes ? (
            <div className="row">
              {canManageTypes ? (
                <button
                  aria-controls="location-type-manager"
                  aria-expanded={showTypeManager}
                  className="button button-secondary"
                  onClick={() => {
                    setShowTypeManager((current) => !current);
                    closeTypeForm();
                  }}
                  type="button"
                >
                  <AppIcon name="settings" />
                  {showTypeManager
                    ? locale === "zh"
                      ? "关闭类型管理"
                      : "Close type manager"
                    : locale === "zh"
                      ? "管理地点类型"
                      : "Manage location types"}
                </button>
              ) : null}
              {canManage ? (
                <button className="button" onClick={beginCreate} type="button">
                  <AppIcon name="plus" />
                  {locale === "zh" ? "新建地点" : "New location"}
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {showTypeManager && canManageTypes ? (
        <section className="card stack" id="location-type-manager">
          <div className="row-between mobile-stack">
            <div>
              <h2>{locale === "zh" ? "地点类型" : "Location types"}</h2>
              <p className="muted">
                {locale === "zh"
                  ? "下拉菜单用于快速选择；你可以在这里新增、重命名或删除选项。删除只会停用选项，不会破坏历史数据。"
                  : "Use the dropdown for quick selection, and manage its options here. Removing an option keeps historical data intact."}
              </p>
            </div>
            {!showTypeForm ? (
              <button className="button" onClick={beginCreateType} type="button">
                <AppIcon name="plus" />
                {locale === "zh" ? "新增类型" : "Add type"}
              </button>
            ) : null}
          </div>
          {showTypeForm ? (
            <div className="card card-soft stack-sm">
              <h3>
                {editingTypeId
                  ? locale === "zh"
                    ? "编辑地点类型"
                    : "Edit location type"
                  : locale === "zh"
                    ? "新增地点类型"
                    : "Add location type"}
              </h3>
              <div className="form-grid">
                <label>
                  {locale === "zh" ? "中文名称" : "Chinese name"}
                  <input
                    onChange={(event) =>
                      setTypeDraft((current) => ({
                        ...current,
                        labelZh: event.target.value,
                      }))
                    }
                    value={typeDraft.labelZh}
                  />
                </label>
                <label>
                  {locale === "zh" ? "英文名称" : "English name"}
                  <input
                    onChange={(event) => {
                      const labelEn = event.target.value;
                      setTypeDraft((current) => ({
                        ...current,
                        labelEn,
                        key:
                          editingTypeId || current.key
                            ? current.key
                            : locationTypeKeyFrom(labelEn),
                      }));
                    }}
                    value={typeDraft.labelEn}
                  />
                </label>
                <label>
                  {locale === "zh" ? "稳定标识" : "Stable key"}
                  <input
                    disabled={Boolean(editingTypeId)}
                    onChange={(event) =>
                      setTypeDraft((current) => ({
                        ...current,
                        key: locationTypeKeyFrom(event.target.value),
                      }))
                    }
                    placeholder="community_center"
                    value={typeDraft.key}
                  />
                </label>
                <label>
                  {locale === "zh" ? "排序" : "Sort order"}
                  <input
                    onChange={(event) =>
                      setTypeDraft((current) => ({
                        ...current,
                        sortOrder: Number(event.target.value),
                      }))
                    }
                    type="number"
                    value={typeDraft.sortOrder}
                  />
                </label>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button
                  className="button button-secondary"
                  disabled={saving}
                  onClick={closeTypeForm}
                  type="button"
                >
                  {locale === "zh" ? "取消" : "Cancel"}
                </button>
                <button
                  className="button"
                  disabled={
                    saving ||
                    !typeDraft.key ||
                    !typeDraft.labelZh.trim() ||
                    !typeDraft.labelEn.trim()
                  }
                  onClick={() => void saveLocationType()}
                  type="button"
                >
                  {saving
                    ? locale === "zh"
                      ? "正在保存…"
                      : "Saving…"
                    : locale === "zh"
                      ? "保存类型"
                      : "Save type"}
                </button>
              </div>
            </div>
          ) : null}
          {activeTypes.length ? (
            <div className="stack-sm">
              {activeTypes.map((type) => (
                <div
                  className="card card-soft row-between mobile-stack"
                  key={type.id}
                >
                  <div>
                    <strong>
                      {locale === "zh" ? type.labelZh : type.labelEn}
                    </strong>
                    <div className="caption">
                      {locale === "zh" ? type.labelEn : type.labelZh} · {type.key}
                    </div>
                  </div>
                  <div className="row">
                    <button
                      className="button button-secondary button-small"
                      disabled={saving}
                      onClick={() => beginEditType(type)}
                      type="button"
                    >
                      {locale === "zh" ? "编辑" : "Edit"}
                    </button>
                    <button
                      className="button button-ghost button-small"
                      disabled={saving}
                      onClick={() => void removeLocationType(type)}
                      type="button"
                    >
                      {locale === "zh" ? "删除" : "Remove"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {locale === "zh"
                ? "暂无可用类型，请先新增一个。"
                : "No active types yet. Add one to continue."}
            </p>
          )}
          {archivedTypes.length ? (
            <div className="stack-sm">
              <h3>{locale === "zh" ? "已删除类型" : "Removed types"}</h3>
              {archivedTypes.map((type) => (
                <div
                  className="card card-soft row-between mobile-stack"
                  key={type.id}
                >
                  <div className="row">
                    <StatusPill>
                      {locale === "zh" ? "已删除" : "Removed"}
                    </StatusPill>
                    <span>
                      <strong>
                        {locale === "zh" ? type.labelZh : type.labelEn}
                      </strong>
                      <span className="caption" style={{ display: "block" }}>
                        {type.key}
                      </span>
                    </span>
                  </div>
                  <button
                    className="button button-secondary button-small"
                    disabled={saving}
                    onClick={() => void restoreLocationType(type)}
                    type="button"
                  >
                    {locale === "zh" ? "恢复" : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      {formMode ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !saving) closeForm();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="location-dialog-title"
            aria-modal="true"
            className="modal-card location-modal"
            role="dialog"
          >
            <LocationForm
              aliases={selected?.aliases}
              draft={draft}
              editing={formMode === "edit"}
              locale={locale}
              onCancel={closeForm}
              onChange={setDraft}
              onSubmit={saveLocation}
              saving={saving}
              types={formTypes}
            />
            {formMode === "edit" && selected && canManage ? (
              <details className="advanced-panel">
                <summary>
                  {locale === "zh" ? "审核与重复地点处理" : "Review and duplicate handling"}
                </summary>
                <div className="stack-sm">
                  <p className="muted">
                    {locale === "zh"
                      ? "以下操作会改变地点状态，仅在确认重复或完成审核时使用。"
                      : "These actions change location status. Use them only after review."}
                  </p>
                  {selected.canonicalStatus === "unverified" ? (
                    <button
                      className="button button-secondary button-small"
                      disabled={saving}
                      onClick={() => void approve()}
                      type="button"
                    >
                      {locale === "zh" ? "批准为标准地点" : "Approve as canonical"}
                    </button>
                  ) : null}
                  <button
                    className="button button-ghost button-small"
                    onClick={() => setShowMerge((current) => !current)}
                    type="button"
                  >
                    {locale === "zh" ? "合并重复地点" : "Merge duplicate"}
                  </button>
                  {showMerge ? (
                    <div className="form-grid">
                      <label>
                        {locale === "zh" ? "保留的目标地点" : "Destination location"}
                        <select
                          onChange={(event) => setMergeTargetId(event.target.value)}
                          value={mergeTargetId}
                        >
                          <option value="">
                            {locale === "zh" ? "请选择…" : "Select…"}
                          </option>
                          {locations
                            .filter((location) => location.id !== selected.id)
                            .map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        {locale === "zh" ? "合并原因" : "Merge reason"}
                        <input
                          onChange={(event) => setMergeReason(event.target.value)}
                          value={mergeReason}
                        />
                      </label>
                      <button
                        className="button button-danger"
                        disabled={saving || !mergeTargetId || !mergeReason.trim()}
                        onClick={() => void merge()}
                        type="button"
                      >
                        {locale === "zh" ? "确认合并" : "Confirm merge"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </section>
        </div>
      ) : null}
      <div className="search-control">
        <AppIcon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            locale === "zh"
              ? "搜索名称、别名或地址…"
              : "Search name, alias, or address…"
          }
          value={query}
        />
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : locations.length ? (
        <div className="grid-3">
          {locations.map((location) => (
            <article className="card stack-sm location-card" key={location.id}>
              <div className="row-between">
                <span className="empty-icon">
                  <AppIcon name="locations" />
                </span>
                <StatusPill
                  tone={
                    location.canonicalStatus === "canonical" ? "green" : "amber"
                  }
                >
                  {location.canonicalStatus === "canonical"
                    ? locale === "zh"
                      ? "标准地点"
                      : "Canonical"
                    : locale === "zh"
                      ? "待审核"
                      : "Unverified"}
                </StatusPill>
              </div>
              <div>
                <h2 className="location-card-title">{location.name}</h2>
                <p className="caption location-card-address">
                  {formattedLocationAddress(location) ||
                    (locale === "zh" ? "未提供地址" : "No address supplied")}
                </p>
              </div>
              <div className="row">
                <StatusPill tone="blue">
                  {typeLabels.get(location.siteType) ?? location.siteType}
                </StatusPill>
                {location.aliases.slice(0, 3).map((item) => (
                  <StatusPill key={item.id}>{item.displayAlias}</StatusPill>
                ))}
              </div>
              {canManage ? (
                <div className="row">
                  <button
                    className="button button-secondary button-small"
                    onClick={() => beginEdit(location)}
                    type="button"
                  >
                    {locale === "zh" ? "编辑" : "Edit"}
                  </button>
                  <button
                    className="button button-ghost button-small"
                    disabled={saving}
                    onClick={() => void archive(location)}
                    type="button"
                  >
                    {locale === "zh" ? "删除" : "Remove"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            canManage ? (
              <button className="button" onClick={beginCreate} type="button">
                {locale === "zh" ? "新建地点" : "New location"}
              </button>
            ) : undefined
          }
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
