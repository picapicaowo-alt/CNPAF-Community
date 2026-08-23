"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./LocaleProvider";

const CAPTURE_LOCK = "cnpaf.capturing";

export function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      if (reg.waiting) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed" && reg.waiting) setWaiting(reg.waiting);
        });
      });
    });
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => undefined);
  }, []);

  if (!waiting) return null;
  return (
    <div className="banner" style={{ marginBottom: 12 }}>
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
