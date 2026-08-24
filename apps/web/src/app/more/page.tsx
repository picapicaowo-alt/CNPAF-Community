"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppIcon, type AppIconName } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { PageHeader } from "@/components/ui";
import { apiFetch } from "@/lib/api-client";

type Module = {
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
    href: "/locations",
    icon: "locations",
    en: "Locations",
    zh: "地点",
    detailEn: "Canonical sites, aliases, and merges",
    detailZh: "标准地点、别名与合并",
    permissions: ["locations.view"],
  },
  {
    href: "/people",
    icon: "people",
    en: "People & accounts",
    zh: "人员与账号",
    detailEn: "Accounts, roles, and scoped access",
    detailZh: "账号、角色与权限范围",
    permissions: ["people.view", "users.view"],
  },
  {
    href: "/data",
    icon: "data",
    en: "Data & sharing",
    zh: "数据与共享",
    detailEn: "Datasets, downloads, and controlled sharing",
    detailZh: "数据集、下载与受控共享",
    permissions: ["datasets.download", "datasets.create"],
  },
  {
    href: "/reports",
    icon: "reports",
    en: "Reports",
    zh: "报告",
    detailEn: "Human-authored reports and versions",
    detailZh: "人工编辑报告与版本",
    permissions: ["reports.view"],
  },
  {
    href: "/ops/analytics",
    icon: "insights",
    en: "Analytics detail",
    zh: "分析详情",
    detailEn: "Source-separated operational metrics",
    detailZh: "按来源分开的运营指标",
    permissions: ["analytics.view", "insights.view"],
  },
  {
    href: "/ops/jobs",
    icon: "settings",
    en: "System jobs",
    zh: "系统任务",
    detailEn: "Worker and queue administration",
    detailZh: "工作队列管理",
    permissions: ["settings.manage"],
  },
  {
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
  const [permissions, setPermissions] = useState<string[]>([]);
  useEffect(() => {
    apiFetch<{ permissions: string[] }>("/api/v1/auth/me")
      .then((result) => setPermissions(result.permissions ?? []))
      .catch(() => undefined);
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
      <div className="grid-3">
        {allowed.map((item) => (
          <Link
            className="card card-interactive row-between"
            href={item.href}
            key={item.href}
          >
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <span className="empty-icon">
                <AppIcon name={item.icon} />
              </span>
              <span>
                <h3>{locale === "zh" ? item.zh : item.en}</h3>
                <span className="caption">
                  {locale === "zh" ? item.detailZh : item.detailEn}
                </span>
              </span>
            </div>
            <AppIcon
              name="arrow"
              style={{ width: 18, height: 18, color: "var(--muted)" }}
            />
          </Link>
        ))}
      </div>
      <div className="card row-between">
        <div>
          <h3>{locale === "zh" ? "语言" : "Language"}</h3>
          <p className="muted">
            {locale === "zh" ? "当前：中文" : "Current: English"}
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
          type="button"
        >
          {locale === "zh" ? "Switch to English" : "切换到中文"}
        </button>
      </div>
    </div>
  );
}
