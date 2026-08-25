"use client";

export default function OfflinePage() {
  return (
    <section className="auth-page">
      <div className="auth-form-panel">
        <div className="card auth-card stack">
          <div>
            <div className="eyebrow">Local service unavailable</div>
            <h1>localhost 服务未运行</h1>
          </div>
          <p className="muted">
            当前页面需要连接 CNPAF 本地服务。请先启动服务，然后重试。
          </p>
          <button className="button button-wide" onClick={() => window.location.reload()} type="button">
            重新连接 / Retry
          </button>
        </div>
      </div>
    </section>
  );
}
