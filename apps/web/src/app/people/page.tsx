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
  const [adminTarget, setAdminTarget] = useState<User | null>(null);
  const [assigningAdmin, setAssigningAdmin] = useState(false);
  const [resetCredential, setResetCredential] = useState<{
    name: string;
    email: string;
    temporaryPassword: string;
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
      const result = await apiFetch<{ temporaryPassword: string }>(
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
          reason: locale === "zh" ? "管理员在人员与账号页面更新 ChatGPT 使用权限" : "Administrator updated ChatGPT access from People & accounts",
        }),
      });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, aiEnabled: enabled } : item));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAiUpdating("");
    }
  }
  async function assignAdminRole() {
    if (!adminTarget) return;
    setAssigningAdmin(true);
    setError("");
    try {
      await apiFetch(`/api/v1/users/${adminTarget.id}/role-assignments`, {
        method: "POST",
        body: JSON.stringify({
          roleKey: "admin",
          organizationId: adminTarget.organizationId,
        }),
      });
      setAdminTarget(null);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAssigningAdmin(false);
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
        <div className="feedback feedback-success reset-credential" role="status">
          <span>
            <strong>
              {locale === "zh"
                ? `${resetCredential.name} 的一次性临时密码`
                : `One-time temporary password for ${resetCredential.name}`}
            </strong>
            <span>
              {locale === "zh"
                ? `请安全交给 ${resetCredential.email}。此密码只在这里显示一次；用户登录后必须立即修改。`
                : `Share it securely with ${resetCredential.email}. It is shown only here; the user must change it after signing in.`}
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
        <PeopleGroupsPanel
          canManage={permissions.includes("people.manage_groups")}
          locale={locale}
          onChanged={load}
          people={users}
        />
      ) : null}
      <div className="card card-compact form-grid">
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
        <label>
          {locale === "zh" ? "账号状态" : "Account status"}
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="all">{locale === "zh" ? "全部" : "All"}</option>
            <option value="active">{locale === "zh" ? "启用" : "Active"}</option>
            <option value="inactive">{locale === "zh" ? "停用" : "Inactive"}</option>
          </select>
        </label>
      </div>
      {loading ? (
        <LoadingState rows={6} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="table-shell">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "zh" ? "人员" : "Person"}</th>
                  <th>{locale === "zh" ? "角色" : "Roles"}</th>
                  <th>{locale === "zh" ? "学院 / 系" : "School / department"}</th>
                  <th>{locale === "zh" ? "分组" : "Groups"}</th>
                  <th>{locale === "zh" ? "项目范围" : "Program scope"}</th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
                  <th>{locale === "zh" ? "ChatGPT 权限" : "ChatGPT access"}</th>
                  <th>{locale === "zh" ? "密码安全" : "Password security"}</th>
                  <th>{locale === "zh" ? "更新" : "Updated"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.name}</strong>
                      <div className="caption">{user.email}</div>
                    </td>
                    <td>
                      <div className="stack-sm">
                        <div className="row">
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
                        {permissions.includes("roles.assign") &&
                        user.status === "active" &&
                        !user.roleAssignments.some(
                          (role) => role.roleKey === "admin" && role.status === "active",
                        ) ? (
                          <button
                            className="button button-secondary button-small"
                            onClick={() => setAdminTarget(user)}
                            type="button"
                          >
                            {locale === "zh" ? "设为管理员" : "Make admin"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>{primaryDepartment(user.affiliations) || "—"}</td>
                    <td>
                      <div className="row">
                        {user.groups.length
                          ? user.groups.map((group) => (
                              <StatusPill key={group.id} tone="blue">
                                {locale === "zh" ? group.nameZh : group.nameEn}
                              </StatusPill>
                            ))
                          : "—"}
                      </div>
                    </td>
                    <td>
                      {user.programMemberships
                        .map((program) =>
                          locale === "zh"
                            ? program.programNameZh
                            : program.programNameEn,
                        )
                        .join(", ") ||
                        (locale === "zh" ? "组织范围" : "Organization scope")}
                    </td>
                    <td>
                      <StatusPill
                        tone={user.status === "active" ? "green" : "neutral"}
                      >
                        {user.status === "active"
                          ? locale === "zh" ? "启用" : "Active"
                          : locale === "zh" ? "停用" : "Inactive"}
                      </StatusPill>
                    </td>
                    <td>
                      {permissions.includes("permissions.assign") ? (
                        <button
                          aria-checked={user.aiEnabled}
                          className={`ai-access-toggle${user.aiEnabled ? " active" : ""}`}
                          disabled={aiUpdating === user.id || user.status !== "active"}
                          onClick={() => void toggleAiAccess(user)}
                          role="switch"
                          type="button"
                        >
                          <span aria-hidden="true"><i /></span>
                          {aiUpdating === user.id
                            ? (locale === "zh" ? "更新中…" : "Updating…")
                            : user.aiEnabled
                              ? (locale === "zh" ? "已启用" : "Enabled")
                              : (locale === "zh" ? "未分配" : "Not assigned")}
                        </button>
                      ) : (
                        <StatusPill tone={user.aiEnabled ? "violet" : "neutral"}>{user.aiEnabled ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未分配" : "Not assigned")}</StatusPill>
                      )}
                    </td>
                    <td>
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
                            ? `${locale === "zh" ? "修改于 " : "Changed "}${new Date(
                                user.passwordChangedAt,
                              ).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US")}`
                            : locale === "zh"
                              ? "尚无个人修改记录"
                              : "No personal change recorded"}
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
                    <td>
                      {new Date(user.updatedAt).toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
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
      {adminTarget ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !assigningAdmin)
              setAdminTarget(null);
          }}
          role="presentation"
        >
          <form
            aria-labelledby="assign-admin-dialog-title"
            aria-modal="true"
            className="modal-card stack"
            onSubmit={(event) => {
              event.preventDefault();
              void assignAdminRole();
            }}
            role="dialog"
          >
            <div className="modal-heading row-between">
              <div>
                <div className="eyebrow">
                  {locale === "zh" ? "角色授权" : "Role assignment"}
                </div>
                <h2 id="assign-admin-dialog-title">
                  {locale === "zh" ? "设为管理员" : "Make admin"}
                </h2>
                <p className="muted">
                  {adminTarget.name} · {adminTarget.email}
                </p>
              </div>
              <button
                aria-label={locale === "zh" ? "关闭" : "Close"}
                className="icon-button"
                disabled={assigningAdmin}
                onClick={() => setAdminTarget(null)}
                type="button"
              >
                <AppIcon name="close" />
              </button>
            </div>
            <div className="feedback feedback-warning">
              <span>
                <strong>
                  {locale === "zh"
                    ? "管理员拥有完整的平台管理权限。"
                    : "Admins have full platform management access."}
                </strong>
                <span>
                  {locale === "zh"
                    ? "确认后，该账号的现有会话会失效，并在下次登录时获得管理员权限。操作会写入审计日志。"
                    : "After confirmation, existing sessions are revoked and admin access applies at the next sign-in. The action is audit logged."}
                </span>
              </span>
            </div>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                disabled={assigningAdmin}
                onClick={() => setAdminTarget(null)}
                type="button"
              >
                {locale === "zh" ? "取消" : "Cancel"}
              </button>
              <button className="button" disabled={assigningAdmin} type="submit">
                {assigningAdmin
                  ? locale === "zh" ? "授权中…" : "Assigning…"
                  : locale === "zh" ? "确认设为管理员" : "Confirm admin access"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
