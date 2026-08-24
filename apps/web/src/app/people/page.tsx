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
import { apiFetch, errorMessage } from "@/lib/api-client";

type User = {
  id: string;
  name: string;
  email: string;
  status: string;
  locale: string;
  updatedAt: string;
  roleAssignments: Array<{
    roleKey: string;
    roleNameEn: string;
    roleNameZh: string;
    status: string;
  }>;
  programMemberships: Array<{ programNameEn: string; programNameZh: string }>;
};

export default function PeoplePage() {
  const { locale } = useI18n();
  const [users, setUsers] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
            ].some((value) =>
              value
                ?.toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
            )),
      ),
    [query, status, users],
  );
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
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
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
                  <th>{locale === "zh" ? "项目范围" : "Program scope"}</th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
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
                        {user.status}
                      </StatusPill>
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
    </div>
  );
}
