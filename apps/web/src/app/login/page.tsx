"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LocaleProvider";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("volunteer@cnpaf.local");
  const [password, setPassword] = useState("cnpaf-dev-change-me");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setError("Invalid credentials");
      return;
    }
    router.push("/capture");
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h1>{t.login}</h1>
      <label>
        {t.email}
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      </label>
      <label>
        {t.password}
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </label>
      {error ? <div className="chip bad">{error}</div> : null}
      <button className="btn" type="submit">
        {t.signIn}
      </button>
      <p className="muted">
        Demo: volunteer@cnpaf.local · ops@cnpaf.local · admin@cnpaf.local
      </p>
    </form>
  );
}
