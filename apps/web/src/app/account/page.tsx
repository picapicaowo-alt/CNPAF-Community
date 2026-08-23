"use client";

import { useState } from "react";

export default function AccountPage() {
  const [exported, setExported] = useState("");
  async function exp() {
    const data = await fetch("/api/v1/account").then((r) => r.json());
    setExported(JSON.stringify(data, null, 2));
  }
  async function del() {
    if (!confirm("Delete this account?")) return;
    await fetch("/api/v1/account", { method: "DELETE" });
    window.location.href = "/login";
  }
  return (
    <div className="stack">
      <h1>Account 账号</h1>
      <a className="btn secondary" href="/privacy">
        Privacy policy 隐私政策
      </a>
      <button className="btn secondary" type="button" onClick={exp}>
        Export my data 导出
      </button>
      <button className="btn danger" type="button" onClick={del}>
        Delete account 删除账号
      </button>
      {exported ? <pre className="card">{exported}</pre> : null}
    </div>
  );
}
