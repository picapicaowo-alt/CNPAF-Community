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

type Template = {
  id: string;
  key: string;
  templateTypeKey: string;
  status: string;
  currentPublishedVersionId?: string | null;
};
type Version = {
  id: string;
  version: number;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string | null;
  descriptionZh?: string | null;
  status: string;
};
type FormCard = { template: Template; versions: Version[] };

export default function FormsPage() {
  const { locale } = useI18n();
  const [forms, setForms] = useState<FormCard[]>([]);
  const [query, setQuery] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [me, list] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        apiFetch<{ templates: Template[] }>("/api/v1/templates"),
      ]);
      setPermissions(me.permissions ?? []);
      setForms(
        await Promise.all(
          (list.templates ?? []).map((template) =>
            apiFetch<FormCard>(`/api/v1/templates/${template.id}`),
          ),
        ),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const visible = useMemo(
    () =>
      forms.filter(({ template, versions }) => {
        const value = query.trim().toLocaleLowerCase();
        return (
          !value ||
          [
            template.key,
            template.templateTypeKey,
            ...versions.flatMap((version) => [version.nameEn, version.nameZh]),
          ].some((part) => part?.toLocaleLowerCase().includes(value))
        );
      }),
    [forms, query],
  );
  const canCreate = permissions.includes("templates.create");

  return (
    <div className="stack">
      <PageHeader
        title={locale === "zh" ? "表单" : "Forms"}
        description={
          locale === "zh"
            ? "创建和编辑采集员实际填写的内容。"
            : "Create and edit exactly what collectors will fill out."
        }
        actions={
          canCreate ? (
            <Link className="button" href="/forms/new">
              <AppIcon name="plus" />
              {locale === "zh" ? "新建表单" : "New form"}
            </Link>
          ) : undefined
        }
      />
      <div className="search-control">
        <AppIcon name="search" />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            locale === "zh"
              ? "按名称或类型搜索表单…"
              : "Search forms by name or type…"
          }
          value={query}
        />
      </div>
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="grid-3">
          {visible.map(({ template, versions }) => {
            const current =
              versions.find(
                (version) => version.id === template.currentPublishedVersionId,
              ) ?? versions[0];
            return (
              <article className="card stack-sm" key={template.id}>
                <div className="row-between">
                  <StatusPill tone="blue">
                    {template.templateTypeKey}
                  </StatusPill>
                  <StatusPill
                    tone={current?.status === "published" ? "green" : "amber"}
                  >
                    {current?.status ?? template.status}
                  </StatusPill>
                </div>
                <h2>
                  {current
                    ? locale === "zh"
                      ? current.nameZh
                      : current.nameEn
                    : template.key}
                </h2>
                <p className="muted">
                  {current
                    ? locale === "zh"
                      ? current.descriptionZh
                      : current.descriptionEn
                    : null}
                </p>
                <div className="row">
                  <Link className="inline-link" href={`/forms/${template.id}`}>
                    {locale === "zh" ? "编辑" : "Edit"}
                    <AppIcon name="arrow" />
                  </Link>
                  <Link
                    className="inline-link"
                    href={`/forms/${template.id}?preview=1`}
                  >
                    {locale === "zh" ? "预览" : "Preview"}
                    <AppIcon name="arrow" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="forms"
          title={locale === "zh" ? "没有表单" : "No forms found"}
          description={
            locale === "zh"
              ? "创建第一个版本化采集表单。"
              : "Create the first versioned collection form."
          }
        />
      )}
    </div>
  );
}
