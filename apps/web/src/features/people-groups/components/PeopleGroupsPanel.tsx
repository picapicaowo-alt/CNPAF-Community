"use client";

import { useCallback, useEffect, useState } from "react";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { StatusPill } from "@/components/ui";
import { errorMessage } from "@/lib/api-client";
import {
  createPeopleGroup,
  listPeopleGroups,
  setPeopleGroupStatus,
  updatePeopleGroup,
} from "../api";
import { peopleGroupKeyFrom, primaryDepartment } from "../model";
import type {
  GroupablePerson,
  PeopleGroup,
  PeopleGroupDraft,
} from "../types";

const EMPTY_DRAFT: PeopleGroupDraft = {
  nameEn: "",
  nameZh: "",
  descriptionEn: "",
  descriptionZh: "",
  userIds: [],
};

export function PeopleGroupsPanel({
  canManage,
  embedded = false,
  locale,
  onChanged,
  people,
}: {
  canManage: boolean;
  embedded?: boolean;
  locale: "zh" | "en";
  onChanged: () => Promise<void>;
  people: GroupablePerson[];
}) {
  const [groups, setGroups] = useState<PeopleGroup[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<PeopleGroupDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const select = useCallback((group: PeopleGroup) => {
    setSelectedId(group.id);
    setCreating(false);
    setDraft({
      nameEn: group.nameEn,
      nameZh: group.nameZh,
      descriptionEn: group.descriptionEn ?? "",
      descriptionZh: group.descriptionZh ?? "",
      userIds: group.memberIds,
    });
  }, []);

  const load = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await listPeopleGroups();
      setGroups(result.groups ?? []);
      const next =
        result.groups.find((group) => group.id === preferredId) ??
        result.groups[0];
      if (next) select(next);
      else {
        setCreating(true);
        setSelectedId("");
        setDraft(EMPTY_DRAFT);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [select]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = groups.find((group) => group.id === selectedId);
  const activePeople = people.filter((person) => person.status === "active");

  function change<Key extends keyof PeopleGroupDraft>(
    key: Key,
    value: PeopleGroupDraft[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function startCreate() {
    setCreating(true);
    setSelectedId("");
    setDraft(EMPTY_DRAFT);
    setError("");
  }

  async function save() {
    if (!draft.nameEn.trim() || !draft.nameZh.trim()) return;
    setSaving(true);
    setError("");
    try {
      const result = creating
        ? await createPeopleGroup(peopleGroupKeyFrom(draft.nameEn), draft)
        : await updatePeopleGroup(selectedId, draft);
      await Promise.all([load(result.group.id), onChanged()]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus() {
    if (!selected) return;
    const nextStatus = selected.status === "active" ? "archived" : "active";
    if (
      nextStatus === "archived" &&
      !window.confirm(
        locale === "zh"
          ? "归档后，该分组将不再出现在项目成员筛选中。继续吗？"
          : "Archived groups no longer appear in program filters. Continue?",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await setPeopleGroupStatus(selected.id, nextStatus);
      await Promise.all([load(selected.id), onChanged()]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={embedded ? "stack people-groups-panel" : "card stack"}>
      <div className="row-between mobile-stack">
        <div>
          <h2>{locale === "zh" ? "人员分组" : "People groups"}</h2>
          <p className="muted">
            {locale === "zh"
              ? "按学院组建固定小组，也可以把不同学院的学生组合到同一个跨学科组。"
              : "Create department groups or mix people from different schools in an interdisciplinary group."}
          </p>
        </div>
        {canManage ? (
          <button className="button button-secondary" onClick={startCreate} type="button">
            {locale === "zh" ? "新建分组" : "New group"}
          </button>
        ) : null}
      </div>
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      {loading && !groups.length ? (
        <p className="muted">{locale === "zh" ? "正在加载分组…" : "Loading groups…"}</p>
      ) : (
        <div className="people-groups-layout">
          <div className="section-picker people-groups-list">
            {groups.map((group) => (
              <button
                className={!creating && group.id === selectedId ? "active" : ""}
                key={group.id}
                onClick={() => select(group)}
                type="button"
              >
                <span>{locale === "zh" ? group.nameZh : group.nameEn}</span>
                <StatusPill tone={group.status === "active" ? "green" : "neutral"}>
                  {group.memberIds.length}
                </StatusPill>
              </button>
            ))}
          </div>
          {canManage ? (
            <div className="form-grid form-fieldset">
              <label>
                {locale === "zh" ? "中文名称" : "Chinese name"}
                <input
                  maxLength={240}
                  onChange={(event) => change("nameZh", event.target.value)}
                  value={draft.nameZh}
                />
              </label>
              <label>
                {locale === "zh" ? "英文名称" : "English name"}
                <input
                  maxLength={240}
                  onChange={(event) => change("nameEn", event.target.value)}
                  value={draft.nameEn}
                />
              </label>
              <label>
                {locale === "zh" ? "中文说明（可选）" : "Chinese description"}
                <textarea
                  maxLength={4000}
                  onChange={(event) => change("descriptionZh", event.target.value)}
                  value={draft.descriptionZh}
                />
              </label>
              <label>
                {locale === "zh" ? "英文说明（可选）" : "English description"}
                <textarea
                  maxLength={4000}
                  onChange={(event) => change("descriptionEn", event.target.value)}
                  value={draft.descriptionEn}
                />
              </label>
              <div className="field field-full">
                <span>{locale === "zh" ? "分组成员（可多选）" : "Group members"}</span>
                <MultiSelectDropdown
                  locale={locale}
                  onChange={(values) => change("userIds", values)}
                  options={activePeople.map((person) => ({
                    value: person.id,
                    label: person.name,
                    description: [primaryDepartment(person.affiliations), person.email]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  placeholder={locale === "zh" ? "选择一人或多人…" : "Select one or more…"}
                  values={draft.userIds}
                />
              </div>
              <div className="field-full row-between mobile-stack">
                <div className="caption">
                  {creating
                    ? locale === "zh"
                      ? "保存时会自动生成内部标识。"
                      : "An internal key is generated when saved."
                    : `${locale === "zh" ? "内部标识" : "Internal key"}: ${selected?.key ?? ""}`}
                </div>
                <div className="row">
                  {selected ? (
                    <button
                      className="button button-ghost"
                      disabled={saving}
                      onClick={() => void changeStatus()}
                      type="button"
                    >
                      {selected.status === "active"
                        ? locale === "zh"
                          ? "归档分组"
                          : "Archive"
                        : locale === "zh"
                          ? "恢复分组"
                          : "Restore"}
                    </button>
                  ) : null}
                  <button
                    className="button"
                    disabled={saving || !draft.nameEn.trim() || !draft.nameZh.trim()}
                    onClick={() => void save()}
                    type="button"
                  >
                    {saving
                      ? locale === "zh"
                        ? "正在保存…"
                        : "Saving…"
                      : locale === "zh"
                        ? "保存分组"
                        : "Save group"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="muted">
              {locale === "zh" ? "你可以查看分组，但没有编辑权限。" : "You can view groups but cannot edit them."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
