"use client";

import Link from "next/link";
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
import { RolePermissionsPanel } from "@/features/access-management/RolePermissionsPanel";
import { InstitutionsPanel } from "@/features/institutions/components/InstitutionsPanel";
import { PeopleGroupsPanel } from "@/features/people-groups/components/PeopleGroupsPanel";
import { primaryDepartment } from "@/features/people-groups/model";
import { apiFetch, errorMessage } from "@/lib/api-client";

type User = {
  id: string;
  name: string;
  email: string;
  organizationId: string | null;
  status: string;
  locale: string;
  updatedAt: string;
  mustChangePassword: boolean;
  aiEnabled: boolean;
  passwordChangedAt: string | null;
  roleAssignments: Array<{
    roleKey: string;
    roleNameEn: string;
    roleNameZh: string;
    status: string;
  }>;
  programMemberships: Array<{ programNameEn: string; programNameZh: string }>;
  affiliations: Array<{
    institutionName: string;
    departmentName?: string | null;
    title?: string | null;
    status: string;
  }>;
  groups: Array<{
    id: string;
    key: string;
    nameEn: string;
    nameZh: string;
    status: string;
  }>;
};

export default function PeoplePage() {
  const { locale } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetReason, setResetReason] = useState("");
  const [resetting, setResetting] = useState(false);
  const [aiUpdating, setAiUpdating] = useState("");
  const [activeAdminTool, setActiveAdminTool] = useState<
    "groups" | "roles" | "institutions" | null
  >(null);
  const [resetCredential, setResetCredential] = useState<{
    name: string;
    email: string;
    temporaryPassword: string;
    emailQueued: boolean;
  } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, result] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ users: User[] }>("/api/v1/admin/users?limit=250"),
      ]);
      setPermissions(me.permissions ?? []);
      setUsers(result.users ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      users.filter(
        (user) =>
          (status === "all" || user.status === status) &&
          (!query.trim() ||
            [
              user.name,
              user.email,
              ...user.roleAssignments.flatMap((role) => [
                role.roleNameEn,
                role.roleNameZh,
              ]),
              ...user.programMemberships.flatMap((program) => [
                program.programNameEn,
                program.programNameZh,
              ]),
              ...user.affiliations.flatMap((affiliation) => [
                affiliation.institutionName,
                affiliation.departmentName,
                affiliation.title,
              ]),
              ...user.groups.flatMap((group) => [group.nameEn, group.nameZh]),
            ].some((value) =>
              value
                ?.toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
            )),
      ),
    [query, status, users],
  );

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!resetTarget || !resetReason.trim()) return;
    setResetting(true);
    setError("");
    try {
      const result = await apiFetch<{ temporaryPassword: string; emailQueued: boolean }>(
        `/api/v1/admin/users/${resetTarget.id}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({ reason: resetReason.trim() }),
        },
      );
      setResetCredential({
        name: resetTarget.name,
        email: resetTarget.email,
        temporaryPassword: result.temporaryPassword,
        emailQueued: result.emailQueued,
      });
      setResetTarget(null);
      setResetReason("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setResetting(false);
    }
  }
  async function toggleAiAccess(user: User) {
    const enabled = !user.aiEnabled;
    setAiUpdating(user.id);
    setError("");
    try {
      await apiFetch(`/api/v1/admin/users/${user.id}/ai-access`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled,
          reason:
            locale === "zh"
              ? "管理员在人员与账号页面更新 ChatGPT 使用权限"
              : "Administrator updated ChatGPT access from People & accounts",
        }),
      });
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, aiEnabled: enabled } : item,
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAiUpdating("");
    }
  }
  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "人员与账号" : "People & accounts"}
        description={
          locale === "zh"
            ? "查看账号、角色与项目范围；权限由后端策略统一执行。"
            : "View accounts, roles, and program scope; backend policy remains authoritative."
        }
        actions={
          permissions.includes("people.create_account") ? (
            <Link className="button" href="/people/new">
              <AppIcon name="plus" />
              {locale === "zh" ? "创建账号" : "Create account"}
            </Link>
          ) : undefined
        }
      />
      {resetCredential ? (
        <div
          className="feedback feedback-success reset-credential"
          role="status"
        >
          <span>
            <strong>
              {locale === "zh"
                ? `${resetCredential.name} 的一次性临时密码`
                : `One-time temporary password for ${resetCredential.name}`}
            </strong>
            <span>
              {locale === "zh"
                ? resetCredential.emailQueued
                  ? `重置链接邮件已发送给 ${resetCredential.email}。下方临时密码仅作为一次性备用。`
                  : `邮件未进入队列，请安全地把一次性临时密码交给 ${resetCredential.email}。`
                : resetCredential.emailQueued
                  ? `A reset-link email was queued for ${resetCredential.email}. The temporary password below is a one-time fallback.`
                  : `Email was not queued. Share the one-time temporary password securely with ${resetCredential.email}.`}
            </span>
          </span>
          <span className="reset-credential-value">
            <code>{resetCredential.temporaryPassword}</code>
            <button
              className="button button-secondary button-small"
              onClick={() =>
                void navigator.clipboard.writeText(
                  resetCredential.temporaryPassword,
                )
              }
              type="button"
            >
              {locale === "zh" ? "复制" : "Copy"}
            </button>
            <button
              aria-label={locale === "zh" ? "关闭" : "Close"}
              className="icon-button"
              onClick={() => setResetCredential(null)}
              type="button"
            >
              <AppIcon name="close" />
            </button>
          </span>
        </div>
      ) : null}
      {permissions.length && !error ? (
        <div className="people-admin-tools">
          <div className="people-admin-tool-row">
            <button
              aria-expanded={activeAdminTool === "groups"}
              className={`people-admin-toggle${activeAdminTool === "groups" ? " active" : ""}`}
              onClick={() => setActiveAdminTool((current) => current === "groups" ? null : "groups")}
              type="button"
            >
              <span>
                <strong>
                  {locale === "zh" ? "人员分组" : "People groups"}
                </strong>
                <small>
                  {locale === "zh"
                    ? "创建跨学院小组、调整成员或归档已结束的分组"
                    : "Create cross-school groups, update membership, or archive completed groups"}
                </small>
              </span>
              <span className="people-admin-toggle-action">
                {activeAdminTool === "groups" ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "展开" : "Expand")}
                <AppIcon name="arrow" />
              </span>
            </button>
          {permissions.includes("roles.view") ? (
              <button
                aria-expanded={activeAdminTool === "roles"}
                className={`people-admin-toggle${activeAdminTool === "roles" ? " active" : ""}`}
                onClick={() => setActiveAdminTool((current) => current === "roles" ? null : "roles")}
                type="button"
              >
                <span>
                  <strong>
                    {locale === "zh" ? "角色与权限" : "Roles & permissions"}
                  </strong>
                  <small>
                    {locale === "zh"
                      ? "配置运营审核员、志愿者等角色默认可使用的功能"
                      : "Configure the default capabilities for reviewers, volunteers, and other roles"}
                  </small>
                </span>
                <span className="people-admin-toggle-action">
                  {activeAdminTool === "roles" ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "展开" : "Expand")}
                  <AppIcon name="arrow" />
                </span>
              </button>
          ) : null}
            <button
              aria-expanded={activeAdminTool === "institutions"}
              className={`people-admin-toggle${activeAdminTool === "institutions" ? " active" : ""}`}
              onClick={() => setActiveAdminTool((current) => current === "institutions" ? null : "institutions")}
              type="button"
            >
              <span>
                <strong>{locale === "zh" ? "学校与机构" : "Schools & institutions"}</strong>
                <small>
                  {locale === "zh"
                    ? "维护人员归属可选的学校与机构统一目录"
                    : "Maintain the directory used by people affiliations"}
                </small>
              </span>
              <span className="people-admin-toggle-action">
                {activeAdminTool === "institutions" ? (locale === "zh" ? "收起" : "Collapse") : (locale === "zh" ? "展开" : "Expand")}
                <AppIcon name="arrow" />
              </span>
            </button>
          </div>
          {activeAdminTool ? (
            <div className="people-admin-toggle-body">
              {activeAdminTool === "groups" ? (
                <PeopleGroupsPanel
                  canManage={permissions.includes("people.manage_groups")}
                  embedded
                  locale={locale}
                  onChanged={load}
                  people={users}
                />
              ) : null}
              {activeAdminTool === "roles" ? (
                <RolePermissionsPanel
                  canManage={permissions.includes("roles.manage")}
                  locale={locale}
                />
              ) : null}
              {activeAdminTool === "institutions" ? (
                <InstitutionsPanel
                  canManage={permissions.includes("people.edit_affiliation")}
                  locale={locale}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="card card-compact form-grid people-filter-card">
        <label>
          {locale === "zh" ? "搜索人员" : "Search people"}
          <span className="search-control">
            <AppIcon name="search" />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                locale === "zh"
                  ? "姓名、邮箱、角色或项目…"
                  : "Name, email, role, or program…"
              }
              value={query}
            />
          </span>
        </label>
        <label className="people-filter-status">
          {locale === "zh" ? "账号状态" : "Account status"}
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">{locale === "zh" ? "全部" : "All"}</option>
            <option value="active">
              {locale === "zh" ? "启用" : "Active"}
            </option>
            <option value="inactive">
              {locale === "zh" ? "已归档" : "Archived"}
            </option>
          </select>
        </label>
      </div>
      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="table-shell people-data-table-shell">
          <div className="table-scroll people-data-table-scroll">
            <table className="data-table people-data-table">
              <colgroup>
                <col className="people-column-person" />
                <col className="people-column-role" />
                <col className="people-column-scope" />
                <col className="people-column-account" />
                <col className="people-column-password" />
                <col className="people-column-manage" />
              </colgroup>
              <thead>
                <tr>
                  <th>{locale === "zh" ? "人员" : "Person"}</th>
                  <th>
                    {locale === "zh" ? "角色与归属" : "Role & affiliation"}
                  </th>
                  <th>
                    {locale === "zh" ? "项目与分组" : "Programs & groups"}
                  </th>
                  <th>{locale === "zh" ? "账号与 AI" : "Account & AI"}</th>
                  <th>{locale === "zh" ? "密码安全" : "Password security"}</th>
                  <th className="people-manage-heading">
                    {locale === "zh" ? "管理" : "Manage"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td data-label={locale === "zh" ? "人员" : "Person"}>
                      <strong>{user.name}</strong>
                      <div className="caption">{user.email}</div>
                    </td>
                    <td
                      data-label={
                        locale === "zh" ? "角色与归属" : "Role & affiliation"
                      }
                    >
                      <div className="stack-sm">
                        <div className="row people-role-pills">
                          {user.roleAssignments.length
                            ? user.roleAssignments.map((role) => (
                                <StatusPill
                                  key={`${role.roleKey}-${role.status}`}
                                  tone="blue"
                                >
                                  {locale === "zh"
                                    ? role.roleNameZh
                                    : role.roleNameEn}
                                </StatusPill>
                              ))
                            : "—"}
                        </div>
                        <span className="caption">
                          {primaryDepartment(user.affiliations) ||
                            (locale === "zh" ? "未设置学院" : "No school set")}
                        </span>
                      </div>
                    </td>
                    <td
                      data-label={
                        locale === "zh" ? "项目与分组" : "Programs & groups"
                      }
                    >
                      <div className="stack-sm people-scope-cell">
                        <span>
                          {user.programMemberships
                            .map((program) =>
                              locale === "zh"
                                ? program.programNameZh
                                : program.programNameEn,
                            )
                            .join(", ") ||
                            (locale === "zh"
                              ? "组织范围"
                              : "Organization scope")}
                        </span>
                        <span className="caption">
                          {user.groups.length
                            ? user.groups
                                .map((group) =>
                                  locale === "zh" ? group.nameZh : group.nameEn,
                                )
                                .join("、")
                            : locale === "zh"
                              ? "未加入分组"
                              : "No group"}
                        </span>
                      </div>
                    </td>
                    <td
                      data-label={
                        locale === "zh" ? "账号与 AI" : "Account & AI"
                      }
                    >
                      <div className="stack-sm people-account-cell">
                        <StatusPill
                          tone={
                            user.status === "active" ? "green" : "neutral"
                          }
                        >
                          {user.status === "active"
                            ? locale === "zh"
                              ? "启用"
                              : "Active"
                            : locale === "zh"
                              ? "已归档"
                              : "Archived"}
                        </StatusPill>
                        {permissions.includes("permissions.assign") ? (
                          <button
                            aria-checked={user.aiEnabled}
                            className={`ai-access-toggle${user.aiEnabled ? " active" : ""}`}
                            disabled={
                              aiUpdating === user.id || user.status !== "active"
                            }
                            onClick={() => void toggleAiAccess(user)}
                            role="switch"
                            type="button"
                          >
                            <span aria-hidden="true">
                              <i />
                            </span>
                            {aiUpdating === user.id
                              ? locale === "zh"
                                ? "更新中…"
                                : "Updating…"
                            : user.aiEnabled
                                ? locale === "zh"
                                  ? "AI 已启用"
                                  : "AI enabled"
                                : locale === "zh"
                                  ? "AI 未分配"
                                  : "AI not assigned"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td
                      data-label={
                        locale === "zh" ? "密码安全" : "Password security"
                      }
                    >
                      <div className="stack-sm password-admin-cell">
                        <StatusPill
                          tone={user.mustChangePassword ? "amber" : "green"}
                        >
                          {user.mustChangePassword
                            ? locale === "zh"
                              ? "临时密码待修改"
                              : "Temporary password"
                            : locale === "zh"
                              ? "用户已设置"
                              : "User-set password"}
                        </StatusPill>
                        <span className="caption">
                          {user.passwordChangedAt
                            ? new Date(
                                user.passwordChangedAt,
                              ).toLocaleDateString(
                                locale === "zh" ? "zh-CN" : "en-US",
                              )
                            : locale === "zh"
                              ? "尚未修改"
                              : "Not changed"}
                        </span>
                        {permissions.includes("people.reset_password") ? (
                          <button
                            className="button button-secondary button-small password-reset-button"
                            onClick={() => {
                              setResetTarget(user);
                              setResetReason("");
                            }}
                            type="button"
                          >
                            {locale === "zh" ? "重置密码" : "Reset password"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td
                      className="people-manage-cell"
                      data-label={locale === "zh" ? "管理" : "Manage"}
                    >
                      <Link
                        className="button button-secondary button-small"
                        href={`/people/${user.id}`}
                      >
                        {locale === "zh" ? "管理" : "Manage"}
                        <AppIcon name="arrow" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="people"
          title={locale === "zh" ? "没有匹配账号" : "No matching accounts"}
          description={
            locale === "zh"
              ? "更改搜索或筛选条件。"
              : "Change the search or filter."
          }
        />
      )}
      {resetTarget ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !resetting)
              setResetTarget(null);
          }}
          role="presentation"
        >
          <form
            aria-labelledby="password-reset-dialog-title"
            aria-modal="true"
            className="modal-card stack"
            onSubmit={resetPassword}
            role="dialog"
          >
            <div className="modal-heading row-between">
              <div>
                <div className="eyebrow">
                  {locale === "zh" ? "账号恢复" : "Account recovery"}
                </div>
                <h2 id="password-reset-dialog-title">
                  {locale === "zh" ? "重置密码" : "Reset password"}
                </h2>
                <p className="muted">
                  {resetTarget.name} · {resetTarget.email}
                </p>
              </div>
              <button
                aria-label={locale === "zh" ? "关闭" : "Close"}
                className="icon-button"
                disabled={resetting}
                onClick={() => setResetTarget(null)}
                type="button"
              >
                <AppIcon name="close" />
              </button>
            </div>
            <div className="feedback feedback-warning">
              <span>
                <strong>
                  {locale === "zh"
                    ? "此操作会退出该用户的所有设备。"
                    : "This signs the user out on every device."}
                </strong>
                <span>
                  {locale === "zh"
                    ? "系统会生成一次性临时密码。管理员永远看不到用户之后设置的密码。"
                    : "The system generates a one-time temporary password. Administrators never see the password the user sets afterward."}
                </span>
              </span>
            </div>
            <label>
              {locale === "zh" ? "重置原因" : "Reason for reset"}
              <textarea
                autoFocus
                maxLength={2000}
                onChange={(event) => setResetReason(event.target.value)}
                placeholder={
                  locale === "zh"
                    ? "例如：用户确认忘记密码并请求重置"
                    : "For example: user confirmed they forgot the password and requested a reset"
                }
                required
                rows={3}
                value={resetReason}
              />
              <span className="caption">
                {locale === "zh"
                  ? "原因会写入审计记录。"
                  : "This reason is recorded in the audit log."}
              </span>
            </label>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={resetting}
                onClick={() => setResetTarget(null)}
                type="button"
              >
                {locale === "zh" ? "取消" : "Cancel"}
              </button>
              <button
                className="button"
                disabled={resetting || !resetReason.trim()}
                type="submit"
              >
                {resetting
                  ? locale === "zh"
                    ? "正在重置…"
                    : "Resetting…"
                  : locale === "zh"
                    ? "生成临时密码"
                    : "Generate temporary password"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
