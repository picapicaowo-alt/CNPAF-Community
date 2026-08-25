"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { LoadingState, StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type PreviewSection = {
  id: string;
  labelEn: string;
  labelZh: string;
  sortOrder: number;
};

type PreviewField = {
  id: string;
  templateSectionId: string;
  fieldTypeKey: string;
  labelEn: string;
  labelZh: string;
  required: boolean;
  sortOrder: number;
};

type PreviewBundle = {
  sections: PreviewSection[];
  fields: PreviewField[];
};

export function FormPreviewPopover({
  formId,
  versionId,
  name,
  description,
  locale,
}: {
  formId: string;
  versionId: string;
  name: string;
  description: string | null;
  locale: "zh" | "en";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [bundle, setBundle] = useState<PreviewBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function togglePreview() {
    const next = !open;
    setOpen(next);
    if (!next || bundle || loading) return;
    setLoading(true);
    setError("");
    try {
      setBundle(
        await apiFetch<PreviewBundle>(`/api/v1/template-versions/${versionId}`),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  const sections = (bundle?.sections ?? []).toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const fields = bundle?.fields ?? [];
  const visibleSections = sections.slice(0, 3);
  const hiddenQuestionCount = Math.max(
    0,
    fields.length -
      visibleSections.reduce(
        (total, section) =>
          total +
          Math.min(
            3,
            fields.filter((field) => field.templateSectionId === section.id)
              .length,
          ),
        0,
      ),
  );

  return (
    <div className="form-preview-control" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="button button-secondary"
        onClick={() => void togglePreview()}
        type="button"
      >
        <AppIcon name="eye" />
        {locale === "zh" ? "预览" : "Preview"}
      </button>
      {open ? (
        <section
          aria-label={locale === "zh" ? "表单快速预览" : "Quick form preview"}
          className="form-preview-popover"
          role="dialog"
        >
          <header className="form-preview-heading">
            <span className="form-icon-tile">
              <AppIcon name="forms" />
            </span>
            <div>
              <span className="eyebrow">
                {locale === "zh" ? "快速预览" : "Quick preview"}
              </span>
              <h3>{name}</h3>
              {description ? <p>{description}</p> : null}
            </div>
            <button
              aria-label={locale === "zh" ? "关闭预览" : "Close preview"}
              className="icon-button"
              onClick={() => setOpen(false)}
              type="button"
            >
              <AppIcon name="close" />
            </button>
          </header>
          <div className="form-preview-body">
            {loading ? <LoadingState rows={3} /> : null}
            {error ? <p className="caption form-preview-error">{error}</p> : null}
            {!loading && !error && !sections.length ? (
              <div className="form-preview-empty">
                <AppIcon name="info" />
                <span>
                  {locale === "zh"
                    ? "此表单尚未添加章节。"
                    : "This form has no sections yet."}
                </span>
              </div>
            ) : null}
            {visibleSections.map((section, sectionIndex) => {
              const sectionFields = fields
                .filter((field) => field.templateSectionId === section.id)
                .toSorted((left, right) => left.sortOrder - right.sortOrder)
                .slice(0, 3);
              return (
                <div className="form-preview-section" key={section.id}>
                  <div className="form-preview-section-title">
                    <span>{sectionIndex + 1}</span>
                    <strong>
                      {locale === "zh" ? section.labelZh : section.labelEn}
                    </strong>
                  </div>
                  {sectionFields.map((field) => (
                    <div className="form-preview-question" key={field.id}>
                      <span className="form-preview-question-icon">
                        <AppIcon name="check" />
                      </span>
                      <span>
                        {locale === "zh" ? field.labelZh : field.labelEn}
                      </span>
                      {field.required ? (
                        <StatusPill tone="amber">
                          {locale === "zh" ? "必填" : "Required"}
                        </StatusPill>
                      ) : null}
                    </div>
                  ))}
                </div>
              );
            })}
            {hiddenQuestionCount ? (
              <p className="caption form-preview-more">
                + {hiddenQuestionCount} {locale === "zh" ? "个问题" : "more questions"}
              </p>
            ) : null}
          </div>
          <footer className="form-preview-footer">
            <span className="caption">
              {fields.length} {locale === "zh" ? "个问题" : "questions"} · {sections.length}{" "}
              {locale === "zh" ? "个章节" : "sections"}
            </span>
            <Link className="inline-link" href={`/forms/${formId}?preview=1`}>
              {locale === "zh" ? "打开完整预览" : "Open full preview"}
              <AppIcon name="arrow" />
            </Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
