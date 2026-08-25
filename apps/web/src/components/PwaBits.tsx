"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "./LocaleProvider";
import { flushOutbox } from "@/lib/offline";

const CAPTURE_LOCK = "cnpaf.capturing";

export function ServiceWorkerRegistrar() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          sw?.addEventListener("statechange", () => {
            if (sw.state === "installed" && reg.waiting)
              setWaiting(reg.waiting);
          });
        });
      })
      .catch(() => undefined);
    if (navigator.storage?.persist)
      navigator.storage.persist().catch(() => undefined);
    const synchronize = () => {
      void flushOutbox();
    };
    if (navigator.onLine) synchronize();
    window.addEventListener("online", synchronize);
    return () => window.removeEventListener("online", synchronize);
  }, []);

  useEffect(() => {
    if (navigator.onLine && pathname !== "/login") void flushOutbox();
  }, [pathname]);

  if (!waiting || pathname === "/login") return null;
  return (
    <div className="banner update-banner">
      <div>App update available. 有新版本。</div>
      <button
        className="btn secondary"
        type="button"
        onClick={() => {
          if (sessionStorage.getItem(CAPTURE_LOCK) === "1") return;
          waiting.postMessage({ type: "SKIP_WAITING" });
          window.location.reload();
        }}
      >
        Reload when not capturing 空闲时更新
      </button>
    </div>
  );
}

export function InstallBanner() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const dismissed = localStorage.getItem("cnpaf.installDismissed");
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setShow(!standalone && !dismissed && isIos);
  }, []);
  if (!show) return null;
  return (
    <div className="banner">
      <strong>{t.installTitle}</strong>
      <p className="muted">{t.installIos}</p>
      <button
        className="btn ghost"
        type="button"
        onClick={() => {
          localStorage.setItem("cnpaf.installDismissed", "1");
          setShow(false);
        }}
      >
        OK
      </button>
    </div>
  );
}
