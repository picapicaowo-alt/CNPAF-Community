"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "./LocaleProvider";

type Me = { id: string; name: string; role: string; email: string };

export function AppChrome({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, [pathname]);

  const ops = me && (me.role === "coordinator" || me.role === "admin");
  const publicPage = pathname === "/login" || pathname.startsWith("/invite") || pathname === "/privacy";

  async function logout() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <>
      <div className="shell">
        <header className="topbar">
          <div>
            <div className="brand">{t.appName}</div>
            <div className="muted">{t.tagline}</div>
          </div>
          <div className="row">
            <button className="btn ghost" type="button" onClick={() => setLocale(locale === "zh" ? "en" : "zh")}>
              {locale === "zh" ? t.switchToEn : t.switchToZh}
            </button>
            {me && !publicPage ? (
              <button className="btn secondary" type="button" onClick={logout}>
                {t.signOut}
              </button>
            ) : null}
          </div>
        </header>
        {children}
      </div>
      {me && !publicPage ? (
        <nav className="nav">
          <Link className={pathname.startsWith("/capture") ? "active" : ""} href="/capture">
            {t.capture}
          </Link>
          <Link className={pathname.startsWith("/records") ? "active" : ""} href="/records">
            {t.myRecords}
          </Link>
          <Link className={pathname.startsWith("/account") ? "active" : ""} href="/account">
            Account
          </Link>
          {ops ? (
            <>
              <Link className={pathname === "/ops" ? "active" : ""} href="/ops">
                {t.review}
              </Link>
              <Link className={pathname.startsWith("/ops/safety") ? "active" : ""} href="/ops/safety">
                {t.safety}
              </Link>
              <Link className={pathname.startsWith("/ops/analytics") ? "active" : ""} href="/ops/analytics">
                {t.analytics}
              </Link>
            </>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
