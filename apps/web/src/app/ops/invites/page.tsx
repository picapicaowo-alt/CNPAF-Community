"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";

export default function InvitesPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("volunteer");
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<{ email: string; role: string; acceptedAt: string | null }[]>([]);

  useEffect(() => {
    fetch("/api/v1/invites")
      .then((r) => r.json())
      .then((d) => setRows(d.invites ?? []));
  }, [token]);

  async function create() {
    const res = await fetch("/api/v1/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await res.json();
    setToken(data.acceptPath ?? "");
  }

  return (
    <div className="stack">
      <h1>{t.invites}</h1>
      <div className="card stack">
        <label>
          {t.email}
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="volunteer">Volunteer</option>
            <option value="coordinator">Coordinator</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button className="btn" type="button" onClick={create}>
          Create invite
        </button>
        {token ? <p>Share: {token}</p> : null}
      </div>
      {rows.map((r) => (
        <div className="card" key={r.email + r.role}>
          {r.email} · {r.role} · {r.acceptedAt ? "accepted" : "pending"}
        </div>
      ))}
    </div>
  );
}
