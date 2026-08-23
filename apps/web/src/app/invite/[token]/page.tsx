"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";

export default function InvitePage() {
  const { t } = useI18n();
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/v1/invites", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, name, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    router.push("/capture");
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h1>{t.invite}</h1>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        {t.password}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      </label>
      {error ? <div className="chip bad">{error}</div> : null}
      <button className="btn" type="submit">
        {t.signIn}
      </button>
    </form>
  );
}
