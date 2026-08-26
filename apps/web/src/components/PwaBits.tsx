"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "./LocaleProvider";
import { AppIcon } from "./AppIcon";
import { BrandLogo } from "./BrandLogo";
import { flushOutbox } from "@/lib/offline";

const CAPTURE_LOCK = "cnpaf.capturing";
const INSTALL_DISMISSED = "cnpaf.installPromptDismissed.v3";
export const OPEN_INSTALL_EVENT = "cnpaf:open-install";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallEnvironment = {
  browser: "chrome" | "edge" | "firefox" | "safari" | "samsung" | "other";
  platform: "ios" | "android" | "macos" | "windows" | "other";
  mobile: boolean;
  standalone: boolean;
};

function detectInstallEnvironment(): InstallEnvironment {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const macos = !ios && /Macintosh|Mac OS X/i.test(ua);
  const windows = /Windows/i.test(ua);
  const browser = /SamsungBrowser/i.test(ua)
    ? "samsung"
    : /EdgA|EdgiOS|Edg\//i.test(ua)
      ? "edge"
      : /CriOS|Chrome|Chromium/i.test(ua)
        ? "chrome"
        : /FxiOS|Firefox/i.test(ua)
          ? "firefox"
          : /Safari/i.test(ua)
            ? "safari"
            : "other";
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return {
    browser,
    platform: ios ? "ios" : android ? "android" : macos ? "macos" : windows ? "windows" : "other",
    mobile: ios || android || /Mobile/i.test(ua),
    standalone: window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true,
  };
}

function installGuide(environment: InstallEnvironment, locale: "zh" | "en") {
  if (environment.platform === "ios") {
    return {
      title: locale === "zh" ? "在 iPhone / iPad 上安装" : "Install on iPhone / iPad",
      note: locale === "zh" ? "iOS 要求由你在系统分享菜单中确认，网页不能跳过这一步。" : "iOS requires confirmation in the system Share menu; websites cannot skip this step.",
      steps: locale === "zh"
        ? ["点浏览器工具栏里的“分享”图标。", "在操作列表中选择“添加到主屏幕”。", "确认名称后点右上角“添加”。"]
        : ["Tap the Share icon in the browser toolbar.", "Choose Add to Home Screen in the action list.", "Confirm the name, then tap Add."],
    };
  }
  if (environment.platform === "android") {
    const menu = environment.browser === "samsung"
      ? (locale === "zh" ? "菜单 → 添加页面到 → 主屏幕" : "Menu → Add page to → Home screen")
      : (locale === "zh" ? "浏览器菜单 → 安装应用 / 添加到主屏幕" : "Browser menu → Install app / Add to Home screen");
    return {
      title: locale === "zh" ? "在 Android 上安装" : "Install on Android",
      note: locale === "zh" ? "如果系统安装确认没有自动出现，可以从浏览器菜单完成。" : "If the native confirmation does not appear, install from the browser menu.",
      steps: locale === "zh" ? ["打开右上角浏览器菜单。", `选择“${menu}”。`, "在系统确认窗口中点“安装”。"] : ["Open the browser menu in the top-right.", `Choose ${menu}.`, "Tap Install in the system confirmation."],
    };
  }
  if (environment.platform === "macos" && environment.browser === "safari") {
    return {
      title: locale === "zh" ? "在 Mac Safari 上安装" : "Install from Safari on Mac",
      note: locale === "zh" ? "Safari 17 及以上版本可将网站作为应用加入程序坞。" : "Safari 17 and later can add this site to the Dock as an app.",
      steps: locale === "zh" ? ["打开 Safari 的“文件”菜单。", "选择“添加到程序坞”。", "确认名称后点“添加”。"] : ["Open Safari’s File menu.", "Choose Add to Dock.", "Confirm the name, then click Add."],
    };
  }
  if (!environment.mobile && environment.browser === "firefox") {
    return {
      title: locale === "zh" ? "Firefox 桌面版安装方式" : "Install from Firefox desktop",
      note: locale === "zh" ? "Firefox 桌面版目前不提供 PWA 原生安装，请在 Chrome / Edge 中打开；Mac 也可以使用 Safari 的“添加到程序坞”。" : "Firefox desktop does not currently provide native PWA installation. Open this site in Chrome or Edge; on Mac, Safari can also Add to Dock.",
      steps: locale === "zh" ? ["复制当前网站地址。", "在 Chrome、Edge 或 Mac Safari 中打开。", "回到“更多”，选择“安装 CNPAF Community”。"] : ["Copy the current site address.", "Open it in Chrome, Edge, or Safari on Mac.", "Return to More and choose Install CNPAF Community."],
    };
  }
  return {
    title: locale === "zh" ? "从浏览器安装" : "Install from your browser",
    note: locale === "zh" ? "也可以使用地址栏中的安装图标，或从浏览器菜单安装。" : "You can also use the install icon in the address bar or the browser menu.",
    steps: locale === "zh" ? ["打开浏览器地址栏或主菜单。", "选择“安装 CNPAF Community”。", "在系统确认窗口中点“安装”。"] : ["Open the address bar install icon or main menu.", "Choose Install CNPAF Community.", "Confirm Install in the system dialog."],
  };
}

function storageFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function setStorageFlag(key: string, value: boolean) {
  try {
    if (value) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // Installation must remain usable when storage is unavailable.
  }
}

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

  useEffect(() => {
    if (!waiting || pathname === "/login") return;
    if (sessionStorage.getItem(CAPTURE_LOCK) === "1") return;
    let reloading = false;
    const reload = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reload);
    waiting.postMessage({ type: "SKIP_WAITING" });
    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", reload);
  }, [pathname, waiting]);

  return null;
}

export function InstallBanner() {
  const { locale } = useI18n();
  const [show, setShow] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [environment, setEnvironment] = useState<InstallEnvironment | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const current = detectInstallEnvironment();
    const dismissed = storageFlag(INSTALL_DISMISSED);
    setEnvironment(current);
    if (!current.standalone && !dismissed && (current.mobile || (current.platform === "macos" && current.browser === "safari"))) {
      setShow(true);
      if (current.platform === "ios") setInstructionsOpen(true);
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      if (!dismissed) setShow(true);
    };
    const onInstalled = () => {
      setStorageFlag(INSTALL_DISMISSED, false);
      setShow(false);
      setInstallPrompt(null);
    };
    const onOpenInstall = () => {
      const next = detectInstallEnvironment();
      if (next.standalone) return;
      setStorageFlag(INSTALL_DISMISSED, false);
      setEnvironment(next);
      setShow(true);
      setInstructionsOpen(next.platform === "ios" || (next.platform === "macos" && next.browser === "safari"));
    };
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(OPEN_INSTALL_EVENT, onOpenInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpenInstall);
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
    else setInstructionsOpen(true);
  }

  function dismiss() {
    setStorageFlag(INSTALL_DISMISSED, true);
    setShow(false);
  }

  if (!show || !environment || environment.standalone) return null;
  const guide = installGuide(environment, locale);
  const platformLabel = environment.platform === "ios"
    ? "iPhone / iPad"
    : environment.platform === "android"
      ? "Android"
      : environment.platform === "macos" && environment.browser === "safari"
        ? "Mac · Safari"
        : environment.browser === "edge"
          ? "Edge"
          : environment.browser === "chrome"
            ? "Chrome"
            : locale === "zh" ? "当前浏览器" : "Current browser";
  const actionLabel = installPrompt
    ? (locale === "zh" ? "安装到此设备" : "Install on this device")
    : environment.platform === "ios"
      ? (locale === "zh" ? "查看 3 步安装" : "View 3 install steps")
      : environment.platform === "macos" && environment.browser === "safari"
        ? (locale === "zh" ? "查看添加到程序坞步骤" : "View Add to Dock steps")
        : !environment.mobile && environment.browser === "firefox"
          ? (locale === "zh" ? "查看可用安装方式" : "View available install options")
        : (locale === "zh" ? "查看浏览器安装步骤" : "View browser install steps");
  return (
    <aside
      aria-label={locale === "zh" ? "安装 CNPAF Community" : "Install CNPAF Community"}
      className={`install-prompt${instructionsOpen ? " is-guide-open" : ""}`}
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
        <span className="install-platform">{platformLabel}</span>
        <strong>{locale === "zh" ? "安装 CNPAF Community" : "Install CNPAF Community"}</strong>
        <p>
          {locale === "zh"
            ? "添加到手机桌面，获得全屏、离线草稿与更快的再次访问。"
            : "Add it to your Home Screen for full-screen access, offline drafts, and faster return visits."}
        </p>
      </div>
      <button aria-controls="cnpaf-install-guide" aria-expanded={instructionsOpen} className="button install-prompt-action" onClick={install} type="button">
        <AppIcon name={installPrompt ? "download" : environment.platform === "ios" ? "share" : "info"} />
        {actionLabel}
      </button>
      {instructionsOpen ? (
        <div className="install-instructions" id="cnpaf-install-guide" role="status">
          <div className="install-guide-heading">
            <AppIcon name={environment.platform === "ios" ? "share" : "download"} />
            <div><strong>{guide.title}</strong><p>{guide.note}</p></div>
          </div>
          <ol>
            {guide.steps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
          </ol>
        </div>
      ) : null}
    </aside>
  );
}
