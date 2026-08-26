"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { MultiSelectDropdown } from "@/components/MultiSelectDropdown";
import { useI18n } from "@/components/LocaleProvider";
import {
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Role = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  status: string;
  organizationId?: string | null;
};
type Scope = {
  id?: string;
  scopeType: string;
  scopeId?: string | null;
  scopeKey?: string | null;
  effect: "allow" | "deny";
  permissionKey?: string | null;
  roleAssignmentId?: string | null;
  reason?: string | null;
};
type Override = {
  id?: string;
  permissionId: string;
  permissionKey: string;
  effect: "allow" | "deny";
  scopeType?: string | null;
  scopeId?: string | null;
  scopeKey?: string | null;
  reason?: string | null;
  expiresAt?: string | null;
};
type Affiliation = {
  id: string;
  organizationId?: string | null;
  programId?: string | null;
  affiliationTypeKey: string;
  institutionName: string;
  institutionTypeKey?: string | null;
  departmentName?: string | null;
  title?: string | null;
  isPrimary: boolean;
  status: string;
};
type Membership = {
  id: string;
  programId: string;
  programNameEn: string;
  programNameZh: string;
  membershipRoleKey: string;
  status: string;
};
type Access = {
  user: {
    id: string;
    name: string;
    email: string;
    organizationId: string | null;
    locale: string;
    status: string;
    mustChangePassword: boolean;
    passwordChangedAt?: string | null;
  };
  roles: Array<{
    assignmentId: string;
    id: string;
    key: string;
    nameEn: string;
    nameZh: string;
    organizationId?: string | null;
  }>;
  scopeAssignments: Scope[];
  overrides: Override[];
  affiliations: Affiliation[];
  programMemberships: Membership[];
};
type Group = {
  id: string;
  nameEn: string;
  nameZh: string;
  status: string;
  memberIds: string[];
  key: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
};
type Program = { id: string; nameEn: string; nameZh: string; status: string };
type RegistryItem = {
  id: string;
  key: string;
  labelEn: string;
  labelZh: string;
  status: string;
};

const blankAffiliation = {
  affiliationTypeKey: "",
  institutionName: "",
  departmentName: "",
  title: "",
  isPrimary: true,
};
const SCOPE_LABELS: Record<string, { zh: string; en: string }> = {
  global: { zh: "全局", en: "Global" },
  organization: { zh: "组织", en: "Organization" },
  program: { zh: "项目", en: "Program" },
  site: { zh: "站点", en: "Site" },
  location: { zh: "地点", en: "Location" },
  service: { zh: "服务", en: "Service" },
  template: { zh: "模板", en: "Template" },
  form: { zh: "表单", en: "Form" },
  data_classification: { zh: "数据分类", en: "Data classification" },
  research_use: { zh: "研究用途", en: "Research use" },
};

export default function PersonManagementPage() {
  const { locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [access, setAccess] = useState<Access | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [affiliationTypes, setAffiliationTypes] = useState<RegistryItem[]>([]);
  const [membershipRoles, setMembershipRoles] = useState<RegistryItem[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [scopeRows, setScopeRows] = useState<Scope[]>([]);
  const [accessReason, setAccessReason] = useState("");
  const [profile, setProfile] = useState({ name: "", locale: "zh" });
  const [affiliation, setAffiliation] = useState(blankAffiliation);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removalReason, setRemovalReason] = useState("");
  const [resetReason, setResetReason] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{ permissions: string[] }>("/api/v1/auth/me");
      const actorPermissions = me.permissions ?? [];
      const [
        userAccess,
        roleResult,
        groupResult,
        programResult,
        affiliationRegistry,
        membershipRegistry,
      ] = await Promise.all([
        apiFetch<Access>(`/api/v1/admin/users/${id}`),
        actorPermissions.includes("roles.view")
          ? apiFetch<{ roles: Role[] }>("/api/v1/roles")
          : Promise.resolve({ roles: [] }),
        apiFetch<{ groups: Group[] }>("/api/v1/people-groups"),
        actorPermissions.includes("programs.view")
          ? apiFetch<{ programs: Program[] }>("/api/v1/programs")
          : Promise.resolve({ programs: [] }),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/affiliation_type?status=active",
        ),
        apiFetch<{ items: RegistryItem[] }>(
          "/api/v1/config/registries/program_membership_role?status=active",
        ),
      ]);
      setPermissions(actorPermissions);
      setAccess(userAccess);
      setRoles(
        (roleResult.roles ?? []).filter((role) => role.status === "active"),
      );
      setGroups(groupResult.groups ?? []);
      setPrograms(
        (programResult.programs ?? []).filter(
          (program) => program.status === "active",
        ),
      );
      setAffiliationTypes(affiliationRegistry.items ?? []);
      setMembershipRoles(membershipRegistry.items ?? []);
      setSelectedRoleIds(userAccess.roles.map((role) => role.id));
      setSelectedGroupIds(
        (groupResult.groups ?? [])
          .filter(
            (group) =>
              group.status === "active" && group.memberIds.includes(id),
          )
          .map((group) => group.id),
      );
      setSelectedProgramIds(
        userAccess.programMemberships
          .filter((item) => item.status === "active")
          .map((item) => item.programId),
      );
      setScopeRows(userAccess.scopeAssignments.map((scope) => ({ ...scope })));
      setProfile({
        name: userAccess.user.name,
        locale: userAccess.user.locale,
      });
      setAffiliation((current) => ({
        ...current,
        affiliationTypeKey: affiliationRegistry.items?.[0]?.key ?? "",
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions = useMemo(
    () =>
      roles.map((role) => ({
        value: role.id,
        label: locale === "zh" ? role.nameZh : role.nameEn,
        description: role.key,
      })),
    [locale, roles],
  );
  const groupOptions = useMemo(
    () =>
      groups
        .filter((group) => group.status === "active")
        .map((group) => ({
          value: group.id,
          label: locale === "zh" ? group.nameZh : group.nameEn,
        })),
    [groups, locale],
  );
  const programOptions = useMemo(
    () =>
      programs.map((program) => ({
        value: program.id,
        label: locale === "zh" ? program.nameZh : program.nameEn,
      })),
    [locale, programs],
  );

  function success(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving("profile");
    setError("");
    try {
      await apiFetch(`/api/v1/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(profile),
      });
      success(locale === "zh" ? "基本资料已保存。" : "Profile saved.");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function saveAccess() {
    if (!access || !selectedRoleIds.length || !accessReason.trim()) return;
    setSaving("access");
    setError("");
    try {
      await apiFetch(`/api/v1/admin/users/${id}/access`, {
        method: "PUT",
        body: JSON.stringify({
          roleAssignments: selectedRoleIds.map((roleId) => ({
            roleId,
            organizationId: access.user.organizationId,
          })),
          scopeAssignments: scopeRows.map((scope) => ({
            scopeType: scope.scopeType,
            scopeId: scope.scopeId ?? null,
            scopeKey: scope.scopeKey ?? null,
            effect: scope.effect,
            permissionKey: scope.permissionKey ?? null,
            roleAssignmentId: scope.roleAssignmentId ?? null,
            reason: scope.reason || accessReason.trim(),
          })),
          overrides: access.overrides.map((override) => ({
            permissionId: override.permissionId,
            permissionKey: override.permissionKey,
            effect: override.effect,
            scopeType: override.scopeType ?? null,
            scopeId: override.scopeId ?? null,
            scopeKey: override.scopeKey ?? null,
            reason: override.reason ?? accessReason.trim(),
            expiresAt: override.expiresAt ?? null,
          })),
          reason: accessReason.trim(),
        }),
      });
      setAccessReason("");
      success(
        locale === "zh"
          ? "角色与访问范围已更新；该用户的旧会话已退出。"
          : "Roles and access scope updated; old sessions were revoked.",
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function saveMemberships() {
    if (!access) return;
    setSaving("membership");
    setError("");
    try {
      if (permissions.includes("people.manage_groups")) {
        const currentGroups = new Set(
          groups
            .filter(
              (group) =>
                group.status === "active" && group.memberIds.includes(id),
            )
            .map((group) => group.id),
        );
        await Promise.all(
          groups
            .filter(
              (group) =>
                group.status === "active" &&
                currentGroups.has(group.id) !==
                  selectedGroupIds.includes(group.id),
            )
            .map((group) =>
              apiFetch(`/api/v1/people-groups/${group.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  userIds: selectedGroupIds.includes(group.id)
                    ? [...group.memberIds, id]
                    : group.memberIds.filter((memberId) => memberId !== id),
                }),
              }),
            ),
        );
      }
      const activeMemberships = access.programMemberships.filter(
        (item) => item.status === "active",
      );
      const currentProgramIds = new Set(
        activeMemberships.map((item) => item.programId),
      );
      const membershipRoleKey = membershipRoles[0]?.key;
      if (permissions.includes("programs.manage_membership")) {
        if (
          !membershipRoleKey &&
          selectedProgramIds.some(
            (programId) => !currentProgramIds.has(programId),
          )
        )
          throw new Error(
            locale === "zh"
              ? "没有可用的项目成员角色。"
              : "No active program membership role is available.",
          );
        await Promise.all([
          ...activeMemberships
            .filter((item) => !selectedProgramIds.includes(item.programId))
            .map((item) =>
              apiFetch(
                `/api/v1/programs/${item.programId}/memberships/${item.id}`,
                { method: "DELETE" },
              ),
            ),
          ...selectedProgramIds
            .filter((programId) => !currentProgramIds.has(programId))
            .map((programId) =>
              apiFetch(`/api/v1/programs/${programId}/memberships`, {
                method: "POST",
                body: JSON.stringify({ userId: id, membershipRoleKey }),
              }),
            ),
        ]);
      }
      success(
        locale === "zh"
          ? "项目与分组归属已更新。"
          : "Program and group membership updated.",
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function addAffiliation(event: React.FormEvent) {
    event.preventDefault();
    if (
      !access ||
      !affiliation.affiliationTypeKey ||
      !affiliation.institutionName.trim()
    )
      return;
    setSaving("affiliation");
    setError("");
    try {
      await apiFetch(`/api/v1/admin/users/${id}/affiliations`, {
        method: "POST",
        body: JSON.stringify({
          organizationId: access.user.organizationId,
          affiliationTypeKey: affiliation.affiliationTypeKey,
          institutionName: affiliation.institutionName.trim(),
          institutionTypeKey: null,
          departmentName: affiliation.departmentName.trim() || null,
          title: affiliation.title.trim() || null,
          metadata: {},
          isPrimary: affiliation.isPrimary,
        }),
      });
      setAffiliation({
        ...blankAffiliation,
        affiliationTypeKey: affiliationTypes[0]?.key ?? "",
      });
      success(
        locale === "zh" ? "学院 / 机构归属已添加。" : "Affiliation added.",
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function removeAffiliation(affiliationId: string) {
    if (
      !window.confirm(
        locale === "zh"
          ? "移除这条学院 / 机构归属？历史记录仍会保留。"
          : "Remove this affiliation? Its history will be retained.",
      )
    )
      return;
    setSaving(`affiliation-${affiliationId}`);
    setError("");
    try {
      await apiFetch(
        `/api/v1/admin/users/${id}/affiliations/${affiliationId}`,
        { method: "DELETE" },
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function setAccountStatus(active: boolean) {
    if (
      !window.confirm(
        active
          ? locale === "zh"
            ? "恢复这个账号？"
            : "Restore this account?"
          : locale === "zh"
            ? "归档后该人员将无法登录，所有会话也会退出。继续吗？"
            : "Archiving blocks sign-in and revokes all sessions. Continue?",
      )
    )
      return;
    setSaving("status");
    setError("");
    try {
      await apiFetch(
        `/api/v1/admin/users/${id}/${active ? "reactivate" : "deactivate"}`,
        { method: "POST" },
      );
      success(
        active
          ? locale === "zh"
            ? "账号已恢复。"
            : "Account restored."
          : locale === "zh"
            ? "账号已归档。"
            : "Account archived.",
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  async function removeIdentity() {
    if (!removalReason.trim()) return;
    if (
      !window.confirm(
        locale === "zh"
          ? "这是不可逆的身份移除：登录邮箱、姓名和所有访问授权都会被清除。继续吗？"
          : "This irreversibly removes the login identity, name, and all access grants. Continue?",
      )
    )
      return;
    setSaving("remove");
    setError("");
    try {
      await apiFetch(`/api/v1/admin/users/${id}`, {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: "REMOVE",
          reason: removalReason.trim(),
        }),
      });
      router.replace("/people");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving("");
    }
  }

  async function resetPassword() {
    if (!resetReason.trim()) return;
    setSaving("password");
    setError("");
    setTemporaryPassword("");
    try {
      const result = await apiFetch<{ temporaryPassword: string }>(
        `/api/v1/admin/users/${id}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({ reason: resetReason.trim() }),
        },
      );
      setTemporaryPassword(result.temporaryPassword);
      setResetReason("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  if (loading && !access) return <LoadingState rows={7} />;
  if (error && !access) return <ErrorState message={error} retry={load} />;
  if (!access) return null;

  return (
    <div className="stack person-management-page">
      <PageHeader
        eyebrow={locale === "zh" ? "人员与账号" : "People & accounts"}
        title={access.user.name}
        description={access.user.email}
        actions={
          <Link className="button button-secondary" href="/people">
            <AppIcon name="back" />
            {locale === "zh" ? "返回人员" : "Back to people"}
          </Link>
        }
      />
      {error ? <div className="feedback feedback-error">{error}</div> : null}
      {notice ? (
        <div className="feedback feedback-success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="person-management-grid">
        <main className="stack">
          <form className="card stack" onSubmit={saveProfile}>
            <div>
              <h2>{locale === "zh" ? "基本资料" : "Profile"}</h2>
              <p className="muted">
                {locale === "zh"
                  ? "修改显示姓名与该账号默认使用的界面语言。"
                  : "Update the display name and default interface language."}
              </p>
            </div>
            <div className="form-grid">
              <label>
                {locale === "zh" ? "姓名" : "Name"}
                <input
                  value={profile.name}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {locale === "zh" ? "界面语言" : "Interface language"}
                <select
                  value={profile.locale}
                  onChange={(event) =>
                    setProfile((current) => ({
                      ...current,
                      locale: event.target.value,
                    }))
                  }
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            {permissions.some((permission) =>
              ["people.edit_profile", "users.edit"].includes(permission),
            ) ? (
              <button
                className="button button-small align-self-end"
                disabled={saving === "profile" || !profile.name.trim()}
                type="submit"
              >
                {locale === "zh" ? "保存资料" : "Save profile"}
              </button>
            ) : null}
          </form>

          <section className="card stack">
            <div>
              <h2>
                {locale === "zh" ? "角色与访问范围" : "Roles & access scope"}
              </h2>
              <p className="muted">
                {locale === "zh"
                  ? "可以同时分配多个角色；范围用于把权限限制到指定项目、地点或数据类别。"
                  : "Assign multiple roles and constrain access to a program, site, or data class."}
              </p>
            </div>
            <div className="field">
              <span>{locale === "zh" ? "角色（可多选）" : "Roles"}</span>
              <MultiSelectDropdown
                locale={locale}
                options={roleOptions}
                values={selectedRoleIds}
                onChange={setSelectedRoleIds}
                placeholder={
                  locale === "zh"
                    ? "选择一个或多个角色…"
                    : "Select one or more roles…"
                }
              />
            </div>
            <details className="inline-disclosure">
              <summary>
                {locale === "zh"
                  ? `高级访问范围（${scopeRows.length}）`
                  : `Advanced access scopes (${scopeRows.length})`}
              </summary>
              <div className="stack person-scope-editor">
                {scopeRows.map((scope, index) => (
                  <div className="person-scope-row" key={scope.id ?? index}>
                    <select
                      value={scope.scopeType}
                      onChange={(event) =>
                        setScopeRows((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? { ...row, scopeType: event.target.value }
                              : row,
                          ),
                        )
                      }
                    >
                      {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label[locale]}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={
                        locale === "zh" ? "范围 ID 或键" : "Scope ID or key"
                      }
                      placeholder={
                        locale === "zh"
                          ? "范围 ID 或键（global 可留空）"
                          : "Scope ID or key (blank for global)"
                      }
                      value={scope.scopeId ?? scope.scopeKey ?? ""}
                      onChange={(event) =>
                        setScopeRows((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...row,
                                  scopeId: /^[0-9a-f-]{36}$/i.test(
                                    event.target.value,
                                  )
                                    ? event.target.value
                                    : null,
                                  scopeKey:
                                    /^[0-9a-f-]{36}$/i.test(
                                      event.target.value,
                                    ) || !event.target.value
                                      ? null
                                      : event.target.value,
                                }
                              : row,
                          ),
                        )
                      }
                    />
                    <select
                      value={scope.effect}
                      onChange={(event) =>
                        setScopeRows((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? {
                                  ...row,
                                  effect: event.target.value as
                                    "allow" | "deny",
                                }
                              : row,
                          ),
                        )
                      }
                    >
                      <option value="allow">
                        {locale === "zh" ? "允许" : "Allow"}
                      </option>
                      <option value="deny">
                        {locale === "zh" ? "拒绝" : "Deny"}
                      </option>
                    </select>
                    <button
                      className="icon-button"
                      aria-label={locale === "zh" ? "删除范围" : "Remove scope"}
                      onClick={() =>
                        setScopeRows((current) =>
                          current.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                      type="button"
                    >
                      <AppIcon name="trash" />
                    </button>
                  </div>
                ))}
                <button
                  className="button button-secondary button-small align-self-start"
                  onClick={() =>
                    setScopeRows((current) => [
                      ...current,
                      { scopeType: "global", effect: "allow" },
                    ])
                  }
                  type="button"
                >
                  <AppIcon name="plus" />
                  {locale === "zh" ? "添加范围" : "Add scope"}
                </button>
              </div>
            </details>
            <label>
              {locale === "zh" ? "变更原因" : "Reason for change"}
              <textarea
                rows={2}
                value={accessReason}
                onChange={(event) => setAccessReason(event.target.value)}
                placeholder={
                  locale === "zh"
                    ? "例如：转入秋季活动项目并担任运营审核"
                    : "For example: moved to the fall program as an operations reviewer"
                }
              />
              <span className="caption">
                {locale === "zh"
                  ? "角色或范围变更会退出该用户的现有会话，并写入审计日志。"
                  : "Role or scope changes revoke existing sessions and are audit logged."}
              </span>
            </label>
            {permissions.includes("permissions.assign") ? (
              <button
                className="button button-small align-self-end"
                disabled={
                  saving === "access" ||
                  !selectedRoleIds.length ||
                  !accessReason.trim()
                }
                onClick={() => void saveAccess()}
                type="button"
              >
                {locale === "zh" ? "保存角色与范围" : "Save roles & scope"}
              </button>
            ) : null}
          </section>

          <section className="card stack">
            <div>
              <h2>
                {locale === "zh" ? "项目与人员分组" : "Programs & groups"}
              </h2>
              <p className="muted">
                {locale === "zh"
                  ? "项目决定业务工作范围；分组用于跨学院协作和人员筛选。"
                  : "Programs define operational scope; groups support cross-school teams and filtering."}
              </p>
            </div>
            <div className="form-grid">
              <div className="field">
                <span>{locale === "zh" ? "项目" : "Programs"}</span>
                <MultiSelectDropdown
                  locale={locale}
                  options={programOptions}
                  values={selectedProgramIds}
                  onChange={setSelectedProgramIds}
                  placeholder={
                    locale === "zh" ? "选择项目…" : "Select programs…"
                  }
                />
              </div>
              <div className="field">
                <span>{locale === "zh" ? "人员分组" : "People groups"}</span>
                <MultiSelectDropdown
                  locale={locale}
                  options={groupOptions}
                  values={selectedGroupIds}
                  onChange={setSelectedGroupIds}
                  placeholder={locale === "zh" ? "选择分组…" : "Select groups…"}
                />
              </div>
            </div>
            {permissions.includes("programs.manage_membership") ||
            permissions.includes("people.manage_groups") ? (
              <button
                className="button button-small align-self-end"
                disabled={saving === "membership"}
                onClick={() => void saveMemberships()}
                type="button"
              >
                {locale === "zh" ? "保存项目与分组" : "Save programs & groups"}
              </button>
            ) : null}
          </section>

          <section className="card stack">
            <div>
              <h2>
                {locale === "zh"
                  ? "学院 / 机构归属"
                  : "School / institution affiliations"}
              </h2>
              <p className="muted">
                {locale === "zh"
                  ? "历史归属会保留；重新分配时先添加新归属，再移除旧归属。"
                  : "Affiliation history is retained. Add the new affiliation, then remove the old one."}
              </p>
            </div>
            <div className="affiliation-list">
              {access.affiliations
                .filter((item) => item.status === "active")
                .map((item) => (
                  <div className="affiliation-item" key={item.id}>
                    <span>
                      <strong>{item.institutionName}</strong>
                      <small>
                        {[item.departmentName, item.title]
                          .filter(Boolean)
                          .join(" · ") || item.affiliationTypeKey}
                      </small>
                    </span>
                    {item.isPrimary ? (
                      <StatusPill tone="blue">
                        {locale === "zh" ? "主要" : "Primary"}
                      </StatusPill>
                    ) : null}
                    {permissions.includes("people.edit_affiliation") ? (
                      <button
                        className="button button-ghost button-small"
                        disabled={saving === `affiliation-${item.id}`}
                        onClick={() => void removeAffiliation(item.id)}
                        type="button"
                      >
                        {locale === "zh" ? "移除" : "Remove"}
                      </button>
                    ) : null}
                  </div>
                ))}
            </div>
            {permissions.includes("people.edit_affiliation") ? (
              <form
                className="form-grid form-fieldset"
                onSubmit={addAffiliation}
              >
                <label>
                  {locale === "zh" ? "归属类型" : "Affiliation type"}
                  <select
                    value={affiliation.affiliationTypeKey}
                    onChange={(event) =>
                      setAffiliation((current) => ({
                        ...current,
                        affiliationTypeKey: event.target.value,
                      }))
                    }
                  >
                    {affiliationTypes.map((item) => (
                      <option key={item.id} value={item.key}>
                        {locale === "zh" ? item.labelZh : item.labelEn}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {locale === "zh" ? "学校 / 机构" : "School / institution"}
                  <input
                    required
                    value={affiliation.institutionName}
                    onChange={(event) =>
                      setAffiliation((current) => ({
                        ...current,
                        institutionName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {locale === "zh" ? "学院 / 系" : "School / department"}
                  <input
                    value={affiliation.departmentName}
                    onChange={(event) =>
                      setAffiliation((current) => ({
                        ...current,
                        departmentName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {locale === "zh" ? "职务 / 身份" : "Title"}
                  <input
                    value={affiliation.title}
                    onChange={(event) =>
                      setAffiliation((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    checked={affiliation.isPrimary}
                    onChange={(event) =>
                      setAffiliation((current) => ({
                        ...current,
                        isPrimary: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  {locale === "zh" ? "设为主要归属" : "Set as primary"}
                </label>
                <button
                  className="button button-secondary button-small align-self-end"
                  disabled={
                    saving === "affiliation" ||
                    !affiliation.institutionName.trim()
                  }
                  type="submit"
                >
                  {locale === "zh" ? "添加归属" : "Add affiliation"}
                </button>
              </form>
            ) : null}
          </section>
        </main>

        <aside className="stack person-management-aside">
          <section className="card stack compact-account-card">
            <div className="row-between">
              <h2>{locale === "zh" ? "账号状态" : "Account status"}</h2>
              <StatusPill
                tone={access.user.status === "active" ? "green" : "neutral"}
              >
                {access.user.status === "active"
                  ? locale === "zh"
                    ? "启用"
                    : "Active"
                  : locale === "zh"
                    ? "已归档"
                    : "Archived"}
              </StatusPill>
            </div>
            <p className="muted">
              {locale === "zh"
                ? "志愿者离开或账号暂时不用时请归档；审计与业务历史会保留。"
                : "Archive people who leave or no longer need access. Audit and business history is retained."}
            </p>
            {permissions.includes("users.deactivate") ? (
              <button
                className={
                  access.user.status === "active"
                    ? "button button-danger"
                    : "button button-secondary"
                }
                disabled={saving === "status"}
                onClick={() =>
                  void setAccountStatus(access.user.status !== "active")
                }
                type="button"
              >
                {access.user.status === "active"
                  ? locale === "zh"
                    ? "归档账号"
                    : "Archive account"
                  : locale === "zh"
                    ? "恢复账号"
                    : "Restore account"}
              </button>
            ) : null}
          </section>
          <section className="card stack compact-account-card">
            <h2>{locale === "zh" ? "密码安全" : "Password security"}</h2>
            <div className="password-status-centered">
              <StatusPill
                tone={access.user.mustChangePassword ? "amber" : "green"}
              >
                {access.user.mustChangePassword
                  ? locale === "zh"
                    ? "临时密码待修改"
                    : "Temporary password"
                  : locale === "zh"
                    ? "用户已设置"
                    : "User-set password"}
              </StatusPill>
              <span className="caption">
                {access.user.passwordChangedAt
                  ? new Date(access.user.passwordChangedAt).toLocaleDateString(
                      locale === "zh" ? "zh-CN" : "en-US",
                    )
                  : locale === "zh"
                    ? "尚未修改"
                    : "Not changed"}
              </span>
            </div>
            {temporaryPassword ? (
              <div className="feedback feedback-success temporary-password-result">
                <strong>
                  {locale === "zh"
                    ? "一次性临时密码"
                    : "One-time temporary password"}
                </strong>
                <code>{temporaryPassword}</code>
                <button
                  className="button button-secondary button-small"
                  onClick={() =>
                    void navigator.clipboard.writeText(temporaryPassword)
                  }
                  type="button"
                >
                  {locale === "zh" ? "复制" : "Copy"}
                </button>
              </div>
            ) : null}
            {permissions.includes("people.reset_password") ? (
              <details className="inline-disclosure">
                <summary>
                  {locale === "zh" ? "重置密码" : "Reset password"}
                </summary>
                <div className="stack person-scope-editor">
                  <label>
                    {locale === "zh" ? "重置原因" : "Reason for reset"}
                    <textarea
                      rows={2}
                      value={resetReason}
                      onChange={(event) => setResetReason(event.target.value)}
                    />
                  </label>
                  <button
                    className="button button-secondary button-small"
                    disabled={saving === "password" || !resetReason.trim()}
                    onClick={() => void resetPassword()}
                    type="button"
                  >
                    {locale === "zh"
                      ? "生成临时密码"
                      : "Generate temporary password"}
                  </button>
                </div>
              </details>
            ) : null}
          </section>
          {access.user.status === "inactive" &&
          permissions.includes("users.deactivate") &&
          permissions.includes("people.edit_profile") ? (
            <section className="card stack compact-account-card danger-zone-card">
              <div>
                <h2>
                  {locale === "zh" ? "移除误建账号" : "Remove mistaken account"}
                </h2>
                <p className="muted">
                  {locale === "zh"
                    ? "仅用于创建错误且不会再使用的账号。系统会清除身份信息和授权，但保留匿名化审计与业务历史。"
                    : "Only for an account created by mistake. Identity and access are cleared while anonymized audit and business history is retained."}
                </p>
              </div>
              <label>
                {locale === "zh" ? "移除原因" : "Reason for removal"}
                <textarea
                  rows={2}
                  value={removalReason}
                  onChange={(event) => setRemovalReason(event.target.value)}
                />
              </label>
              <button
                className="button button-danger"
                disabled={saving === "remove" || !removalReason.trim()}
                onClick={() => void removeIdentity()}
                type="button"
              >
                {locale === "zh"
                  ? "永久移除身份"
                  : "Permanently remove identity"}
              </button>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
