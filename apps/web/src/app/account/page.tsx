"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { PasswordField } from "@/components/PasswordField";
import { ErrorState, PageHeader, StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type MeResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    locale: string;
    avatarUrl: string | null;
    passwordChangedAt: string | null;
    mustChangePassword: boolean;
  };
  roles: Array<{ nameEn: string; nameZh: string }>;
};

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "C"
  );
}

export default function AccountPage() {
  const { locale } = useI18n();
  const [exported, setExported] = useState("");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => {
    apiFetch<MeResponse>("/api/v1/auth/me")
      .then(setMe)
      .catch((caught) => setError(errorMessage(caught)));
  }, []);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview("");
      return;
    }
    const preview = URL.createObjectURL(avatarFile);
    setAvatarPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [avatarFile]);

  async function uploadAvatar(event: React.FormEvent) {
    event.preventDefault();
    if (!avatarFile) return;
    setAvatarSaving(true);
    setAvatarFeedback("");
    setError("");
    try {
      const body = new FormData();
      body.set("avatar", avatarFile);
      const result = await apiFetch<{ avatarUrl: string }>(
        "/api/v1/account/avatar",
        { method: "POST", body },
      );
      setMe((current) =>
        current
          ? { ...current, user: { ...current.user, avatarUrl: result.avatarUrl } }
          : current,
      );
      setAvatarFile(null);
      setAvatarFeedback(
        locale === "zh" ? "头像已更新。" : "Profile photo updated.",
      );
      window.dispatchEvent(new Event("cnpaf-profile-updated"));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setAvatarSaving(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError(
        locale === "zh"
          ? "两次输入的新密码不一致。"
          : "The new passwords do not match.",
      );
      return;
    }
    setPasswordSaving(true);
    try {
      await apiFetch("/api/v1/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      window.location.href = "/login";
    } catch (caught) {
      setPasswordError(errorMessage(caught));
      setPasswordSaving(false);
    }
  }

  async function exp() {
    try {
      setExported(JSON.stringify(await apiFetch("/api/v1/account"), null, 2));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function del() {
    if (
      !confirm(
        locale === "zh"
          ? "确定删除此账号？此操作无法撤销。"
          : "Delete this account? This cannot be undone.",
      )
    )
      return;
    await apiFetch("/api/v1/account", { method: "DELETE" });
    window.location.href = "/login";
  }

  const avatarSrc = avatarPreview || me?.user.avatarUrl;
  return (
    <div className="stack account-page">
      <PageHeader
        title={locale === "zh" ? "账号设置" : "Account settings"}
        description={
          locale === "zh"
            ? "管理头像、个人资料、登录密码与个人数据。"
            : "Manage your photo, profile, sign-in password, and personal data."
        }
      />
      {error ? <ErrorState message={error} /> : null}

      <div className="account-settings-grid">
        <section className="card stack">
          <div>
            <div className="eyebrow">
              {locale === "zh" ? "个人资料" : "Profile"}
            </div>
            <h2>{locale === "zh" ? "头像与基本信息" : "Photo and details"}</h2>
            <p className="muted">
              {locale === "zh"
                ? "头像会显示在左下角账号入口。支持 JPG、PNG、WebP，最大 5 MB。"
                : "Your photo appears in the account entry at bottom left. JPG, PNG, or WebP up to 5 MB."}
            </p>
          </div>

          <form className="account-avatar-editor" onSubmit={uploadAvatar}>
            <span className="account-avatar" aria-hidden="true">
              {avatarSrc ? (
                <Image
                  alt=""
                  className="account-avatar-image"
                  height={96}
                  src={avatarSrc}
                  unoptimized
                  width={96}
                />
              ) : (
                initials(me?.user.name ?? "CNPAF")
              )}
            </span>
            <div className="stack-sm account-avatar-actions">
              <label className="button button-secondary button-small account-file-button">
                <AppIcon name="plus" />
                {locale === "zh" ? "选择新头像" : "Choose new photo"}
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    setAvatarFile(event.target.files?.[0] ?? null);
                    setAvatarFeedback("");
                  }}
                  type="file"
                />
              </label>
              {avatarFile ? (
                <span className="caption account-file-name">
                  {avatarFile.name} · {(avatarFile.size / 1024 / 1024).toFixed(1)} MB
                </span>
              ) : null}
              <button
                className="button button-small"
                disabled={!avatarFile || avatarSaving || avatarFile.size > 5 * 1024 * 1024}
                type="submit"
              >
                {avatarSaving
                  ? locale === "zh"
                    ? "正在上传…"
                    : "Uploading…"
                  : locale === "zh"
                    ? "保存头像"
                    : "Save photo"}
              </button>
              {avatarFeedback ? (
                <span className="caption success-text" role="status">
                  {avatarFeedback}
                </span>
              ) : null}
            </div>
          </form>

          <dl className="definition-list">
            <div className="definition-row">
              <dt>{locale === "zh" ? "姓名" : "Name"}</dt>
              <dd>{me?.user.name ?? "—"}</dd>
            </div>
            <div className="definition-row">
              <dt>{locale === "zh" ? "邮箱" : "Email"}</dt>
              <dd>{me?.user.email ?? "—"}</dd>
            </div>
            <div className="definition-row">
              <dt>{locale === "zh" ? "角色" : "Role"}</dt>
              <dd>
                {me?.roles
                  .map((role) => (locale === "zh" ? role.nameZh : role.nameEn))
                  .join(", ") || "—"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="card stack account-security-card">
          <div className="row-between">
            <div>
              <div className="eyebrow">
                {locale === "zh" ? "登录安全" : "Sign-in security"}
              </div>
              <h2>{locale === "zh" ? "修改密码" : "Change password"}</h2>
            </div>
            <StatusPill tone="green">
              {locale === "zh" ? "安全哈希存储" : "Securely hashed"}
            </StatusPill>
          </div>
          <div className="feedback feedback-info account-security-note">
            <span>
              <strong>
                {locale === "zh"
                  ? "管理员无法查看你的密码。"
                  : "Administrators cannot view your password."}
              </strong>
              <span>
                {locale === "zh"
                  ? "忘记密码时，管理员只能生成一次性临时密码；你登录后必须立即改成自己的密码。"
                  : "If you forget it, an administrator can only issue a one-time temporary password that you must change after signing in."}
              </span>
            </span>
          </div>
          <form className="stack-sm" onSubmit={changePassword}>
            <PasswordField
              autoComplete="current-password"
              label={locale === "zh" ? "当前密码" : "Current password"}
              minLength={8}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              value={currentPassword}
            />
            <div className="form-grid">
              <PasswordField
                autoComplete="new-password"
                label={locale === "zh" ? "新密码" : "New password"}
                minLength={12}
                onChange={(event) => setNewPassword(event.target.value)}
                required
                value={newPassword}
              />
              <PasswordField
                autoComplete="new-password"
                label={locale === "zh" ? "确认新密码" : "Confirm new password"}
                minLength={12}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                value={confirmPassword}
              />
            </div>
            <span className="caption">
              {locale === "zh"
                ? "至少 12 个字符。保存后会退出所有设备，需要重新登录。"
                : "At least 12 characters. Saving signs you out on every device."}
            </span>
            {passwordError ? (
              <div className="feedback feedback-error" role="alert">
                {passwordError}
              </div>
            ) : null}
            <button
              className="button account-password-submit"
              disabled={
                passwordSaving ||
                currentPassword.length < 8 ||
                newPassword.length < 12 ||
                newPassword !== confirmPassword
              }
              type="submit"
            >
              {passwordSaving
                ? locale === "zh"
                  ? "正在保存…"
                  : "Saving…"
                : locale === "zh"
                  ? "更新密码并重新登录"
                  : "Update password and sign in again"}
            </button>
          </form>
          <p className="caption account-password-date">
            {me?.user.passwordChangedAt
              ? `${locale === "zh" ? "上次修改：" : "Last changed: "}${new Date(
                  me.user.passwordChangedAt,
                ).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}`
              : locale === "zh"
                ? "尚无个人密码修改记录"
                : "No personal password change recorded"}
          </p>
        </section>
      </div>

      <section className="card card-compact account-data-actions">
        <div>
          <h2>{locale === "zh" ? "隐私与个人数据" : "Privacy and personal data"}</h2>
          <p className="muted">
            {locale === "zh"
              ? "查看数据处理方式、下载个人数据副本，或删除账号。"
              : "Review data handling, download a personal copy, or delete your account."}
          </p>
        </div>
        <div className="row account-data-buttons">
          <Link className="button button-secondary" href="/privacy">
            {locale === "zh" ? "隐私政策" : "Privacy policy"}
            <AppIcon name="arrow" />
          </Link>
          <button className="button button-secondary" onClick={exp} type="button">
            <AppIcon name="download" />
            {locale === "zh" ? "导出我的数据" : "Export my data"}
          </button>
          <button className="button button-danger" onClick={del} type="button">
            {locale === "zh" ? "删除账号" : "Delete account"}
          </button>
        </div>
      </section>

      {exported ? (
        <section className="card stack-sm">
          <div className="row-between">
            <h2>{locale === "zh" ? "数据副本" : "Data copy"}</h2>
            <button
              className="button button-ghost button-small"
              onClick={() => setExported("")}
              type="button"
            >
              {locale === "zh" ? "关闭" : "Close"}
            </button>
          </div>
          <pre className="code-preview">{exported}</pre>
        </section>
      ) : null}
    </div>
  );
}
