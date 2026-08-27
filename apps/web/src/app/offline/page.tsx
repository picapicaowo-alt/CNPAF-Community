"use client";

import { useI18n } from "@/components/LocaleProvider";

export default function OfflinePage() {
  const { locale } = useI18n();
  return (
    <section className="auth-page">
      <div className="auth-form-panel">
        <div className="card auth-card stack">
          <div>
            <div className="eyebrow">{locale === "zh" ? "本地服务不可用" : "Local service unavailable"}</div>
            <h1>{locale === "zh" ? "本地服务未运行" : "The local service is not running"}</h1>
          </div>
          <p className="muted">
            {locale === "zh" ? "当前页面需要连接 CNPAF 本地服务。请先启动服务，然后重试。" : "This page needs the local CNPAF service. Start the service, then try again."}
          </p>
          <button className="button button-wide" onClick={() => window.location.reload()} type="button">
            {locale === "zh" ? "重新连接" : "Retry"}
          </button>
        </div>
      </div>
    </section>
  );
}
