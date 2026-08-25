"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { createInvite, listInvites } from "@/features/operations/api";
import type { InviteSummary } from "@/features/operations/types";

export default function InvitesPage() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("volunteer");
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<InviteSummary[]>([]);

  useEffect(() => {
    void listInvites().then(setRows);
  }, [token]);

  async function create() {
    const data = await createInvite(email, role);
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
