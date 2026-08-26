"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { OPEN_INSTALL_EVENT } from "@/components/PwaBits";
import { PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/api-client";

type Module = {
  group: "operations" | "evidence" | "administration" | "account";
  href: string;
  icon: AppIconName;
  en: string;
  zh: string;
  detailEn: string;
  detailZh: string;
  permissions?: string[];
};
const modules: Module[] = [
  {
    group: "operations",
    href: "/programs",
    icon: "reports",
    en: "Programs",
    zh: "项目",
    detailEn: "Programs, members, forms, and tasks",
    detailZh: "项目、成员、表单与任务范围",
    permissions: ["programs.view"],
  },
  {
    group: "operations",
    href: "/locations",
    icon: "locations",
    en: "Locations",
    zh: "地点",
    detailEn: "Canonical sites, aliases, and merges",
    detailZh: "标准地点、别名与合并",
    permissions: ["locations.view"],
  },
  {
    group: "administration",
    href: "/people",
    icon: "people",
    en: "People & accounts",
    zh: "人员与账号",
    detailEn: "Accounts, roles, and scoped access",
    detailZh: "账号、角色与权限范围",
    permissions: ["people.view", "users.view"],
  },
  {
    group: "evidence",
    href: "/data",
    icon: "data",
    en: "Data & sharing",
    zh: "数据与共享",
    detailEn: "Datasets, downloads, and controlled sharing",
    detailZh: "数据集、下载与受控共享",
    permissions: ["datasets.download", "datasets.create"],
  },
  {
    group: "evidence",
    href: "/reports",
    icon: "reports",
    en: "Reports",
    zh: "报告",
    detailEn: "Human-authored reports and versions",
    detailZh: "人工编辑报告与版本",
    permissions: ["reports.view"],
  },
  {
    group: "evidence",
    href: "/ops/analytics",
    icon: "insights",
    en: "Analytics detail",
    zh: "分析详情",
    detailEn: "Source-separated operational metrics",
    detailZh: "按来源分开的运营指标",
    permissions: ["analytics.view", "insights.view"],
  },
  {
    group: "administration",
    href: "/ops/jobs",
    icon: "settings",
    en: "System jobs",
    zh: "系统任务",
    detailEn: "Worker and queue administration",
    detailZh: "工作队列管理",
    permissions: ["settings.manage"],
  },
  {
    group: "administration",
    href: "/settings/configuration",
    icon: "settings",
    en: "Custom configuration",
    zh: "自定义配置",
    detailEn: "Location, task, form, source, and missing-value types",
    detailZh: "地点、任务、表单、来源与未记录原因",
    permissions: ["services.manage"],
  },
  {
    group: "account",
    href: "/account",
    icon: "settings",
    en: "My account",
    zh: "我的账号",
    detailEn: "Profile, password, and preferences",
    detailZh: "个人资料、密码与偏好",
  },
];

export default function MorePage() {
  const { locale, setLocale } = useI18n();
  const router = useRouter();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    apiFetch<{ permissions: string[] }>("/api/v1/auth/me")
      .then((result) => setPermissions(result.permissions ?? []))
      .catch(() => undefined);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const iosNavigator = navigator as Navigator & { standalone?: boolean };
    const updateInstalled = () => setInstalled(displayMode.matches || iosNavigator.standalone === true);
    updateInstalled();
    displayMode.addEventListener?.("change", updateInstalled);
    window.addEventListener("appinstalled", updateInstalled);
    return () => {
      displayMode.removeEventListener?.("change", updateInstalled);
      window.removeEventListener("appinstalled", updateInstalled);
    };
  }, []);
  const allowed = useMemo(
    () =>
      modules.filter(
        (item) =>
          !item.permissions ||
          item.permissions.some((permission) =>
            permissions.includes(permission),
          ),
      ),
    [permissions],
  );
  const groups = [
    {
      key: "operations" as const,
      en: "Operations",
      zh: "采集与运营",
      detailEn: "Programs and places that define collection scope.",
      detailZh: "定义采集范围的项目与地点。",
    },
    {
      key: "evidence" as const,
      en: "Evidence and outputs",
      zh: "证据与成果",
      detailEn: "Research access, analysis, reports, and controlled sharing.",
      detailZh: "研究访问、分析、报告与受控共享。",
    },
    {
      key: "administration" as const,
      en: "Administration",
      zh: "系统管理",
      detailEn: "People, services, and background operations.",
      detailZh: "人员、服务与后台运行管理。",
    },
    {
      key: "account" as const,
      en: "Account",
      zh: "个人账号",
      detailEn: "Your profile, security, and language preference.",
      detailZh: "个人资料、安全设置与语言偏好。",
    },
  ].filter((group) => allowed.some((item) => item.group === group.key));

  async function signOut() {
    setSigningOut(true);
    await apiFetch<void>("/api/v1/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "更多" : "More"}
        description={
          locale === "zh"
            ? "访问专门工作区与账号设置。"
            : "Open specialized workspaces and account settings."
        }
      />
      <div className="more-directory">
        {groups.map((group) => (
          <section className="more-group" key={group.key}>
            <header className="more-group-heading">
              <h2>{locale === "zh" ? group.zh : group.en}</h2>
              <p>{locale === "zh" ? group.detailZh : group.detailEn}</p>
            </header>
            <div className="more-link-list">
              {allowed
                .filter((item) => item.group === group.key)
                .map((item) => (
                  <Link className="more-link-row" href={item.href} key={item.href}>
                    <span className="more-link-icon"><AppIcon name={item.icon} /></span>
                    <span className="more-link-copy">
                      <strong>{locale === "zh" ? item.zh : item.en}</strong>
                      <small>{locale === "zh" ? item.detailZh : item.detailEn}</small>
                    </span>
                    <AppIcon className="more-link-arrow" name="arrow" />
                  </Link>
                ))}
              {group.key === "account" ? (
                <>
                  {!installed ? (
                    <button
                      className="more-install-row"
                      onClick={() => window.dispatchEvent(new Event(OPEN_INSTALL_EVENT))}
                      type="button"
                    >
                      <span className="more-link-icon"><AppIcon name="download" /></span>
                      <span className="more-link-copy">
                        <strong>{locale === "zh" ? "安装 CNPAF Community" : "Install CNPAF Community"}</strong>
                        <small>{locale === "zh" ? "按当前设备与浏览器显示正确安装方式" : "Show the right install path for this device and browser"}</small>
                      </span>
                      <AppIcon className="more-link-arrow" name="arrow" />
                    </button>
                  ) : null}
                  <div className="more-language-row">
                    <span className="more-link-icon"><AppIcon name="settings" /></span>
                    <span className="more-link-copy">
                      <strong>{locale === "zh" ? "界面语言" : "Interface language"}</strong>
                      <small>{locale === "zh" ? "当前使用中文" : "Currently using English"}</small>
                    </span>
                    <button
                      className="button button-secondary button-small"
                      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
                      type="button"
                    >
                      {locale === "zh" ? "English" : "中文"}
                    </button>
                  </div>
                  <button
                    className="more-signout-row"
                    disabled={signingOut}
                    onClick={signOut}
                    type="button"
                  >
                    <span className="more-link-icon"><AppIcon name="logout" /></span>
                    <span className="more-link-copy">
                      <strong>{locale === "zh" ? "安全退出" : "Sign out securely"}</strong>
                      <small>
                        {locale === "zh"
                          ? "结束当前登录并返回登录页"
                          : "End this session and return to sign in"}
                      </small>
                    </span>
                    <AppIcon className="more-link-arrow" name="arrow" />
                  </button>
                </>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
