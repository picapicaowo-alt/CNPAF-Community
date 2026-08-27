"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type NotificationTemplate = {
  kindKey: string;
  labelEn: string;
  labelZh: string;
  descriptionEn: string;
  descriptionZh: string;
  variables: readonly string[];
  titleTemplate: string;
  bodyTemplate: string;
  emailSubjectTemplate: string;
  actionLabelTemplate: string;
  defaultTitleTemplate: string;
  defaultBodyTemplate: string;
  defaultEmailSubjectTemplate: string;
  defaultActionLabelTemplate: string;
  status: "active" | "archived";
  customized: boolean;
  updatedAt: string | null;
};

export default function NotificationSettingsPage() {
  const { locale } = useI18n();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    apiFetch<{ templates: NotificationTemplate[] }>("/api/v1/admin/notification-templates")
      .then((result) => setTemplates(result.templates))
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, []);

  function update(kindKey: string, changes: Partial<NotificationTemplate>) {
    setTemplates((current) => current.map((item) => item.kindKey === kindKey ? { ...item, ...changes } : item));
    setSaved("");
  }

  function restoreDefaults(item: NotificationTemplate) {
    update(item.kindKey, {
      titleTemplate: item.defaultTitleTemplate,
      bodyTemplate: item.defaultBodyTemplate,
      emailSubjectTemplate: item.defaultEmailSubjectTemplate,
      actionLabelTemplate: item.defaultActionLabelTemplate,
      status: "active",
    });
  }

  async function save(item: NotificationTemplate) {
    setSaving(item.kindKey);
    setSaved("");
    setError("");
    try {
      await apiFetch("/api/v1/admin/notification-templates", {
        method: "PUT",
        body: JSON.stringify({
          kindKey: item.kindKey,
          titleTemplate: item.titleTemplate,
          bodyTemplate: item.bodyTemplate,
          emailSubjectTemplate: item.emailSubjectTemplate,
          actionLabelTemplate: item.actionLabelTemplate,
          status: item.status,
        }),
      });
      update(item.kindKey, { customized: true, updatedAt: new Date().toISOString() });
      setSaved(item.kindKey);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="stack notification-settings-page">
      <PageHeader
        eyebrow={locale === "zh" ? "系统管理" : "Administration"}
        title={locale === "zh" ? "通知管理" : "Notification management"}
        description={locale === "zh"
          ? "自定义每种系统事件的站内通知与英文邮件。模板按当前 organization 保存。"
          : "Customize in-app notifications and default English emails for each system event. Templates are saved per organization."}
        actions={<Link className="button button-secondary" href="/more"><AppIcon name="back" />{locale === "zh" ? "返回" : "Back"}</Link>}
      />
      <section className="card card-compact notification-overview">
        <div>
          <strong>{locale === "zh" ? "发送渠道" : "Delivery channels"}</strong>
          <p className="muted">{locale === "zh" ? "站内通知 + notifications@cnpaf.org 邮件" : "In-app notification + email from notifications@cnpaf.org"}</p>
        </div>
        <span className="status-pill status-blue">{locale === "zh" ? "默认英文邮件" : "English by default"}</span>
      </section>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState /> : (
        <div className="notification-template-list">
          {templates.map((item, index) => (
            <details className="settings-accordion notification-template-card" key={item.kindKey} open={index === 0}>
              <summary>
                <span>
                  {locale === "zh" ? item.labelZh : item.labelEn}
                  <span className={`status-pill ${item.status === "active" && item.customized ? "status-green" : ""}`}>
                    {item.status === "active" && item.customized
                      ? (locale === "zh" ? "自定义" : "Custom")
                      : (locale === "zh" ? "系统默认" : "System default")}
                  </span>
                </span>
                <span className="caption">{locale === "zh" ? item.descriptionZh : item.descriptionEn}</span>
              </summary>
              <div className="settings-accordion-body stack">
                <div className="notification-variable-row" aria-label={locale === "zh" ? "可用变量" : "Available variables"}>
                  <span className="caption">{locale === "zh" ? "可用变量" : "Variables"}</span>
                  {item.variables.map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}
                </div>
                <div className="form-grid">
                  <label>
                    {locale === "zh" ? "站内通知标题" : "In-app title"}
                    <input onChange={(event) => update(item.kindKey, { titleTemplate: event.target.value })} value={item.titleTemplate} />
                  </label>
                  <label>
                    {locale === "zh" ? "邮件主题" : "Email subject"}
                    <input onChange={(event) => update(item.kindKey, { emailSubjectTemplate: event.target.value })} value={item.emailSubjectTemplate} />
                  </label>
                </div>
                <label>
                  {locale === "zh" ? "通知正文 / 邮件内容" : "Notification and email message"}
                  <textarea onChange={(event) => update(item.kindKey, { bodyTemplate: event.target.value })} rows={4} value={item.bodyTemplate} />
                </label>
                <div className="form-grid">
                  <label>
                    {locale === "zh" ? "操作按钮文字" : "Action button label"}
                    <input onChange={(event) => update(item.kindKey, { actionLabelTemplate: event.target.value })} value={item.actionLabelTemplate} />
                  </label>
                  <label>
                    {locale === "zh" ? "事件状态" : "Event status"}
                    <select onChange={(event) => update(item.kindKey, { status: event.target.value as NotificationTemplate["status"] })} value={item.status}>
                      <option value="active">{locale === "zh" ? "使用当前自定义内容" : "Use this custom content"}</option>
                      <option value="archived">{locale === "zh" ? "使用系统默认内容" : "Use system default content"}</option>
                    </select>
                  </label>
                </div>
                <div className="row-between notification-template-actions">
                  <button className="button button-ghost" onClick={() => restoreDefaults(item)} type="button">
                    {locale === "zh" ? "恢复默认内容" : "Restore default content"}
                  </button>
                  <div className="row">
                    {saved === item.kindKey ? <span className="caption" role="status">{locale === "zh" ? "已保存" : "Saved"}</span> : null}
                    <button className="button" disabled={saving === item.kindKey} onClick={() => save(item)} type="button">
                      {saving === item.kindKey ? (locale === "zh" ? "正在保存…" : "Saving…") : (locale === "zh" ? "保存模板" : "Save template")}
                    </button>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
