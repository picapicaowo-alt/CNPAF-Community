"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "./LocaleProvider";
import { AppIcon } from "./AppIcon";
import { BrandLogo } from "./BrandLogo";
import { flushOutbox } from "@/lib/offline";

const CAPTURE_LOCK = "cnpaf.capturing";
const INSTALL_DISMISSED = "cnpaf.installPromptDismissed.v2";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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
  const { locale } = useI18n();
  const [show, setShow] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const iosNavigator = navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      iosNavigator.standalone === true;
    const dismissed = localStorage.getItem(INSTALL_DISMISSED) === "1";
    const mobile = /android|iphone|ipad|ipod|mobile/i.test(
      navigator.userAgent,
    );
    if (!standalone && !dismissed && mobile) setShow(true);

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (!dismissed) setShow(true);
    };
    const onInstalled = () => {
      localStorage.removeItem(INSTALL_DISMISSED);
      setShow(false);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setInstructionsOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setShow(false);
  }

  function dismiss() {
    localStorage.setItem(INSTALL_DISMISSED, "1");
    setShow(false);
  }

  if (!show) return null;
  return (
    <aside
      aria-label={locale === "zh" ? "安装 CNPAF Community" : "Install CNPAF Community"}
      className="install-prompt"
    >
      <button
        aria-label={locale === "zh" ? "关闭安装提示" : "Close install prompt"}
        className="install-prompt-close"
        onClick={dismiss}
        type="button"
      >
        <AppIcon name="close" />
      </button>
      <span className="install-prompt-logo">
        <BrandLogo label="" sizes="48px" />
      </span>
      <div className="install-prompt-copy">
        <strong>CNPAF Community</strong>
        <p>
          {locale === "zh"
            ? "添加到手机桌面，获得全屏、离线草稿与更快的再次访问。"
            : "Add it to your Home Screen for full-screen access, offline drafts, and faster return visits."}
        </p>
      </div>
      <button className="button install-prompt-action" onClick={install} type="button">
        <AppIcon name="download" />
        Download app
      </button>
      {instructionsOpen ? (
        <div className="install-instructions" role="status">
          <strong>
            {locale === "zh" ? "添加到主屏幕" : "Add to Home Screen"}
          </strong>
          <p>
            {locale === "zh"
              ? "iPhone / iPad：在 Safari 点“分享”，选择“添加到主屏幕”，再点“添加”。Android：打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。"
              : "iPhone / iPad: tap Share in Safari, choose Add to Home Screen, then tap Add. Android: open the browser menu and choose Install app or Add to Home Screen."}
          </p>
        </div>
      ) : null}
    </aside>
  );
}
