"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon, type AppIconName } from "./AppIcon";
import { useI18n } from "./LocaleProvider";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "amber" | "red" | "violet";
}) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

export function EmptyState({
  icon = "records",
  title,
  description,
  action,
}: {
  icon?: AppIconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <AppIcon name={icon} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  const { locale } = useI18n();
  return (
    <div
      className="loading-list"
      aria-label={locale === "zh" ? "正在加载" : "Loading"}
      aria-busy="true"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index} />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  const { locale } = useI18n();
  return (
    <div className="feedback feedback-error" role="alert">
      <div>
        <strong>{locale === "zh" ? "加载失败" : "Something went wrong"}</strong>
        <p>{message}</p>
      </div>
      {retry ? (
        <button
          className="button button-secondary button-small"
          onClick={retry}
          type="button"
        >
          {locale === "zh" ? "重试" : "Try again"}
        </button>
      ) : null}
    </div>
  );
}

export function InlineLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className="inline-link" href={href}>
      {children}
      <AppIcon name="arrow" />
    </Link>
  );
}
