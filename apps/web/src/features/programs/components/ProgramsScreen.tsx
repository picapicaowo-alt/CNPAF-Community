"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  addProgramMembers,
  createProgram,
  getProgram,
  listMembershipRoles,
  listProgramPeople,
  listPrograms,
  removeProgramMember,
  transitionProgram,
  updateProgramDetails,
} from "../api";
import {
  EMPTY_PROGRAM_DRAFT,
  latestActiveMembershipRoles,
  programKeyFrom,
} from "../model";
import type {
  PersonChoice,
  Program,
  ProgramBundle,
  ProgramDetailsDraft,
  ProgramDraft,
} from "../types";
import { ProgramCreateForm } from "./ProgramCreateForm";
import { ProgramEditForm } from "./ProgramEditForm";
import { ProgramMembersPanel } from "./ProgramMembersPanel";

export function ProgramsScreen() {
  const { locale } = useI18n();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [people, setPeople] = useState<PersonChoice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<ProgramBundle | null>(null);
  const [roleItems, setRoleItems] = useState<
    Awaited<ReturnType<typeof listMembershipRoles>>["items"]
  >([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProgramDraft>(EMPTY_PROGRAM_DRAFT);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProgram = useCallback(async (programId: string) => {
    if (!programId) {
      setSelected(null);
      return;
    }
    setSelected(await getProgram(programId));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const me = await apiFetch<{
        user: { organizationId?: string | null };
        permissions: string[];
      }>("/api/v1/auth/me");
      const canSeePeople = me.permissions.some((permission) =>
        ["people.view", "users.view"].includes(permission),
      );
      const [programResult, peopleResult, roleResult] = await Promise.all([
        listPrograms(),
        canSeePeople ? listProgramPeople() : Promise.resolve({ users: [] }),
        listMembershipRoles(),
      ]);
      setPermissions(me.permissions ?? []);
      setOrganizationId(me.user.organizationId ?? null);
      setPrograms(programResult.programs ?? []);
      setPeople(peopleResult.users ?? []);
      setRoleItems(roleResult.items ?? []);
      const nextId = programResult.programs.some(
        (program) => program.id === selectedId,
      )
        ? selectedId
        : (programResult.programs[0]?.id ?? "");
      setSelectedId(nextId);
      await loadProgram(nextId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [loadProgram, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = useMemo(
    () => latestActiveMembershipRoles(roleItems),
    [roleItems],
  );
  const canManage = permissions.includes("programs.manage");
  const canManageMembers = permissions.includes("programs.manage_membership");

  async function selectProgram(programId: string) {
    setSelectedId(programId);
    setEditing(false);
    setLoading(true);
    setError("");
    try {
      await loadProgram(programId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function create() {
    if (!organizationId) {
      setError(
        locale === "zh"
          ? "当前账号没有组织范围，无法创建项目。"
          : "This account has no organization scope for program creation.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const normalized = {
        ...draft,
        key: programKeyFrom(draft.key || draft.nameEn),
      };
      const result = await createProgram(organizationId, normalized);
      setDraft(EMPTY_PROGRAM_DRAFT);
      setShowCreate(false);
      await load();
      setSelectedId(result.program.id);
      await loadProgram(result.program.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function addMember(userIds: string[], roleKey: string) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await addProgramMembers(selected.program.id, userIds, roleKey);
      await loadProgram(selected.program.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(membershipId: string) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await removeProgramMember(selected.program.id, membershipId);
      await loadProgram(selected.program.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: "completed" | "archived") {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await transitionProgram(selected.program.id, status);
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function saveDetails(details: ProgramDetailsDraft) {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const result = await updateProgramDetails(selected.program.id, details);
      setPrograms((current) =>
        current.map((program) =>
          program.id === result.program.id ? result.program : program,
        ),
      );
      setSelected((current) =>
        current ? { ...current, program: result.program } : current,
      );
      setEditing(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "项目" : "Programs"}
        description={
          locale === "zh"
            ? "先建立项目与有效成员，再创建和分配采集任务。"
            : "Set up programs and active members before creating collection tasks."
        }
        actions={
          canManage ? (
            <button
              className="button"
              onClick={() => setShowCreate((current) => !current)}
              type="button"
            >
              <AppIcon name={showCreate ? "close" : "plus"} />
              {showCreate
                ? locale === "zh"
                  ? "关闭"
                  : "Close"
                : locale === "zh"
                  ? "新建项目"
                  : "New program"}
            </button>
          ) : undefined
        }
      />
      {error ? <ErrorState message={error} retry={load} /> : null}
      {showCreate ? (
        <ProgramCreateForm
          draft={draft}
          locale={locale}
          onCancel={() => setShowCreate(false)}
          onChange={setDraft}
          onSubmit={create}
          saving={saving}
        />
      ) : null}
      {loading && !programs.length ? (
        <LoadingState rows={6} />
      ) : programs.length ? (
        <div className="editor-layout">
          <aside className="editor-sidebar">
            <section className="card stack-sm">
              <h2>{locale === "zh" ? "项目列表" : "Programs"}</h2>
              <div className="section-picker">
                {programs.map((program) => (
                  <button
                    className={program.id === selectedId ? "active" : ""}
                    key={program.id}
                    onClick={() => void selectProgram(program.id)}
                    type="button"
                  >
                    <span>
                      {locale === "zh" ? program.nameZh : program.nameEn}
                    </span>
                    <StatusPill
                      tone={program.status === "active" ? "green" : "neutral"}
                    >
                      {programStatusLabel(program.status, locale)}
                    </StatusPill>
                  </button>
                ))}
              </div>
            </section>
          </aside>
          <main className="stack">
            {loading && !selected ? <LoadingState rows={4} /> : null}
            {selected ? (
              <>
                <section className="card stack-sm">
                  <div className="row-between mobile-stack">
                    <div>
                      <div
                        className="caption"
                        title={
                          locale === "zh"
                            ? "内部稳定标识用于保持任务、审计和导出引用，不随项目名称改变。"
                            : "This internal key keeps task, audit, and export references stable when names change."
                        }
                      >
                        {locale === "zh" ? "内部标识" : "Internal key"}: {selected.program.key}
                      </div>
                      <h2>
                        {locale === "zh"
                          ? selected.program.nameZh
                          : selected.program.nameEn}
                      </h2>
                      {(locale === "zh"
                        ? selected.program.descriptionZh
                        : selected.program.descriptionEn) ? (
                        <p className="muted">
                          {locale === "zh"
                            ? selected.program.descriptionZh
                            : selected.program.descriptionEn}
                        </p>
                      ) : null}
                    </div>
                    <div className="row">
                      <StatusPill
                        tone={
                          selected.program.status === "active"
                            ? "green"
                            : "neutral"
                        }
                      >
                        {programStatusLabel(selected.program.status, locale)}
                      </StatusPill>
                      {canManage && selected.program.status !== "archived" ? (
                        <button
                          className="button button-secondary button-small"
                          disabled={saving}
                          onClick={() => setEditing((current) => !current)}
                          type="button"
                        >
                          {editing
                            ? locale === "zh"
                              ? "收起编辑"
                              : "Close editor"
                            : locale === "zh"
                              ? "编辑项目信息"
                              : "Edit program"}
                        </button>
                      ) : null}
                      {canManage && selected.program.status === "active" ? (
                        <button
                          className="button button-secondary button-small"
                          disabled={saving}
                          onClick={() => void changeStatus("completed")}
                          type="button"
                        >
                          {locale === "zh" ? "完成项目" : "Complete"}
                        </button>
                      ) : null}
                      {canManage && selected.program.status !== "archived" ? (
                        <button
                          className="button button-ghost button-small"
                          disabled={saving}
                          onClick={() => void changeStatus("archived")}
                          type="button"
                        >
                          {locale === "zh" ? "归档" : "Archive"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {editing ? (
                    <ProgramEditForm
                      locale={locale}
                      onCancel={() => setEditing(false)}
                      onSubmit={(details) => void saveDetails(details)}
                      program={selected.program}
                      saving={saving}
                    />
                  ) : null}
                  <div className="row">
                    <Link className="button button-secondary" href="/tasks/new">
                      {locale === "zh" ? "为此项目创建任务" : "Create task"}
                    </Link>
                    <Link className="inline-link" href="/people">
                      {locale === "zh" ? "管理账号" : "Manage accounts"}
                    </Link>
                  </div>
                </section>
                <ProgramMembersPanel
                  canManage={canManageMembers}
                  locale={locale}
                  memberships={selected.memberships}
                  onAdd={addMember}
                  onRemove={removeMember}
                  people={people}
                  roles={roles}
                  saving={saving}
                />
              </>
            ) : null}
          </main>
        </div>
      ) : (
        <EmptyState
          action={
            canManage ? (
              <button
                className="button"
                onClick={() => setShowCreate(true)}
                type="button"
              >
                {locale === "zh" ? "新建项目" : "New program"}
              </button>
            ) : undefined
          }
          icon="reports"
          title={locale === "zh" ? "暂无项目" : "No programs"}
          description={
            locale === "zh"
              ? "创建项目并添加成员后，才能分配采集任务。"
              : "Create a program and add members before assigning collection tasks."
          }
        />
      )}
    </div>
  );
}

function programStatusLabel(status: Program["status"], locale: "zh" | "en") {
  if (locale === "en")
    return {
      draft: "Draft",
      active: "Active",
      completed: "Completed",
      archived: "Archived",
    }[status];
  return {
    draft: "草稿",
    active: "进行中",
    completed: "已完成",
    archived: "已归档",
  }[status];
}
