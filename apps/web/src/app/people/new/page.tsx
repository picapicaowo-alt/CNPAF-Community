"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Role = {
  id: string;
  key: string;
  nameEn: string;
  nameZh: string;
  description?: string | null;
  status: string;
  organizationId?: string | null;
};
type Institution = {
  id: string;
  name: string;
  institutionTypeKey: "school" | "organization";
  status: string;
};

export default function NewAccountPage() {
  const { locale } = useI18n();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roleKey, setRoleKey] = useState("");
  const [accountLocale, setAccountLocale] = useState("zh");
  const [institutionId, setInstitutionId] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [title, setTitle] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [created, setCreated] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      apiFetch<{ user: { organizationId?: string | null } }>("/api/v1/auth/me"),
      apiFetch<{ roles: Role[] }>("/api/v1/roles"),
      apiFetch<{ institutions: Institution[] }>("/api/v1/institutions"),
    ])
      .then(([me, result, institutionResult]) => {
        setOrganizationId(me.user.organizationId ?? null);
        const active = (result.roles ?? []).filter(
          (role) =>
            role.status === "active" &&
            (!role.organizationId ||
              role.organizationId === me.user.organizationId),
        );
        setRoles(active);
        setRoleKey(active[0]?.key ?? "");
        setInstitutions(
          (institutionResult.institutions ?? []).filter((item) => item.status === "active"),
        );
      })
      .catch((caught) => setError(errorMessage(caught)));
  }, []);
  async function create() {
    if (!name.trim() || !email.trim() || !roleKey) return;
    setSaving(true);
    setError("");
    try {
      const result = await apiFetch<{
        user: { name: string; email: string };
        temporaryPassword: string;
      }>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          organizationId,
          locale: accountLocale,
          requirePasswordChange: true,
          roleAssignments: [{ roleKey, organizationId }],
          scopeAssignments: [],
          affiliations: institutionId
            ? [
                {
                  organizationId,
                  affiliationTypeKey:
                    roleKey === "volunteer" ? "student" : "staff",
                  institutionId,
                  departmentName: departmentName.trim() || null,
                  title: title.trim() || null,
                  metadata: {},
                  isPrimary: true,
                },
              ]
            : [],
          programMemberships: [],
        }),
      });
      setTemporaryPassword(result.temporaryPassword);
      setCreated(result.user);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="stack">
      <PageHeader
        eyebrow={locale === "zh" ? "人员与账号" : "People & accounts"}
        title={locale === "zh" ? "创建账号" : "Create account"}
        description={
          locale === "zh"
            ? "角色来自后端配置；新用户首次登录后必须修改临时密码。"
            : "Roles come from backend configuration; the user must change the temporary password at first sign-in."
        }
        actions={
          <Link className="button button-secondary" href="/people">
            <AppIcon name="back" />
            {locale === "zh" ? "返回" : "Back"}
          </Link>
        }
      />
      {error ? <ErrorState message={error} /> : null}
      {created ? (
        <section className="card stack" style={{ maxWidth: 720 }}>
          <div className="feedback feedback-success">
            <div>
              <strong>
                {locale === "zh" ? "账号已创建" : "Account created"}
              </strong>
              <p>
                {created.name} · {created.email}
              </p>
            </div>
          </div>
          <label>
            {locale === "zh" ? "一次性临时密码" : "One-time temporary password"}
            <div className="field-row">
              <input readOnly value={temporaryPassword} />
              <button
                className="button button-secondary"
                onClick={() => navigator.clipboard.writeText(temporaryPassword)}
                type="button"
              >
                {locale === "zh" ? "复制" : "Copy"}
              </button>
            </div>
          </label>
          <p className="muted">
            {locale === "zh"
              ? "请通过安全渠道发送。关闭本页后不会再次显示此密码。"
              : "Send it through a secure channel. It will not be shown again after leaving this page."}
          </p>
          <Link className="button" href="/people">
            {locale === "zh" ? "返回人员列表" : "Return to people"}
          </Link>
        </section>
      ) : (
        <div className="content-aside">
          <section className="card stack">
            <h2>{locale === "zh" ? "基本信息" : "Basic information"}</h2>
            <div className="form-grid">
              <label>
                {locale === "zh" ? "姓名" : "Name"}
                <input
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label>
                {locale === "zh" ? "邮箱" : "Email"}
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                {locale === "zh" ? "界面语言" : "Interface language"}
                <select
                  onChange={(event) => setAccountLocale(event.target.value)}
                  value={accountLocale}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {locale === "zh" ? "初始角色" : "Initial role"}
                <select
                  onChange={(event) => setRoleKey(event.target.value)}
                  value={roleKey}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.key}>
                      {locale === "zh" ? role.nameZh : role.nameEn}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {locale === "zh" ? "学校 / 机构（可选）" : "School / institution (optional)"}
                <select onChange={(event) => setInstitutionId(event.target.value)} value={institutionId}>
                  <option value="">{locale === "zh" ? "未设置" : "Not set"}</option>
                  {institutions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                {locale === "zh" ? "学院 / 系（可选）" : "School / department (optional)"}
                <input
                  disabled={!institutionId}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  placeholder={
                    locale === "zh"
                      ? "例如：Leonard Davis School of Gerontology"
                      : "e.g. Leonard Davis School of Gerontology"
                  }
                  value={departmentName}
                />
              </label>
              <label>
                {locale === "zh" ? "身份 / 职务（可选）" : "Title (optional)"}
                <input
                  disabled={!institutionId}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={locale === "zh" ? "例如：学生" : "e.g. Student"}
                  value={title}
                />
              </label>
            </div>
            <button
              className="button"
              disabled={saving || !name.trim() || !email.trim() || !roleKey}
              onClick={create}
              type="button"
            >
              {saving
                ? locale === "zh"
                  ? "正在创建…"
                  : "Creating…"
                : locale === "zh"
                  ? "创建账号"
                  : "Create account"}
            </button>
          </section>
          <aside className="card stack-sm">
            <h2>{locale === "zh" ? "访问说明" : "Access notes"}</h2>
            <p className="muted">
              {roles.find((role) => role.key === roleKey)?.description ||
                (locale === "zh"
                  ? "账号会继承所选角色的权限；学校与学院会保存为主要所属关系。更细的项目和地点范围可在账号创建后配置。"
                  : "The account inherits the selected role. School and department are saved as the primary affiliation; finer program and location scopes can be configured afterward.")}
            </p>
            <div className="feedback feedback-warning">
              <span>
                {locale === "zh"
                  ? "临时密码只显示一次。"
                  : "The temporary password is shown once."}
              </span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
