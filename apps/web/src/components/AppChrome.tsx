"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, ClientApiError, errorMessage } from "@/lib/api-client";
import { AppIcon, type AppIconName } from "./AppIcon";
import { BrandLogo } from "./BrandLogo";
import { useI18n } from "./LocaleProvider";

type Role = { id: string; key: string; nameEn: string; nameZh: string };
type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    mustChangePassword: boolean;
    avatarUrl: string | null;
  };
  roles: Role[];
  permissions: string[];
  capabilities: string[];
};
type NavItem = {
  href: string;
  labelEn: string;
  labelZh: string;
  icon: AppIconName;
  permissions?: string[];
  aliases?: string[];
};

type WorkSurface = "field" | "evidence" | "admin";

function workSurfaceForRole(roleKey?: string): WorkSurface {
  if (roleKey === "volunteer") return "field";
  if (roleKey === "admin") return "admin";
  return "evidence";
}

const navItems: NavItem[] = [
  { href: "/dashboard", labelEn: "Home", labelZh: "首页", icon: "home" },
  {
    href: "/tasks",
    labelEn: "Tasks",
    labelZh: "任务",
    icon: "tasks",
    permissions: ["tasks.view"],
  },
  {
    href: "/review",
    labelEn: "Review",
    labelZh: "审核",
    icon: "review",
    permissions: ["review.view"],
    aliases: ["/ops"],
  },
  {
    href: "/records",
    labelEn: "Records",
    labelZh: "记录",
    icon: "records",
    permissions: ["records.view", "records.view_own", "records.view_approved"],
  },
  {
    href: "/forms",
    labelEn: "Forms",
    labelZh: "表单",
    icon: "forms",
    permissions: ["templates.view"],
  },
  {
    href: "/insights",
    labelEn: "Insights",
    labelZh: "洞察",
    icon: "insights",
    permissions: [
      "analytics.view",
      "insights.view",
      "reports.view",
      "chat.ask_collect",
      "ask_collect.use",
    ],
    aliases: ["/reports"],
  },
  { href: "/more", labelEn: "More", labelZh: "更多", icon: "more" },
];

const parentRoutes: Array<{
  match: (pathname: string) => boolean;
  href: string;
  labelEn: string;
  labelZh: string;
}> = [
  { match: (path) => path.startsWith("/insights/"), href: "/insights", labelEn: "Insights", labelZh: "洞察" },
  { match: (path) => path.startsWith("/reports/"), href: "/insights", labelEn: "Insights", labelZh: "洞察" },
  { match: (path) => path.startsWith("/data/"), href: "/data", labelEn: "Datasets", labelZh: "数据集" },
  { match: (path) => path.startsWith("/forms/"), href: "/forms", labelEn: "Forms", labelZh: "表单" },
  { match: (path) => path.startsWith("/records/"), href: "/records", labelEn: "Records", labelZh: "记录" },
  { match: (path) => path.startsWith("/review/"), href: "/review", labelEn: "Review", labelZh: "审核" },
  { match: (path) => path.startsWith("/tasks/"), href: "/tasks", labelEn: "Tasks", labelZh: "任务" },
  { match: (path) => path.startsWith("/people/"), href: "/people", labelEn: "People", labelZh: "人员" },
  { match: (path) => path.startsWith("/programs/"), href: "/programs", labelEn: "Programs", labelZh: "项目" },
  { match: (path) => path.startsWith("/locations/"), href: "/locations", labelEn: "Locations", labelZh: "地点" },
];

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "C"
  );
}

function PasswordChangeGate({ locale }: { locale: "zh" | "en" }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(
        locale === "zh"
          ? "两次输入的新密码不一致。"
          : "The new passwords do not match.",
      );
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/v1/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      setSaving(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-story">
          <BrandLogo
            className="auth-brand-logo"
            label="Chinese Psychological Assistance Foundation"
            priority
          />
          <h1>
            {locale === "zh"
              ? "先保护好你的账号。"
              : "Secure your account first."}
          </h1>
          <p>
            {locale === "zh"
              ? "临时密码只能用于首次登录。设置个人密码后，请重新登录工作区。"
              : "A temporary password is only for first sign-in. Set your own password, then sign in again."}
          </p>
        </div>
        <span className="auth-footnote">
          Secure access · Scoped permissions
        </span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-product-name">CNPAF Community</div>
        <form className="card auth-card stack" onSubmit={submit}>
          <div>
            <div className="eyebrow">
              {locale === "zh" ? "必须完成" : "Required"}
            </div>
            <h1>{locale === "zh" ? "修改密码" : "Change password"}</h1>
          </div>
          <label>
            {locale === "zh" ? "当前临时密码" : "Current temporary password"}
            <input
              autoComplete="current-password"
              minLength={8}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label>
            {locale === "zh" ? "新密码" : "New password"}
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
            <span className="caption">
              {locale === "zh"
                ? "至少 12 个字符，且不能与临时密码相同"
                : "At least 12 characters and different from the temporary password"}
            </span>
          </label>
          <label>
            {locale === "zh" ? "确认新密码" : "Confirm new password"}
            <input
              autoComplete="new-password"
              minLength={12}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>
          {error ? (
            <div className="feedback feedback-error" role="alert">
              {error}
            </div>
          ) : null}
          <button
            className="button button-wide"
            disabled={
              saving ||
              newPassword.length < 12 ||
              newPassword !== confirmPassword
            }
            type="submit"
          >
            {saving
              ? locale === "zh"
                ? "正在保存…"
                : "Saving…"
              : locale === "zh"
                ? "保存并重新登录"
                : "Save and sign in again"}
          </button>
        </form>
      </section>
    </main>
  );
}

export function AppChrome({ children }: { children: React.ReactNode }) {
  const { locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  const publicPage =
    pathname === "/login" ||
    pathname.startsWith("/invite") ||
    pathname === "/privacy" ||
    pathname === "/offline";

  useEffect(() => {
    if (publicPage) {
      setLoaded(true);
      return;
    }
    let active = true;
    apiFetch<MeResponse>("/api/v1/auth/me")
      .then((data) => {
        if (active) setMe(data);
      })
      .catch((error) => {
        if (active) setMe(null);
        if (error instanceof ClientApiError && error.status === 401)
          router.replace("/login");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [pathname, publicPage]);

  useEffect(() => {
    if (publicPage) return;
    const refreshProfile = () => {
      void apiFetch<MeResponse>("/api/v1/auth/me")
        .then(setMe)
        .catch(() => undefined);
    };
    window.addEventListener("cnpaf-profile-updated", refreshProfile);
    return () =>
      window.removeEventListener("cnpaf-profile-updated", refreshProfile);
  }, [publicPage]);

  const permissions = useMemo(
    () => new Set(me?.permissions ?? me?.capabilities ?? []),
    [me],
  );
  const visibleNav = useMemo(
    () =>
      navItems.filter(
        (item) =>
          !item.permissions?.length ||
          item.permissions.some((permission) => permissions.has(permission)),
      ),
    [permissions],
  );
  const canReview = permissions.has("review.view");
  const mobileNav = visibleNav.filter((item) =>
    [
      "/dashboard",
      "/tasks",
      canReview ? "/review" : "/records",
      "/more",
    ].includes(item.href),
  );
  const primaryRole = me?.roles[0];
  const workSurface = workSurfaceForRole(primaryRole?.key);
  const routeSection = pathname.split("/")[1] || "dashboard";
  const roleLabel = primaryRole
    ? locale === "zh"
      ? primaryRole.nameZh
      : primaryRole.nameEn
    : locale === "zh"
      ? "成员"
      : "Member";
  const parentRoute = pathname === "/dashboard"
    ? null
    : parentRoutes.find((route) => route.match(pathname)) ?? null;

  function isActive(item: NavItem) {
    const paths = [item.href, ...(item.aliases ?? [])];
    return paths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    );
  }

  async function logout() {
    await apiFetch<void>("/api/v1/auth/logout", { method: "POST" }).catch(
      () => undefined,
    );
    router.replace("/login");
    router.refresh();
  }

  if (publicPage) return <main className="public-shell">{children}</main>;
  if (me?.user.mustChangePassword)
    return <PasswordChangeGate locale={locale} />;

  return (
    <div
      className={`app-frame work-surface-${workSurface}`}
      data-role-key={primaryRole?.key ?? "member"}
      data-route-section={routeSection}
      data-work-surface={workSurface}
    >
      <aside
        className="app-sidebar"
        aria-label={locale === "zh" ? "主导航" : "Primary navigation"}
      >
        <Link className="app-brand" href="/dashboard">
          <span className="brand-mark">
            <BrandLogo className="brand-logo-nav" label="" sizes="38px" />
          </span>
          <span>
            <span className="brand-name">CNPAF Community</span>
            <span className="brand-role">{roleLabel}</span>
          </span>
        </Link>
        <nav className="side-nav">
          {visibleNav.map((item) => (
            <Link
              className={`side-nav-link${isActive(item) ? " active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <AppIcon name={item.icon} />
              <span>{locale === "zh" ? item.labelZh : item.labelEn}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-user">
          <Link
            aria-current={pathname === "/account" ? "page" : undefined}
            className={`sidebar-user-row${pathname === "/account" ? " active" : ""}`}
            href="/account"
          >
            <span className="user-avatar">
              {me?.user.avatarUrl ? (
                <Image
                  alt=""
                  className="user-avatar-image"
                  height={34}
                  src={me.user.avatarUrl}
                  unoptimized
                  width={34}
                />
              ) : me ? (
                initials(me.user.name)
              ) : (
                "…"
              )}
            </span>
            <span className="sidebar-user-copy">
              <span className="sidebar-user-name">
                {me?.user.name ?? (loaded ? "CNPAF" : "Loading…")}
              </span>
              <span className="sidebar-user-email">{me?.user.email ?? ""}</span>
            </span>
            <AppIcon className="sidebar-account-arrow" name="arrow" />
          </Link>
          <div className="sidebar-utilities">
            <button
              className="sidebar-utility"
              onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
              type="button"
            >
              {locale === "zh" ? "EN" : "中文"}
            </button>
            <button className="sidebar-utility" onClick={logout} type="button">
              <AppIcon name="logout" />
              {locale === "zh" ? "退出" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <div className="app-content">
        <header className="mobile-app-header">
          <Link className="mobile-brand" href="/dashboard">
            <span className="brand-mark">
              <BrandLogo className="brand-logo-nav" label="" sizes="32px" />
            </span>
            <span className="mobile-brand-copy">
              <strong>CNPAF Community</strong>
              <span>{roleLabel}</span>
            </span>
          </Link>
        </header>
        <main className="app-main">
          {parentRoute ? (
            <Link className="context-back-control" href={parentRoute.href}>
              <AppIcon name="back" />
              <span>
                {locale === "zh" ? "返回" : "Back to"} {locale === "zh" ? parentRoute.labelZh : parentRoute.labelEn}
              </span>
            </Link>
          ) : null}
          {children}
        </main>
      </div>

      <nav
        className="bottom-nav"
        aria-label={locale === "zh" ? "手机导航" : "Mobile navigation"}
      >
        {mobileNav.map((item) => (
          <Link
            className={`bottom-nav-link${isActive(item) ? " active" : ""}`}
            href={item.href}
            key={item.href}
          >
            <AppIcon name={item.icon} />
            <span>{locale === "zh" ? item.labelZh : item.labelEn}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
