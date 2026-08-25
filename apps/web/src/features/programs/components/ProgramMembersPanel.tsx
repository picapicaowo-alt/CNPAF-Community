"use client";

import { useMemo, useState } from "react";
import { StatusPill } from "@/components/ui";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { primaryDepartment } from "@/features/people-groups/model";
import type {
  MembershipRole,
  PersonChoice,
  ProgramMembership,
} from "../types";

export function ProgramMembersPanel({
  canManage,
  locale,
  memberships,
  people,
  roles,
  saving,
  onAdd,
  onRemove,
}: {
  canManage: boolean;
  locale: "zh" | "en";
  memberships: ProgramMembership[];
  people: PersonChoice[];
  roles: MembershipRole[];
  saving: boolean;
  onAdd: (userIds: string[], roleKey: string) => Promise<void>;
  onRemove: (membershipId: string) => Promise<void>;
}) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? "");
  const [groupId, setGroupId] = useState("");
  const memberIds = useMemo(
    () =>
      new Set(
        memberships
          .filter((membership) => membership.status === "active")
          .map((membership) => membership.userId),
      ),
    [memberships],
  );
  const availablePeople = people.filter(
    (person) => person.status === "active" && !memberIds.has(person.id),
  );
  const groups = useMemo(() => {
    const byId = new Map<
      string,
      PersonChoice["groups"][number]
    >();
    for (const person of people) {
      for (const group of person.groups ?? []) {
        if (group.status === "active") byId.set(group.id, group);
      }
    }
    return [...byId.values()].sort((left, right) =>
      (locale === "zh" ? left.nameZh : left.nameEn).localeCompare(
        locale === "zh" ? right.nameZh : right.nameEn,
      ),
    );
  }, [locale, people]);
  const filteredPeople = groupId
    ? availablePeople.filter((person) =>
        person.groups?.some((group) => group.id === groupId),
      )
    : availablePeople;
  const activeMemberships = memberships.filter(
    (membership) => membership.status === "active",
  );
  const roleLabels = new Map(
    roles.map((role) => [
      role.key,
      locale === "zh" ? role.labelZh : role.labelEn,
    ]),
  );

  async function add() {
    const selectedRole = roleKey || roles[0]?.key || "";
    if (!userIds.length || !selectedRole) return;
    await onAdd(userIds, selectedRole);
    setUserIds([]);
  }

  return (
    <section className="card stack">
      <div className="row-between">
        <h2>{locale === "zh" ? "项目成员" : "Program members"}</h2>
        <StatusPill tone="blue">{activeMemberships.length}</StatusPill>
      </div>
      {canManage ? (
        <div className="form-grid">
          <label>
            {locale === "zh" ? "按分组筛选" : "Filter by group"}
            <select
              onChange={(event) => setGroupId(event.target.value)}
              value={groupId}
            >
              <option value="">{locale === "zh" ? "全部人员" : "All people"}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {locale === "zh" ? group.nameZh : group.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label>
            {locale === "zh" ? "项目内角色" : "Program role"}
            <select
              onChange={(event) => setRoleKey(event.target.value)}
              value={roleKey || roles[0]?.key || ""}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.key}>
                  {locale === "zh" ? role.labelZh : role.labelEn}
                </option>
              ))}
            </select>
          </label>
          <div className="field field-full">
            <span>{locale === "zh" ? "选择人员（可多选）" : "Choose people"}</span>
            <MultiSelectDropdown
              disabled={
                !availablePeople.length ||
                Boolean(groupId && !filteredPeople.length && !userIds.length)
              }
              locale={locale}
              onChange={setUserIds}
              options={availablePeople.map((person) => ({
                value: person.id,
                label: person.name,
                description: [
                  primaryDepartment(person.affiliations ?? []),
                  (person.groups ?? [])
                    .filter((group) => group.status === "active")
                    .map((group) => (locale === "zh" ? group.nameZh : group.nameEn))
                    .join(" / "),
                  person.email,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
              placeholder={
                filteredPeople.length
                  ? locale === "zh"
                    ? "请选择一人或多人…"
                    : "Select one or more…"
                  : groupId
                    ? locale === "zh"
                      ? "该分组没有可添加的人员"
                      : "No available people in this group"
                  : locale === "zh"
                    ? "没有可添加的人员"
                    : "No people available"
              }
              values={userIds}
              visibleValues={
                groupId ? filteredPeople.map((person) => person.id) : undefined
              }
            />
            {groupId ? (
              <span className="caption">
                {locale === "zh"
                  ? `当前分组有 ${filteredPeople.length} 名可添加人员`
                  : `${filteredPeople.length} available in this group`}
              </span>
            ) : null}
          </div>
          <div className="field-full">
            <button
              className="button"
              disabled={saving || !userIds.length || !(roleKey || roles[0]?.key)}
              onClick={() => void add()}
              type="button"
            >
              {saving
                ? locale === "zh"
                  ? "正在添加…"
                  : "Adding…"
                : locale === "zh"
                  ? userIds.length
                    ? `添加 ${userIds.length} 名成员`
                    : "添加成员"
                  : userIds.length
                    ? `Add ${userIds.length} members`
                    : "Add members"}
            </button>
          </div>
        </div>
      ) : null}
      {activeMemberships.length ? (
        <div className="choice-list">
          {activeMemberships.map((membership) => (
            <div className="choice row-between" key={membership.id}>
              <span>
                <strong>{membership.name}</strong>
                <span className="caption" style={{ display: "block" }}>
                  {membership.email}
                </span>
              </span>
              <span className="row">
                <StatusPill>
                  {roleLabels.get(membership.membershipRoleKey) ??
                    membership.membershipRoleKey}
                </StatusPill>
                {canManage ? (
                  <button
                    className="button button-ghost button-small"
                    disabled={saving}
                    onClick={() => void onRemove(membership.id)}
                    type="button"
                  >
                    {locale === "zh" ? "移除" : "Remove"}
                  </button>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          {locale === "zh"
            ? "该项目尚无有效成员。添加成员后才能分配任务。"
            : "This program has no active members. Add members before assigning tasks."}
        </p>
      )}
    </section>
  );
}
