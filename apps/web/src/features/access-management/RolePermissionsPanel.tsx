"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Role = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  description?: string | null;
  status: string;
  isSystemRole: boolean;
  permissions: Array<{ permissionKey: string; effect: string }>;
};

type Permission = {
  id: string;
  key: string;
  module: string;
  nameEn: string;
  nameZh: string;
  description?: string | null;
  status: string;
};

const MODULE_LABELS: Record<string, { zh: string; en: string }> = {
  records: { zh: "记录", en: "Records" },
  privacy: { zh: "隐私", en: "Privacy" },
  safety: { zh: "安全", en: "Safety" },
  templates: { zh: "表单模板", en: "Templates" },
  taxonomy: { zh: "分类体系", en: "Taxonomy" },
  ai: { zh: "AI 分析", en: "AI analysis" },
  analytics: { zh: "洞察分析", en: "Analytics" },
  reports: { zh: "报告", en: "Reports" },
  chat: { zh: "洞察对话", en: "Insight chat" },
  ask_collect: { zh: "数据问答", en: "Ask Collect" },
  exports: { zh: "导出", en: "Exports" },
  users: { zh: "账号", en: "Accounts" },
  people: { zh: "人员", en: "People" },
  roles: { zh: "角色", en: "Roles" },
  permissions: { zh: "权限", en: "Permissions" },
  sites: { zh: "地点", en: "Sites" },
  locations: { zh: "地点", en: "Locations" },
  programs: { zh: "项目", en: "Programs" },
  tasks: { zh: "任务", en: "Tasks" },
  review: { zh: "审核", en: "Review" },
  findings: { zh: "关注点", en: "Findings" },
  insights: { zh: "洞察", en: "Insights" },
  notifications: { zh: "通知", en: "Notifications" },
  datasets: { zh: "数据集", en: "Datasets" },
  data: { zh: "数据", en: "Data" },
  services: { zh: "服务", en: "Services" },
  settings: { zh: "设置", en: "Settings" },
  audit: { zh: "审计", en: "Audit" },
};

export function RolePermissionsPanel({
  canManage,
  locale,
}: {
  canManage: boolean;
  locale: "zh" | "en";
}) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const selectRole = useCallback((role: Role) => {
    setSelectedRoleId(role.id);
    setSelectedKeys(
      role.permissions
        .filter((permission) => permission.effect === "allow")
        .map((permission) => permission.permissionKey),
    );
    setSaved(false);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [roleResult, permissionResult] = await Promise.all([
        apiFetch<{ roles: Role[] }>("/api/v1/admin/roles"),
        apiFetch<{ permissions: Permission[] }>("/api/v1/admin/permissions"),
      ]);
      const activeRoles = (roleResult.roles ?? []).filter(
        (role) => role.status === "active",
      );
      setRoles(activeRoles);
      setPermissions(
        (permissionResult.permissions ?? []).filter(
          (permission) => permission.status === "active",
        ),
      );
      const next =
        activeRoles.find((role) => role.id === selectedRoleId) ??
        activeRoles[0];
      if (next) selectRole(next);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [selectRole, selectedRoleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRole = roles.find((role) => role.id === selectedRoleId);
  const byModule = useMemo(() => {
    const result = new Map<string, Permission[]>();
    for (const permission of permissions) {
      result.set(permission.module, [
        ...(result.get(permission.module) ?? []),
        permission,
      ]);
    }
    return [...result.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [permissions]);

  function toggle(permissionKey: string) {
    setSaved(false);
    setSelectedKeys((current) =>
      current.includes(permissionKey)
        ? current.filter((key) => key !== permissionKey)
        : [...current, permissionKey],
    );
  }

  async function save() {
    if (!selectedRole) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await apiFetch(`/api/v1/admin/roles/${selectedRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({ permissionKeys: selectedKeys }),
      });
      setSaved(true);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !roles.length) {
    return (
      <p className="muted">
        {locale === "zh" ? "正在加载角色…" : "Loading roles…"}
      </p>
    );
  }

  return (
    <div className="role-permissions-layout">
      <div className="section-picker role-permissions-list">
        {roles.map((role) => (
          <button
            className={role.id === selectedRoleId ? "active" : ""}
            key={role.id}
            onClick={() => selectRole(role)}
            type="button"
          >
            <span>{locale === "zh" ? role.nameZh : role.nameEn}</span>
            <StatusPill tone="blue">
              {
                role.permissions.filter((item) => item.effect === "allow")
                  .length
              }
            </StatusPill>
          </button>
        ))}
      </div>
      <div className="stack">
        {error ? <div className="feedback feedback-error">{error}</div> : null}
        <div className="row-between mobile-stack">
          <div>
            <h3>
              {selectedRole
                ? locale === "zh"
                  ? selectedRole.nameZh
                  : selectedRole.nameEn
                : "—"}
            </h3>
            <p className="muted">
              {locale === "zh"
                ? "勾选该角色默认拥有的功能权限。个人的项目与地点范围在人员详情中设置。"
                : "Choose the capabilities granted by this role. Per-person program and site scope is set from the person record."}
            </p>
          </div>
          <div className="row">
            {saved ? (
              <StatusPill tone="green">
                {locale === "zh" ? "已保存" : "Saved"}
              </StatusPill>
            ) : null}
            {canManage ? (
              <button
                className="button button-small"
                disabled={saving || !selectedRole}
                onClick={() => void save()}
                type="button"
              >
                {saving
                  ? locale === "zh"
                    ? "保存中…"
                    : "Saving…"
                  : locale === "zh"
                    ? "保存角色权限"
                    : "Save role permissions"}
              </button>
            ) : null}
          </div>
        </div>
        {selectedRole?.key === "admin" ? (
          <div className="feedback feedback-warning compact-feedback">
            {locale === "zh"
              ? "管理员角色影响全站管理能力；移除权限前请确认仍有其他管理员可以恢复配置。"
              : "The admin role controls platform-wide administration. Keep another admin able to recover the configuration."}
          </div>
        ) : null}
        <div className="permission-module-grid">
          {byModule.map(([module, modulePermissions]) => (
            <fieldset className="permission-module" key={module}>
              <legend>{MODULE_LABELS[module]?.[locale] ?? module}</legend>
              {modulePermissions.map((permission) => (
                <label className="permission-option" key={permission.id}>
                  <input
                    checked={selectedKeys.includes(permission.key)}
                    disabled={!canManage}
                    onChange={() => toggle(permission.key)}
                    type="checkbox"
                  />
                  <span>
                    <strong>
                      {locale === "zh" ? permission.nameZh : permission.nameEn}
                    </strong>
                    {locale === "en" ? <small>{permission.key}</small> : null}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
